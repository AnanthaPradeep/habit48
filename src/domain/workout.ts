import { exerciseById } from './exercises'
import { shift } from './journal'

export interface PlanStep { exerciseId: string; sets: number; reps: number; rest: number }
export interface WorkoutPlan { id: string; name: string; minutes: number; steps: PlanStep[]; createdAt?: string }
export interface CompletedSet { position: number; exerciseId: string; reps: number; kg: number }
export interface WorkoutSession {
  id: string; day: string; name: string; finishedAt: string; seconds: number
  energy: number | null; strength: boolean; sets: CompletedSet[]
  plannedSets?: number; planId?: string
}
export interface WorkoutDraft {
  id: string; day: string; plan: WorkoutPlan; sets: CompletedSet[]
  elapsed: number; runningSince: number | null; restUntil: number | null; pausedRest: number
}

export function step(id: string): PlanStep {
  const exercise = exerciseById.get(id)
  if (!exercise) throw Error('Unknown exercise ' + id)
  return { exerciseId: id, sets: exercise.sets, reps: exercise.reps, rest: exercise.rest }
}
const plan = (id: string, name: string, minutes: number, ids: string[]): WorkoutPlan =>
  ({ id, name, minutes, steps: ids.map(step) })
export const upper = plan('upper','Upper Body Strength',22,['wall-push','floor-press','row','hammer','wall-slide'])
export const lower = plan('lower','Lower Body Strength',22,['squat','reverse-lunge','bridge','rdl','calf'])
export const full = plan('full','Full Body Strength',25,['squat','wall-push','row','bridge','curl','dead-bug'])
export const body = plan('unloaded','Bodyweight Foundations',20,['squat','wall-push','bridge','prone-w','bird-dog','calf'])
export const warmup = plan('warmup','Gentle Warm-up',5,['march','step-touch','shoulder-roll','ankle-rock'])
export const cooldown = plan('cooldown','Cool-down & Stretch',5,['calf-stretch','cross-stretch','side-reach','pelvic-tilt'])
export const week = [
  { label: 'Mon', plan: upper, detail: '20–25 min' },
  { label: 'Tue', plan: plan('walk-mobility','Walking + Mobility',30,['march','step-touch','cat-cow','wall-slide']), detail: '30 min' },
  { label: 'Wed', plan: lower, detail: '20–25 min' },
  { label: 'Thu', plan: plan('recovery','Active Recovery',20,['heel-dig','shoulder-roll','calf-stretch','side-reach']), detail: '20 min' },
  { label: 'Fri', plan: full, detail: '25 min' },
  { label: 'Sat', plan: plan('walk-core','Walking + Light Core',30,['march','step-touch','dead-bug','bird-dog']), detail: '30 min' },
  { label: 'Sun', plan: null, detail: 'Rest' },
]
export const sequence = (workout: WorkoutPlan) => workout.steps.flatMap(item => Array.from({ length: item.sets }, (_, i) =>
  ({ ...item, setNumber: i + 1 })))

export const elapsed = (draft: WorkoutDraft, now: number) =>
  draft.elapsed + (draft.runningSince === null ? 0 : Math.max(0, now - draft.runningSince))
export const rest = (draft: WorkoutDraft, now: number) =>
  draft.restUntil === null ? draft.pausedRest : Math.max(0, draft.restUntil - now)
export function togglePause(draft: WorkoutDraft, now: number): WorkoutDraft {
  return draft.runningSince === null
    ? { ...draft, runningSince: now, restUntil: draft.pausedRest ? now + draft.pausedRest : null, pausedRest: 0 }
    : { ...draft, elapsed: elapsed(draft, now), runningSince: null, restUntil: null, pausedRest: rest(draft, now) }
}
export function completeSet(draft: WorkoutDraft, reps: number, kg: number, now: number): WorkoutDraft {
  const order = sequence(draft.plan)
  const position = draft.sets.length
  const current = order[position]
  if (!current || draft.runningSince === null || rest(draft, now) ||
    !Number.isInteger(reps) || reps < 1 || reps > 600 || ![0, 5, 10].includes(kg)) return draft
  return { ...draft, sets: [...draft.sets, { position, exerciseId: current.exerciseId, reps, kg }],
    restUntil: position + 1 < order.length ? now + current.rest * 1000 : null }
}
export function finishWorkout(draft: WorkoutDraft, now: number, massKg?: number): WorkoutSession | null {
  if (!draft.sets.length) return null
  const seconds = Math.min(604800, Math.max(1, Math.round(elapsed(draft, now) / 1000)))
  const strength = draft.sets.some(set => {
    const group = exerciseById.get(set.exerciseId)?.group
    return group && !['Cardio','Mobility','Stretching'].includes(group)
  })
  const met = draft.sets.some(set => set.kg > 0) ? 3.5 : strength ? 3.0 : 2.3
  const estimate = massKg && massKg > 0 ? Math.round(met * massKg * seconds / 3600) : null
  const energy = estimate !== null && Number.isSafeInteger(estimate) && estimate <= 2147483647 ? estimate : null
  return { id: draft.id, day: draft.day, name: draft.plan.name, finishedAt: new Date(now).toISOString(),
    seconds, energy, strength, sets: draft.sets, plannedSets: sequence(draft.plan).length, planId: draft.plan.id }
}
export function sessionStatus(session: WorkoutSession) {
  return session.plannedSets === undefined ? 'Logged' : session.sets.length >= session.plannedSets ? 'Completed' : 'Partial'
}
export function exerciseHistory(sessions: WorkoutSession[], exerciseId: string, equipment: 'bodyweight' | 'dumbbell') {
  const timed = exerciseById.get(exerciseId)?.timed ?? false
  return sessions.flatMap(session => {
    const sets = session.sets.filter(set => set.exerciseId === exerciseId && (equipment === 'dumbbell' ? set.kg > 0 : set.kg === 0))
    if (!sets.length) return []
    return [{ session, sets, total: sets.reduce((sum, set) => sum + set.reps, 0),
      volume: timed || equipment === 'bodyweight' ? null : sets.reduce((sum, set) => sum + set.reps * set.kg, 0) }]
  }).sort((a,b) => b.session.finishedAt.localeCompare(a.session.finishedAt))
}
export function streak(sessions: WorkoutSession[], today: string) {
  const dates = new Set(sessions.map(session => session.day))
  let date = dates.has(today) ? today : shift(today, -1)
  let count = 0
  while (dates.has(date)) { count++; date = shift(date, -1) }
  return count
}
export function workoutTotals(sessions: WorkoutSession[]) {
  return { count: sessions.length, minutes: Math.round(sessions.reduce((sum, s) => sum + s.seconds, 0) / 60),
    sets: sessions.reduce((sum, s) => sum + s.sets.length, 0),
    energy: sessions.some(s => s.energy !== null) ? sessions.reduce((sum, s) => sum + (s.energy ?? 0), 0) : null }
}
