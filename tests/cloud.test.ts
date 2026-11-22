import { describe, expect, it, vi } from 'vitest'
import { CloudJournal } from '../src/services/cloud'
import { ownerEmail, ownerUsername, testEmail } from '../src/services/config'
import { blankEntry, keys, type Journal } from '../src/domain/journal'

function storage(): Storage {
  const values = new Map<string, string>()
  return {
    get length() { return values.size },
    clear: () => values.clear(),
    getItem: key => values.get(key) ?? null,
    key: index => [...values.keys()][index] ?? null,
    removeItem: key => { values.delete(key) },
    setItem: (key, value) => { values.set(key, value) },
  }
}
const session = { user: { email: ownerEmail, id: 'fake-id' }, access_token: 'fake-access',
  refresh_token: 'fake-refresh', expires_at: Date.now() / 1000 + 3600 }
const day = '2024-02-29'
const otherDay = '2024-03-01'
const entry = (notes: string) => ({ ...blankEntry(), notes })
const initial: Journal = { start: day, target: 48, entries: { [day]: entry('initial') } }

describe('cloud journal sync', () => {
  it('isolates offline journals when switching between emails on one device', async () => {
    const local = storage()
    const sessions = storage()
    local.setItem(keys.journal, JSON.stringify(initial))
    const isolated = { ...session, user: { id: 'test-id', email: testEmail } }
    const request: typeof fetch = async (input, options) => {
      const url = new URL(String(input))
      if (url.pathname.endsWith('/token')) {
        const { email } = JSON.parse(String(options?.body))
        return Response.json(email === testEmail ? isolated : session)
      }
      if (url.pathname.endsWith('/logout')) return new Response(null, { status: 204 })
      if (options?.method === 'POST') return Response.json([JSON.parse(String(options.body))])
      return Response.json(url.searchParams.get('user_id') === 'eq.fake-id'
        ? [{ ...session.user, payload: initial, updated_at: new Date().toISOString() }] : [])
    }
    const controller = new CloudJournal(local, sessions, () => false, request)
    expect(await controller.login(testEmail.toUpperCase(), 'fixture-password')).toBe(true)
    expect(controller.getSnapshot().journal.entries).toEqual({})
    await vi.waitFor(() => expect(controller.getSnapshot().lastSynced).not.toBeNull())
    controller.saveEntry(day, entry('test account only'))
    await vi.waitFor(() => expect(local.getItem('routine-account:test-id:' + keys.pending)).toBeNull())
    await controller.logout(false)
    expect(await controller.login(ownerEmail, 'fixture-password')).toBe(true)
    expect(controller.getSnapshot().journal.entries[day].notes).toBe('initial')
    expect(JSON.parse(local.getItem('routine-account:test-id:' + keys.journal)!).entries[day].notes).toBe('test account only')
  })

  it('retries a compare-and-swap conflict and rebases saves made during an in-flight write', async () => {
    const local = storage()
    const sessions = storage()
    let remote = { user_id: session.user.id, updated_at: new Date().toISOString(), payload: structuredClone(initial) }
    let attempts = 0
    let rejectOnce = false
    let stall = false
    let release: (() => void) | undefined
    const request: typeof fetch = async (input, options) => {
      const url = new URL(String(input))
      if (url.pathname.endsWith('/token')) return Response.json(session)
      if (options?.method === 'PATCH') {
        attempts++
        if (rejectOnce) { rejectOnce = false; return Response.json([]) }
        expect(url.searchParams.get('updated_at')).toBe('eq.' + remote.updated_at)
        if (stall) {
          stall = false
          await new Promise<void>(resolve => { release = resolve })
        }
        remote = JSON.parse(String(options.body))
      }
      return Response.json([remote])
    }
    const confirm = vi.fn(() => false)
    const controller = new CloudJournal(local, sessions, confirm, request)
    expect(await controller.login(ownerUsername, 'fake-password')).toBe(true)
    await vi.waitFor(() => expect(local.getItem(keys.pending)).toBeNull())
    const before = attempts
    remote = { ...remote, updated_at: new Date(Date.parse(remote.updated_at) + 1).toISOString(),
      payload: { ...remote.payload, entries: { ...remote.payload.entries, [day]: entry('remote edit') } } }
    stall = true
    rejectOnce = true
    expect(controller.saveEntry(otherDay, entry('first local edit'))).toBe(true)
    await vi.waitFor(() => expect(release).toBeTypeOf('function'))
    expect(controller.saveEntry(otherDay, entry('latest local edit'))).toBe(true)
    release?.()
    await vi.waitFor(() => expect(local.getItem(keys.pending)).toBeNull())
    expect(attempts - before).toBe(3)
    expect(remote.payload.entries).toEqual({ [day]: entry('remote edit'), [otherDay]: entry('latest local edit') })
    expect(confirm).not.toHaveBeenCalled()
  })

  it('retains saved data after a failed write and flushes persisted pending state after reopening', async () => {
    const local = storage()
    const sessions = storage()
    local.setItem(keys.journal, JSON.stringify(initial))
    sessions.setItem(keys.session, JSON.stringify(session))
    let offline = true
    let remote = { user_id: session.user.id, updated_at: new Date().toISOString(), payload: structuredClone(initial) }
    const request: typeof fetch = async (_, options) => {
      if (offline) throw Error('offline')
      if (options?.method === 'PATCH') remote = JSON.parse(String(options.body))
      return Response.json([remote])
    }
    const first = new CloudJournal(local, sessions, () => true, request)
    await first.initialize()
    expect(first.getSnapshot().unlocked).toBe(true)
    expect(first.saveEntry(otherDay, entry('offline edit'))).toBe(true)
    await vi.waitFor(() => expect(first.getSnapshot().status).toContain('Cloud sync pending'))
    expect(local.getItem(keys.pending)).toBe('1')
    offline = false
    const next = new CloudJournal(local, sessions, () => true, request)
    await next.initialize()
    await vi.waitFor(() => expect(local.getItem(keys.pending)).toBeNull())
    expect(remote.payload.entries[otherDay]).toEqual(entry('offline edit'))
    expect(remote.payload.entries[day]).toEqual(initial.entries[day])
  })
})
