import { RealtimeClient } from '@supabase/realtime-js'
import { publishableKey, supabaseUrl } from './config'
import type { EventChange, RoutineEvent } from '../domain/routineEvents'

type Snapshot = { events: RoutineEvent[]; status: string }
export class RoutineEventStore {
  private readonly key: string
  private state: Snapshot
  private listeners = new Set<() => void>()
  private active = false
  private busy = false
  private queued = false
  private client: RealtimeClient | null = null

  constructor(private readonly owner: string, private readonly token: () => Promise<string>) {
    this.key = 'routine-planning-v1:' + owner
    let events: RoutineEvent[] = []
    try {
      const stored: unknown = JSON.parse(localStorage.getItem(this.key) ?? '[]')
      if (Array.isArray(stored)) events = stored
    } catch { /* Keep unreadable storage intact. */ }
    this.state = { events, status: 'Saved on this device' }
  }
  snapshot = () => this.state
  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }
  private set(status: string, events = this.state.events) {
    this.state = { status, events }
    this.listeners.forEach(listener => listener())
  }
  private persist(events: RoutineEvent[], status: string) {
    try {
      localStorage.setItem(this.key, JSON.stringify(events))
      this.set(status, events)
      return true
    } catch { this.set('Device storage is unavailable'); return false }
  }
  append = (change: EventChange) => {
    const saved = this.persist([...this.state.events, { ...change, id: crypto.randomUUID() }], 'Saved on this device')
    if (saved) this.refresh()
    return saved
  }
  mount = () => {
    this.active = true
    const online = () => { this.connect(); this.refresh() }
    const offline = () => { this.disconnect(); this.set('Offline · changes stay on this device') }
    window.addEventListener('online', online)
    window.addEventListener('offline', offline)
    window.addEventListener('focus', this.refresh)
    if (navigator.onLine) online()
    else offline()
    return () => {
      this.active = false
      this.disconnect()
      window.removeEventListener('online', online)
      window.removeEventListener('offline', offline)
      window.removeEventListener('focus', this.refresh)
    }
  }
  private connect() {
    if (this.client) return
    const client = this.client = new RealtimeClient(supabaseUrl.replace(/^http/, 'ws') + '/realtime/v1', {
      params: { apikey: publishableKey }, accessToken: this.token,
    })
    const channel = client.channel('routine-planning:' + this.owner)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'routine_events', filter: 'user_id=eq.' + this.owner }, this.refresh)
    void client.setAuth().then(() => {
      if (this.client === client) channel.subscribe(status => { if (status === 'SUBSCRIBED') this.refresh() })
    }).catch(() => undefined)
  }
  private disconnect() {
    const client = this.client
    this.client = null
    if (client) void client.removeAllChannels().catch(() => undefined)
  }
  refresh = () => {
    this.queued = true
    if (this.active && navigator.onLine && !this.busy) void this.sync()
  }
  private async sync() {
    this.busy = true
    try {
      while (this.queued && this.active && navigator.onLine) {
        this.queued = false
        const headers = { Authorization: 'Bearer ' + await this.token(), apikey: publishableKey, 'Content-Type': 'application/json' }
        if (!this.active) return
        const base = supabaseUrl + '/rest/v1/routine_events'
        const pending = this.state.events.filter(event => event.position === undefined)
        if (pending.length) {
          const response = await fetch(base + '?on_conflict=id', { method: 'POST', cache: 'no-store',
            headers: { ...headers, Prefer: 'resolution=ignore-duplicates,return=minimal' },
            body: JSON.stringify(pending.map(event => ({ ...event, user_id: this.owner }))), signal: AbortSignal.timeout(15000) })
          if (!response.ok) throw Error('Could not upload planning changes')
        }
        const received: RoutineEvent[] = []
        for (let offset = 0; this.active; offset += 100) {
          const response = await fetch(base + '?select=id,kind,payload,position&user_id=eq.' + encodeURIComponent(this.owner) +
            '&order=position.asc&limit=100&offset=' + offset, { headers, cache: 'no-store', signal: AbortSignal.timeout(15000) })
          if (!response.ok) throw Error('Could not download planning changes')
          const page: RoutineEvent[] = await response.json()
          received.push(...page)
          if (page.length < 100) break
        }
        if (!this.active) return
        const merged = new Map(this.state.events.map(event => [event.id, event]))
        for (const event of received) merged.set(event.id, event)
        if (!this.persist([...merged.values()], 'Plans and goals synced')) return
      }
    } catch { if (this.active) this.set('Plan and goal sync pending') }
    finally {
      this.busy = false
      if (this.queued && this.active && navigator.onLine) void this.sync()
    }
  }
}
