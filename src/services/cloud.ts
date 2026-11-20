import { isJournal, keys, readJournal, type Entry, type Journal } from '../domain/journal'
import { ownerEmail, ownerUsername, publishableKey, supabaseUrl } from './config'

interface Session {
  access_token: string
  refresh_token: string
  expires_at?: number
  user: { id: string; email: string }
}
interface Row { user_id: string; payload: Journal; updated_at: string }
interface State { journal: Journal; unlocked: boolean; busy: boolean; status: string }
type Conflict = (message: string) => boolean
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

export function mergeJournal(local: Journal, remote: Journal | undefined, base: Journal | null, confirm: Conflict): Journal {
  if (!remote) return structuredClone(local)
  const merged = structuredClone(remote)
  for (const [day, entry] of Object.entries(local.entries)) {
    const theirs = merged.entries[day]
    if (!base) {
      if (!theirs || (!equal(entry, theirs) && confirm('Different local and cloud entries for ' + day + '. Keep local version?'))) {
        merged.entries[day] = entry
      }
    } else if (!equal(entry, base.entries[day])) {
      if (!equal(theirs, base.entries[day]) && !equal(theirs, entry) &&
        !confirm('Both devices changed ' + day + '. Keep this device version?')) continue
      merged.entries[day] = entry
    }
  }
  if (base && (local.start !== base.start || local.target !== base.target)) {
    merged.start = local.start
    merged.target = local.target
  }
  return merged
}

class RequestError extends Error {
  constructor(message: string, readonly status?: number) { super(message) }
}

export class CloudJournal {
  private state: State
  private listeners = new Set<() => void>()
  private session: Session | null = null
  private base: Journal | null = null
  private pending = false
  private syncing = false
  private pulling = false
  private revision = 0
  private initialized = false
  private needsMerge = false

  constructor(
    private readonly local: Storage,
    private readonly sessions: Storage,
    private readonly confirm: Conflict,
    private readonly send: typeof fetch,
  ) {
    this.state = { journal: readJournal(local), unlocked: false, busy: false, status: '' }
    this.pending = this.read(local, keys.pending) === '1'
  }

