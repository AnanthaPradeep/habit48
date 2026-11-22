import { RealtimeClient } from '@supabase/realtime-js'
import type { WorkoutDraft, WorkoutPlan, WorkoutSession } from '../domain/workout'
import { exerciseById } from '../domain/exercises'
import { publishableKey, supabaseUrl } from './config'

type Local = {
  sessions: WorkoutSession[]; plans: WorkoutPlan[]; draft: WorkoutDraft | null
  pendingSessions: string[]; pendingPlans: string[]
}
type Snapshot = Local & { status: string }
type SessionRow = {
  id: string; workout_day: string; name: string; finished_at: string; seconds: number; energy: number | null
  strength: boolean; workout_sets: { position: number; exercise_id: string; reps: number; kg: number }[]
  planned_sets?: number | null; plan_id?: string | null
}
type PlanRow = { id: string; name: string; minutes: number; steps: WorkoutPlan['steps']; created_at: string }
const empty = (): Local => ({ sessions: [], plans: [], draft: null, pendingSessions: [], pendingPlans: [] })
const combine = <T extends { id: string }>(a: T[], b: T[]) => [...new Map([...a, ...b].map(item => [item.id, item])).values()]

export class WorkoutStore {
  private key: string
  private state: Snapshot
  private listeners = new Set<() => void>()
  private active = false
  private online = true
  private busy = false
  private queued = false
  private socket: RealtimeClient | null = null

