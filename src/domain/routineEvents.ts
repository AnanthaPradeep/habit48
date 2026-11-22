import type { GoalLog, PersonalGoal } from './personalGoals'
import type { WorkoutDraft, WorkoutSession } from './workout'
import type { CustomHabit, HabitLog } from './customHabits'

export type Reflection = { month: string; notes: string; focus: string; expected: string | null }
export type ActiveWorkout = { draft: WorkoutDraft | null; session?: WorkoutSession; expected: string | null }
export type GoalChange = { id: string; week: string; text: string; done: boolean; expected: string | null }
export type ScheduleChange = { effective: string; days: number[][]; recovery?: number[]; expected: string | null }
export type PlanChange = { day: string; mode: 'workout' | 'rest' | 'recovery'; planId?: string; name?: string; expected: string | null }
export type MoveChange = { from: string; to: string; expected: string; targetExpected: string | null }
export type EventChange =
  | { kind: 'goal'; payload: GoalChange }
  | { kind: 'schedule'; payload: ScheduleChange }
  | { kind: 'plan'; payload: PlanChange }
  | { kind: 'move'; payload: MoveChange }
  | { kind: 'personal_goal'; payload: PersonalGoal }
  | { kind: 'goal_log'; payload: GoalLog }
  | { kind: 'reflection'; payload: Reflection }
  | { kind: 'active_workout'; payload: ActiveWorkout }
  | { kind: 'custom_habit'; payload: CustomHabit }
  | { kind: 'habit_log'; payload: HabitLog }
export type RoutineEvent = EventChange & { id: string; position?: number }
export type Versioned<T> = T & { revision: string }
export interface PlanSlot extends Versioned<PlanChange> { movedFrom?: string; movedTo?: string }

export function projectEvents(events: RoutineEvent[]) {
  const goals = new Map<string, Versioned<GoalChange>>()
  const schedules = new Map<string, Versioned<ScheduleChange>>()
  const planner = new Map<string, PlanSlot>()
  const personalGoals = new Map<string, Versioned<PersonalGoal>>()
  const goalLogs = new Map<string, Versioned<GoalLog>>()
  const reflections = new Map<string, Versioned<Reflection>>()
  const activeWorkout = new Map<string, Versioned<ActiveWorkout>>()
  const finishedWorkouts = new Map<string, WorkoutSession>()
  const customHabits = new Map<string, Versioned<CustomHabit>>()
  const habitLogs = new Map<string, Versioned<HabitLog>>()
  const rejected: string[] = []
  function apply<T extends { expected: string | null }>(map: Map<string, Versioned<T>>, key: string, value: T, revision: string) {
    if ((map.get(key)?.revision ?? null) !== value.expected) rejected.push(revision)
    else map.set(key, { ...value, revision })
  }
  // Server order is authoritative. Unsynced events stay visible after the confirmed history.
  const ordered = [...events].sort((a,b) => (a.position ?? Infinity) === (b.position ?? Infinity) ? 0 : (a.position ?? Infinity) - (b.position ?? Infinity))
  for (const event of ordered) {
    const revision = event.id
    if (event.kind === 'goal') {
      const value = event.payload
      if ((goals.get(value.id)?.revision ?? null) !== value.expected) { rejected.push(revision); continue }
      goals.set(value.id, { ...value, revision })
    } else if (event.kind === 'schedule') {
      const value = event.payload
      if ((schedules.get(value.effective)?.revision ?? null) !== value.expected) { rejected.push(revision); continue }
      schedules.set(value.effective, { ...value, revision })
    } else if (event.kind === 'plan') {
      const value = event.payload
      if ((planner.get(value.day)?.revision ?? null) !== value.expected) { rejected.push(revision); continue }
      planner.set(value.day, { ...value, revision })
    } else if (event.kind === 'personal_goal') {
      apply(personalGoals, event.payload.id, event.payload, revision)
    } else if (event.kind === 'goal_log') {
      apply(goalLogs, event.payload.id, event.payload, revision)
    } else if (event.kind === 'reflection') {
      apply(reflections, event.payload.month, event.payload, revision)
    } else if (event.kind === 'active_workout') {
      apply(activeWorkout, 'current', event.payload, revision)
      if (activeWorkout.get('current')?.revision === revision && event.payload.session) {
        finishedWorkouts.set(event.payload.session.id, event.payload.session)
      }
    } else if (event.kind === 'custom_habit') {
      apply(customHabits, event.payload.id + ':' + event.payload.effective, event.payload, revision)
    } else if (event.kind === 'habit_log') {
      apply(habitLogs, event.payload.id, event.payload, revision)
    } else if (event.kind === 'move') {
      const value = event.payload
      const source = planner.get(value.from)
      const target = planner.get(value.to)
      if (value.from === value.to || !source || source.mode !== 'workout' || source.movedTo ||
        source.revision !== value.expected || (target?.revision ?? null) !== value.targetExpected) {
        rejected.push(revision)
        continue
      }
      planner.set(value.from, { ...source, revision, movedTo: value.to })
      planner.set(value.to, { ...source, day: value.to, revision, movedFrom: value.from })
    }
  }
  return { goals, schedules, planner, personalGoals, goalLogs, reflections, activeWorkout: activeWorkout.get('current'),
    finishedWorkouts, customHabits, habitLogs, rejected }
}