  getSnapshot = () => this.state
  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }
  private update(patch: Partial<State>) {
    this.state = { ...this.state, ...patch }
    this.listeners.forEach(listener => listener())
  }
  private read(storage: Storage, key: string) {
    try { return storage.getItem(key) } catch { return null }
  }
  private async request<T>(path: string, method = 'GET', payload?: unknown, token?: string, prefer?: string): Promise<T> {
    const headers: Record<string, string> = { apikey: publishableKey, 'Content-Type': 'application/json' }
    if (token) headers.Authorization = 'Bearer ' + token
    if (prefer) headers.Prefer = prefer
    let response: Response
    try {
      response = await this.send(supabaseUrl + path, {
        method, headers, body: payload === undefined ? undefined : JSON.stringify(payload),
        cache: 'no-store', signal: AbortSignal.timeout(15000),
      })
    } catch { throw new RequestError('Cloud connection unavailable') }
    const raw = await response.text()
    let data
    try { data = raw ? JSON.parse(raw) : null } catch { throw new RequestError('Unexpected cloud response', response.status) }
    if (!response.ok) throw new RequestError(data?.msg || data?.message || data?.error_description || 'Request failed', response.status)
    return data as T
  }
  private remember(session: Session) {
    if (session.user?.email !== ownerEmail || !session.user.id || !session.access_token || !session.refresh_token) throw Error('Account not permitted')
    this.session = session
    try { this.sessions.setItem(keys.session, JSON.stringify(session)) } catch { /* Current tab can still use this session. */ }
  }
  private forget() {
    this.session = null
    this.base = null
    this.needsMerge = false
    try { this.sessions.removeItem(keys.session) } catch { /* Session is cleared in memory. */ }
  }
  private async auth() {
    if (!this.session) throw Error('Sign in first')
    if (!this.session.expires_at || this.session.expires_at * 1000 < Date.now() + 60000) {
      this.remember(await this.request<Session>('/auth/v1/token?grant_type=refresh_token', 'POST', { refresh_token: this.session.refresh_token }))
    }
    return this.session
  }
  private path(session: Session) { return '/rest/v1/routine_journal?user_id=eq.' + encodeURIComponent(session.user.id) }
  private async remote(session: Session) {
    const rows = await this.request<Row[]>(this.path(session) + '&select=payload,updated_at', 'GET', undefined, session.access_token)
    const row = rows[0]
    if (row && (!isJournal(row.payload) || !Number.isFinite(Date.parse(row.updated_at)))) {
      throw Error('Cloud journal has an unsupported format')
    }
    return row
  }

  initialize = async () => {
    if (this.initialized) return
    this.initialized = true
    try {
      const saved = JSON.parse(this.read(this.sessions, keys.session) ?? 'null') as Session | null
      if (!saved) return
      this.update({ busy: true })
      this.remember(saved)
      await this.unlock()
    } catch (error) {
      this.forget()
      this.update({ status: message(error) })
    } finally { this.update({ busy: false }) }
  }
  login = async (username: string, password: string) => {
    if (this.state.busy) return false
    this.update({ busy: true, status: '' })
    try {
      if (username.trim().toLowerCase() !== ownerUsername) throw Error('Invalid username or password')
      this.remember(await this.request<Session>('/auth/v1/token?grant_type=password', 'POST', { email: ownerEmail, password }))
      await this.unlock()
      return true
    } catch (error) {
      this.forget()
      this.update({ status: message(error) })
      return false
    } finally { this.update({ busy: false }) }
  }
  private async unlock() {
    try {
      const session = await this.auth()
      const row = await this.remote(session)
      this.integrate(row)
    } catch (error) {
      const cachedExpiry = (this.session?.expires_at ?? 0) * 1000
      if (!(error instanceof RequestError && error.status === undefined && cachedExpiry > Date.now())) throw error
      this.needsMerge = true
      this.update({ unlocked: true, status: 'Offline · journal available on this device' })
      return
    }
    this.update({ unlocked: true })
    this.enqueue()
  }
  private integrate(row?: Row) {
    this.base = row?.payload ?? null
    if (row) {
      const current = this.state.journal
      this.local.setItem(keys.beforeMerge, JSON.stringify(current))
      const journal = mergeJournal(current, row.payload, null, this.confirm)
      if (this.pending) {
        journal.start = current.start
        journal.target = current.target
      }
      this.local.setItem(keys.journal, JSON.stringify(journal))
      this.update({ journal })
    }
    this.needsMerge = false
  }
  saveEntry = (day: string, entry: Entry) => this.persist({
    ...this.state.journal, entries: { ...this.state.journal.entries, [day]: entry },
  })
  saveChallenge = (start: string, target: number) => this.persist({ ...this.state.journal, start, target })
  restore = (journal: Journal) => this.persist(journal)
  private persist(journal: Journal) {
    try {
      this.local.setItem(keys.journal, JSON.stringify(journal))
    } catch {
      this.update({ status: 'Storage unavailable or full. Export a backup.' })
      return false
    }
    this.update({ journal })
    this.enqueue()
    return true
  }
  private enqueue() {
    this.revision++
    this.pending = true
    try { this.local.setItem(keys.pending, '1') } catch { /* Keep the in-memory queue. */ }
    void this.sync()
  }

  sync = async () => {
    if (!this.state.unlocked || this.syncing || this.pulling || (!this.pending && !this.needsMerge)) return
    this.syncing = true
    this.update({ status: 'Syncing…' })
    try {
      let conflicts = 0
      while (this.pending || this.needsMerge) {
        const session = await this.auth()
        const old = await this.remote(session)
        if (this.needsMerge) this.integrate(old)
        const revision = this.revision
        const snapshot = this.state.journal
        const journal = mergeJournal(snapshot, old?.payload, this.base, this.confirm)
        const timestamp = Math.max(Date.now(), (Date.parse(old?.updated_at ?? '') || 0) + 1)
        const row = { user_id: session.user.id, payload: journal, updated_at: new Date(timestamp).toISOString() }
        let result: Row[] | undefined
        try {
          result = old
            ? await this.request<Row[]>(this.path(session) + '&updated_at=eq.' + encodeURIComponent(old.updated_at), 'PATCH', row, session.access_token, 'return=representation')
            : await this.request<Row[]>('/rest/v1/routine_journal', 'POST', row, session.access_token, 'return=representation')
        } catch (error) {
          if (old || !(error instanceof RequestError && error.status === 409)) throw error
        }
        if (!result?.length) {
          if (++conflicts >= 4) throw Error('Cloud journal changed during sync. Refresh to try again.')
          continue
        }
        conflicts = 0
        if (revision !== this.revision) {
          // Rebase only the edits made during the request onto the acknowledged snapshot.
          const rebased = mergeJournal(this.state.journal, journal, snapshot, () => true)
          this.base = journal
          this.local.setItem(keys.journal, JSON.stringify(rebased))
          this.update({ journal: rebased })
          continue
        }
        this.local.setItem(keys.journal, JSON.stringify(journal))
        this.local.removeItem(keys.pending)
        this.base = journal
        this.pending = false
        this.update({ journal, status: 'Saved to cloud · ' + new Date().toLocaleTimeString() })
      }
    } catch (error) {
      this.pending = true
      try { this.local.setItem(keys.pending, '1') } catch { /* Keep the in-memory queue. */ }
      this.update({ status: 'Cloud sync pending: ' + message(error) })
    } finally { this.syncing = false }
  }
  refresh = async (dirty: boolean) => {
    if (dirty || this.syncing || this.pulling) {
      this.update({ status: 'Save your changes first.' })
      return
    }
    if (this.pending || this.needsMerge) return this.sync()
    this.pulling = true
    const revision = this.revision
    try {
      const row = await this.remote(await this.auth())
      if (row && revision === this.revision) {
        this.local.setItem(keys.journal, JSON.stringify(row.payload))
        this.base = row.payload
        this.update({ journal: row.payload, status: 'Cloud journal refreshed.' })
      }
    } catch (error) { this.update({ status: message(error) }) }
    finally {
      this.pulling = false
      if (this.pending) void this.sync()
    }
  }
  logout = async (dirty: boolean) => {
    if (this.syncing || this.pulling || this.pending || dirty) {
      this.update({ status: 'Save and sync pending changes before signing out.' })
      return
    }
    const session = this.session
    this.forget()
    this.update({ unlocked: false, status: 'Signed out.' })
    try {
      if (session) await this.request('/auth/v1/logout?scope=local', 'POST', undefined, session.access_token)
    } catch { /* The local session is already cleared. */ }
  }
}

function message(error: unknown) { return error instanceof Error ? error.message : 'Unexpected cloud error' }