  constructor(private readonly owner: string, private readonly accessToken: () => Promise<string>) {
    this.key = 'routine-workout-v1:' + owner
    let local = empty()
    try { local = { ...local, ...JSON.parse(localStorage.getItem(this.key) ?? '{}') } } catch { /* Keep unreadable data intact. */ }
    this.state = { ...local, status: 'Saved on this device' }
  }
  snapshot = () => this.state
  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }
  private update(patch: Partial<Snapshot>) {
    this.state = { ...this.state, ...patch }
    this.listeners.forEach(listener => listener())
  }
  private persist(patch: Partial<Local>) {
    const next = { ...this.state, ...patch }
    try {
      const { sessions, plans, draft, pendingSessions, pendingPlans } = next
      localStorage.setItem(this.key, JSON.stringify({ sessions, plans, draft, pendingSessions, pendingPlans }))
      this.update(patch)
      return true
    } catch {
      this.update({ status: 'Device storage is unavailable' })
      return false
    }
  }
  draft = (draft: WorkoutDraft | null) => this.persist({ draft })
  saveRecoveredSession(session: WorkoutSession) {
    if (this.state.sessions.some(item => item.id === session.id)) return
    const saved = this.persist({ sessions: [...this.state.sessions, session],
      draft: this.state.draft?.id === session.id ? null : this.state.draft,
      pendingSessions: [...new Set([...this.state.pendingSessions, session.id])] })
    if (saved) this.refresh()
  }
  saveSession(session: WorkoutSession) {
    const saved = this.persist({ sessions: combine(this.state.sessions, [session]), draft: null,
      pendingSessions: [...new Set([...this.state.pendingSessions, session.id])] })
    if (saved) this.refresh()
    return saved
  }
  savePlan(plan: WorkoutPlan) {
    const saved = this.persist({ plans: combine(this.state.plans, [plan]),
      pendingPlans: [...new Set([...this.state.pendingPlans, plan.id])] })
    if (saved) this.refresh()
    return saved
  }

  mount = () => {
    this.active = true
    const online = () => { this.online = true; this.connect(); this.refresh() }
    const offline = () => { this.online = false; this.disconnect(); this.update({ status: 'Offline · changes stay on this device' }) }
    window.addEventListener('online', online)
    window.addEventListener('offline', offline)
    window.addEventListener('focus', this.refresh)
    if (navigator.onLine) online()
    else offline()
    return () => {
      this.active = false
      window.removeEventListener('online', online)
      window.removeEventListener('offline', offline)
      window.removeEventListener('focus', this.refresh)
      this.disconnect()
    }
  }
  private connect() {
    if (this.socket) return
    const socket = this.socket = new RealtimeClient(supabaseUrl.replace(/^http/, 'ws') + '/realtime/v1', {
      params: { apikey: publishableKey }, accessToken: this.accessToken,
    })
    const filter = 'user_id=eq.' + this.owner
    const channel = socket.channel('workout-studio:' + this.owner)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'workout_sessions', filter }, this.refresh)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'workout_plans', filter }, this.refresh)
    void socket.setAuth().then(() => {
      if (this.socket === socket) channel.subscribe(status => { if (status === 'SUBSCRIBED') this.refresh() })
    }).catch(() => undefined)
  }
  private disconnect() {
    const socket = this.socket
    this.socket = null
    if (socket) void socket.removeAllChannels().catch(() => undefined)
  }

  private request = async <T>(path: string, access: string, body?: unknown, prefer?: string): Promise<T> => {
    const headers: Record<string,string> = { apikey: publishableKey, Authorization: 'Bearer ' + access, 'Content-Type': 'application/json' }
    if (prefer) headers.Prefer = prefer
    const response = await fetch(supabaseUrl + '/rest/v1/' + path, {
      method: body ? 'POST' : 'GET', headers, body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store', signal: AbortSignal.timeout(15000),
    })
    if (!response.ok) throw Error('Workout cloud request failed (' + response.status + ')')
    const text = await response.text()
    return text ? JSON.parse(text) as T : undefined as T
  }
  private async list<T>(resource: string, access: string) {
    const all: T[] = []
    const path = resource + '&user_id=eq.' + encodeURIComponent(this.owner) + '&order=id.asc&limit=100'
    for (let offset = 0; ; offset += 100) {
      const rows = await this.request<T[]>(path + '&offset=' + offset, access)
      all.push(...rows)
      if (rows.length < 100 || !this.active) return all
    }
  }
  refresh = () => {
    this.queued = true
    if (this.active && this.online && !this.busy) void this.sync()
  }
  private async sync() {
    this.busy = true
    this.update({ status: 'Syncing workouts…' })
    try {
      while (this.queued && this.active && this.online) {
        this.queued = false
        const token = await this.accessToken()
        if (!this.active) return
        for (const session of this.state.sessions.filter(s => this.state.pendingSessions.includes(s.id))) {
          await this.request('rpc/save_workout_session', token, { workout: session })
          if (!this.active) return
          if (!this.persist({ pendingSessions: this.state.pendingSessions.filter(id => id !== session.id) })) return
        }
        for (const plan of this.state.plans.filter(p => this.state.pendingPlans.includes(p.id))) {
          await this.request('workout_plans?on_conflict=id', token, {
            id: plan.id, user_id: this.owner, name: plan.name, minutes: plan.minutes, steps: plan.steps, created_at: plan.createdAt,
          }, 'resolution=ignore-duplicates,return=minimal')
          if (!this.active) return
          if (!this.persist({ pendingPlans: this.state.pendingPlans.filter(id => id !== plan.id) })) return
        }
        const [sessions, plans] = await Promise.all([
          this.list<SessionRow>('workout_sessions?select=id,workout_day,name,finished_at,seconds,energy,strength,planned_sets,plan_id,workout_sets(position,exercise_id,reps,kg)', token),
          this.list<PlanRow>('workout_plans?select=id,name,minutes,steps,created_at', token),
        ])
        if (!this.active) return
        const remoteSessions = sessions.map(row => ({ id: row.id, day: row.workout_day, name: row.name,
          finishedAt: row.finished_at, seconds: row.seconds, energy: row.energy, strength: row.strength,
          plannedSets: row.planned_sets ?? undefined, planId: row.plan_id ?? undefined,
          sets: row.workout_sets.map(s => ({ position: s.position, exerciseId: s.exercise_id, reps: s.reps, kg: s.kg }))
            .sort((a,b) => a.position - b.position) }))
        const remotePlans = plans.filter(row => row.steps.every(item => item && exerciseById.has(item.exerciseId) &&
          Number.isInteger(item.sets) && item.sets >= 1 && item.sets <= 6 &&
          Number.isInteger(item.reps) && item.reps >= 1 && item.reps <= 120 &&
          Number.isInteger(item.rest) && item.rest >= 0 && item.rest <= 300))
          .map(row => ({ id: row.id, name: row.name, minutes: row.minutes,
          steps: row.steps, createdAt: row.created_at }))
        if (this.persist({ sessions: combine(this.state.sessions, remoteSessions), plans: combine(this.state.plans, remotePlans) })) {
          this.update({ status: 'Workouts synced' })
        }
      }
    } catch {
      if (this.active) this.update({ status: 'Workout sync pending · logs remain on this device' })
    } finally {
      this.busy = false
      if (this.queued && this.active && this.online) void this.sync()
    }
  }
}
