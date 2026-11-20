import { isJournal, keys, readJournal, type Entry, type Journal } from '../domain/journal'
import { ownerEmail, ownerUsername, publishableKey, supabaseUrl } from './config'
import type { WatchJournal } from './realtime'

interface Session {
  access_token: string
  refresh_token: string
  expires_at?: number
  user: { id: string; email: string }
}
interface Row { user_id: string; payload: Journal; updated_at: string }
interface State {
  journal: Journal
  unlocked: boolean
  busy: boolean
  status: string
  connection: 'Live' | 'Connecting' | 'Syncing' | 'Offline'
  lastSynced: number | null
}
type Conflict = (message: string) => boolean
// Postgres JSONB can return the same object with its keys in a different order.
const canonical = (value: unknown) => JSON.stringify(value, (_, item: unknown) =>
  item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item)
const equal = (a: unknown, b: unknown) => a === b || canonical(a) === canonical(b)

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
  private online = true
  private live = false
  private mounted = false
  private unsubscribe: (() => void) | null = null
  private knownStamp = 0
  private writingStamp = 0
  private observedStamp = 0
  private refreshQueued = false
  private tokenRefresh: Promise<Session> | null = null

  constructor(
    private readonly local: Storage,
    private readonly sessions: Storage,
    private readonly confirm: Conflict,
    private readonly send: typeof fetch,
    private readonly watch?: WatchJournal,
  ) {
    this.state = { journal: readJournal(local), unlocked: false, busy: false, status: '', connection: 'Connecting', lastSynced: null }
    this.pending = this.read(local, keys.pending) === '1'
  }

  getSnapshot = () => this.state
  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }
  private update(patch: Partial<State>) {
    const connection = !this.online ? 'Offline' : this.syncing || this.pulling ? 'Syncing' : this.live ? 'Live' : 'Connecting'
    this.state = { ...this.state, ...patch, connection }
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
    this.stopWatch()
    this.session = null
    this.base = null
    this.needsMerge = false
    this.knownStamp = 0
    this.observedStamp = 0
    this.refreshQueued = false
    try { this.sessions.removeItem(keys.session) } catch { /* Session is cleared in memory. */ }
  }
  private async auth() {
    const session = this.session
    if (!session) throw Error('Sign in first')
    if (session.expires_at && session.expires_at * 1000 >= Date.now() + 60000) return session
    this.tokenRefresh ??= this.request<Session>('/auth/v1/token?grant_type=refresh_token', 'POST', { refresh_token: session.refresh_token })
      .then(next => {
        if (this.session !== session) throw Error('Session changed')
        this.remember(next)
        return next
      }).finally(() => { this.tokenRefresh = null })
    return this.tokenRefresh
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
    let row: Row | undefined
    try {
      const session = await this.auth()
      row = await this.remote(session)
      this.integrate(row)
    } catch (error) {
      const cachedExpiry = (this.session?.expires_at ?? 0) * 1000
      if (!(error instanceof RequestError && error.status === undefined && cachedExpiry > Date.now())) throw error
      this.needsMerge = true
      this.update({ unlocked: true, status: 'Offline · journal available on this device' })
      this.startWatch()
      return
    }
    this.update({ unlocked: true })
    this.startWatch()
    if (!row || this.pending || !equal(row.payload, this.state.journal)) this.enqueue()
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
      this.knownStamp = Date.parse(row.updated_at)
      this.update({ journal, lastSynced: Date.now() })
    }
    this.needsMerge = false
  }
  saveEntry = (day: string, entry: Entry) => this.persist({
    ...this.state.journal, entries: { ...this.state.journal.entries, [day]: entry },
  })
  hasDraftConflict = (day: string, baseline: Entry | undefined, draft: Entry) => {
    const latest = this.state.journal.entries[day]
    return !equal(latest, baseline) && !equal(latest, draft)
  }
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
    if (!this.online) {
      this.update({ status: 'Cloud sync pending: Offline' })
      return
    }
    this.syncing = true
    this.update({ status: 'Syncing…' })
    try {
      let conflicts = 0
      while (this.pending || this.needsMerge) {
        const session = await this.auth()
        this.refreshQueued = false
        const old = await this.remote(session)
        if (this.needsMerge) {
          this.integrate(old)
          if (old && !this.pending && equal(old.payload, this.state.journal)) break
        }
        const revision = this.revision
        const snapshot = this.state.journal
        const journal = mergeJournal(snapshot, old?.payload, this.base, this.confirm)
        const timestamp = Math.max(Date.now(), (Date.parse(old?.updated_at ?? '') || 0) + 1)
        const row = { user_id: session.user.id, payload: journal, updated_at: new Date(timestamp).toISOString() }
        this.writingStamp = timestamp
        let result: Row[] | undefined
        try {
          result = old && equal(old.payload, journal) ? [old] : old
            ? await this.request<Row[]>(this.path(session) + '&updated_at=eq.' + encodeURIComponent(old.updated_at), 'PATCH', row, session.access_token, 'return=representation')
            : await this.request<Row[]>('/rest/v1/routine_journal', 'POST', row, session.access_token, 'return=representation')
        } catch (error) {
          if (old || !(error instanceof RequestError && error.status === 409)) throw error
        } finally {
          this.writingStamp = 0
        }
        if (!result?.length) {
          if (++conflicts >= 4) throw Error('Cloud journal changed during sync. Refresh to try again.')
          continue
        }
        conflicts = 0
        this.knownStamp = Date.parse(result[0].updated_at)
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
        this.update({ journal, status: 'Saved to cloud · ' + new Date().toLocaleTimeString(), lastSynced: Date.now() })
      }
    } catch (error) {
      this.pending = true
      try { this.local.setItem(keys.pending, '1') } catch { /* Keep the in-memory queue. */ }
      this.update({ status: 'Cloud sync pending: ' + message(error) })
    } finally {
      this.syncing = false
      this.update({})
      if (!this.pending) this.flushRefresh()
    }
  }
  refresh = async (dirty: boolean) => {
    if (dirty || this.syncing || this.pulling) {
      this.update({ status: 'Save your changes first.' })
      return
    }
    return this.pull(true)
  }
  private async pull(manual = false) {
    if (!this.online || !this.state.unlocked || this.pulling || this.syncing) return
    if (this.pending || this.needsMerge) return this.sync()
    this.pulling = true
    this.refreshQueued = false
    const observed = this.observedStamp
    this.update({})
    const revision = this.revision
    try {
      const row = await this.remote(await this.auth())
      if (row && revision === this.revision) {
        const stamp = Date.parse(row.updated_at)
        if (stamp >= this.knownStamp) {
          if (!equal(this.state.journal, row.payload)) this.local.setItem(keys.journal, JSON.stringify(row.payload))
          this.base = row.payload
          this.knownStamp = stamp
          this.update({ journal: row.payload, lastSynced: Date.now(), ...(manual ? { status: 'Cloud journal refreshed.' } : {}) })
        }
      }
    } catch (error) { this.update({ status: message(error) }) }
    finally {
      this.pulling = false
      this.update({})
      if (this.pending) void this.sync()
      else if (this.refreshQueued || this.observedStamp > observed) this.flushRefresh()
    }
  }
  private flushRefresh() {
    if (this.refreshQueued || this.observedStamp > this.knownStamp) void this.pull()
  }
  mountLive = (online: boolean) => {
    this.mounted = true
    this.setOnline(online)
    return () => {
      this.mounted = false
      this.stopWatch()
    }
  }
  setOnline = (online: boolean) => {
    this.online = online
    if (online && this.state.unlocked) {
      this.startWatch()
      this.focus()
    } else if (!online) this.stopWatch()
    this.update({})
  }
  focus = () => {
    if (!this.online || !this.state.unlocked || this.pulling || this.syncing) return
    this.startWatch()
    void this.pull()
  }
  private startWatch() {
    if (!this.mounted || !this.online || !this.session || !this.watch || this.unsubscribe) return
    let active = true
    const stop = this.watch({
      userId: this.session.user.id,
      accessToken: async () => (await this.auth()).access_token,
      onChange: stamp => {
        if (!active || stamp === this.writingStamp || stamp <= Math.max(this.knownStamp, this.observedStamp)) return
        this.observedStamp = stamp
        this.flushRefresh()
      },
      onConnection: connected => {
        if (!active || this.live === connected) return
        this.live = connected
        this.update({})
        if (connected) {
          // Close the gap between the initial REST snapshot and the subscription.
          // After a dropped socket, also catch up on events sent while disconnected.
          this.refreshQueued = true
          this.flushRefresh()
        }
      },
    })
    this.unsubscribe = () => { active = false; stop() }
  }
  private stopWatch() {
    this.unsubscribe?.()
    this.unsubscribe = null
    this.live = false
  }
  logout = async (dirty: boolean) => {
    if (this.syncing || this.pulling || this.pending || dirty) {
      this.update({ status: 'Save and sync pending changes before signing out.' })
      return
    }
    const session = this.session
    this.forget()
    this.update({ unlocked: false, status: 'Signed out.', lastSynced: null })
    try {
      if (session) await this.request('/auth/v1/logout?scope=local', 'POST', undefined, session.access_token)
    } catch { /* The local session is already cleared. */ }
  }
}

function message(error: unknown) { return error instanceof Error ? error.message : 'Unexpected cloud error' }
