import { expect, type BrowserContext, type WebSocketRoute } from '@playwright/test'
import type { Journal } from '../src/domain/journal'
import type { WorkoutSession } from '../src/domain/workout'
import type { RoutineEvent } from '../src/domain/routineEvents'
import { ownerEmail } from '../src/services/config'

interface Row { user_id: string; payload: Journal; updated_at: string }
type Frame = [string | null, string | null, string, string, Record<string, unknown>]
type Change = 'INSERT' | 'UPDATE'
interface Binding { id: number; event: Change; schema: string; table: string; filter: string }
const userId = 'test-user'
const token = 'sample-access'

export function journalBackend(initial?: Journal) {
  let row: Row | undefined = initial ? { user_id: userId, payload: initial, updated_at: new Date().toISOString() } : undefined
  let broadcast = true
  const writes: string[] = []
  const workoutSessions = new Map<string, WorkoutSession>()
  const workoutPlans = new Map<string, Record<string, unknown>>()
  const planning = new Map<string, RoutineEvent>()
  const sockets = new Map<WebSocketRoute, { send(frame: Frame): void; topic: string; joinRef: string | null; bindings: Binding[] }>()

  function emit(type: Change, next: Row) {
    if (!broadcast) return
    for (const { send, topic, joinRef, bindings } of sockets.values()) {
      const ids = bindings.filter(binding => binding.table === 'routine_journal' && binding.event === type).map(binding => binding.id)
      if (!ids.length) continue
      const data = { schema: 'public', table: 'routine_journal', commit_timestamp: next.updated_at, type,
        columns: [{ name: 'user_id', type: 'uuid' }, { name: 'updated_at', type: 'timestamptz' }],
        record: { user_id: next.user_id, updated_at: next.updated_at } }
      const frame: Frame = [joinRef, null, topic, 'postgres_changes', { ids, data }]
      send(frame)
      send(frame) // Repeated delivery must not trigger a second pull.
    }
  }
  function emitWorkout(table: 'workout_sessions' | 'workout_plans' | 'routine_events') {
    for (const { send, topic, joinRef, bindings } of sockets.values()) {
      const ids = bindings.filter(binding => binding.table === table).map(binding => binding.id)
      if (ids.length) send([joinRef, null, topic, 'postgres_changes', { ids, data: { schema: 'public', table, type: 'INSERT',
        commit_timestamp: new Date().toISOString(), columns: [{ name: 'user_id', type: 'uuid' }], record: { user_id: userId } } }])
    }
  }
  async function attach(context: BrowserContext) {
    let offline = false
    let reads = 0
    let leaves = 0
    await context.routeWebSocket(/^wss:\/\/[^/]+\.supabase\.co\/realtime\/v1\/websocket/, socket => {
      const send = (frame: Frame) => socket.send(JSON.stringify(frame))
      socket.onClose(() => sockets.delete(socket))
      socket.onMessage(message => {
        const [joinRef, ref, topic, event, payload] = JSON.parse(message.toString()) as Frame
        const reply = (response: Record<string, unknown> = {}) =>
          send([joinRef, ref, topic, 'phx_reply', { status: 'ok', response }])
        if (event === 'phx_join') {
          expect(payload.access_token).toBe(token)
          const requested = (payload.config as { postgres_changes: Omit<Binding, 'id'>[] }).postgres_changes
          const expected = topic.includes('workout-studio:') ? ['workout_sessions','workout_plans'].map(table => ({
            event: 'INSERT', schema: 'public', table, filter: 'user_id=eq.' + userId,
          })) : topic.includes('routine-planning:') ? [{
            event: 'INSERT', schema: 'public', table: 'routine_events', filter: 'user_id=eq.' + userId,
          }] : ['INSERT', 'UPDATE'].map(event => ({
            event, schema: 'public', table: 'routine_journal', filter: 'user_id=eq.' + userId,
          }))
          expect(requested).toEqual(expected)
          const bindings = requested.map((binding, index) => ({ ...binding, id: index + 1 }))
          sockets.set(socket, { send, topic, joinRef, bindings })
          reply({ postgres_changes: bindings })
        } else if (event === 'phx_leave') {
          if (topic.includes('routine-journal:')) leaves++
          sockets.delete(socket)
          reply()
        } else if (event === 'heartbeat') reply()
      })
    })
    await context.route(/^https:\/\/[^/]+\.supabase\.co\//, async route => {
      const request = route.request()
      const url = new URL(request.url())
      if (offline) return route.abort('internetdisconnected')
      if (url.pathname === '/auth/v1/token') {
        const body = request.postDataJSON()
        if (url.searchParams.get('grant_type') === 'password' && (body.email !== ownerEmail || body.password !== 'sample-password')) {
          return route.fulfill({ status: 400, json: { msg: 'Invalid login credentials' } })
        }
        return route.fulfill({ json: { user: { id: userId, email: ownerEmail }, access_token: token,
          refresh_token: 'sample-refresh', expires_at: Math.floor(Date.now() / 1000) + 3600 } })
      }
      if (url.pathname === '/auth/v1/logout') return route.fulfill({ status: 204 })
      const authorized = request.headers().authorization === 'Bearer ' + token
      if (authorized && url.pathname === '/rest/v1/routine_events') {
        if (request.method() === 'POST') {
          for (const event of request.postDataJSON() as RoutineEvent[]) {
            if (planning.has(event.id)) continue
            planning.set(event.id, { ...event, position: planning.size + 1 })
            emitWorkout('routine_events')
          }
          return route.fulfill({ status: 204 })
        }
        return route.fulfill({ json: [...planning.values()] })
      }
      if (authorized && url.pathname === '/rest/v1/rpc/save_workout_session') {
        const { workout } = request.postDataJSON() as { workout: WorkoutSession }
        if (!workoutSessions.has(workout.id)) {
          workoutSessions.set(workout.id, workout)
          emitWorkout('workout_sessions')
        }
        return route.fulfill({ status: 204 })
      }
      if (authorized && url.pathname === '/rest/v1/workout_sessions') {
        return route.fulfill({ json: [...workoutSessions.values()].map(s => ({
          id: s.id, workout_day: s.day, name: s.name, finished_at: s.finishedAt, seconds: s.seconds, energy: s.energy,
          planned_sets: s.plannedSets, plan_id: s.planId,
          strength: s.strength, workout_sets: s.sets.map(set => ({
            position: set.position, exercise_id: set.exerciseId, reps: set.reps, kg: set.kg,
          })),
        })) })
      }
      if (authorized && url.pathname === '/rest/v1/workout_plans') {
        if (request.method() === 'POST') {
          const plan = request.postDataJSON() as Record<string, unknown> & { id: string }
          if (!workoutPlans.has(plan.id)) {
            workoutPlans.set(plan.id, plan)
            emitWorkout('workout_plans')
          }
          return route.fulfill({ status: 204 })
        }
        return route.fulfill({ json: [...workoutPlans.values()] })
      }
      if (url.pathname !== '/rest/v1/routine_journal' || request.headers().authorization !== 'Bearer ' + token) {
        return route.fulfill({ status: 401, json: { message: 'Unexpected request in isolated test' } })
      }
      const method = request.method()
      if (method === 'GET') reads++
      if (method === 'PATCH' && url.searchParams.get('updated_at') !== 'eq.' + row?.updated_at) return route.fulfill({ json: [] })
      if (method === 'POST' && row) return route.fulfill({ status: 409, json: { message: 'Journal row already exists' } })
      if (method === 'POST' || method === 'PATCH') {
        const next = request.postDataJSON() as Row
        row = next
        writes.push(method)
        emit(method === 'POST' ? 'INSERT' : 'UPDATE', next)
      }
      return route.fulfill({ json: row ? [row] : [] })
    })
    return { reads: () => reads, leaves: () => leaves, offline(value: boolean) { offline = value } }
  }
  return { attach, writes, payload: () => row?.payload, workouts: () => [...workoutSessions.values()],
    setBroadcast(value: boolean) { broadcast = value } }
}

export async function mockSupabase(context: BrowserContext, initial?: Journal) {
  const backend = journalBackend(initial)
  return { ...backend, ...await backend.attach(context) }
}
