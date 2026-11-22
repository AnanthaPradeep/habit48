import { habits, monday, shift, type Journal } from './journal'
import type { ScheduleFor } from './review'
import type { WorkoutSession } from './workout'

export type Frequency = 'Daily' | 'Weekly' | 'Monthly' | 'Custom'
export type GoalKind = 'Workout' | 'Walking' | 'Hydration' | 'Sleep' | 'Habit' | 'Custom habit' | 'Weight' | 'Reading' | 'Custom'
export interface PersonalGoal {
  id: string
  title: string
  kind: GoalKind
  frequency: Frequency
  start: string
  end: string
  target: number
  threshold: number
  habit: number
  customHabit?: string
  state: 'Active' | 'Paused' | 'Archived'
  expected: string | null
}
export interface GoalLog { id: string; goal: string; day: string; amount: number; expected: string | null }

export const manualGoal = (kind: GoalKind) => kind === 'Reading' || kind === 'Custom'
export function monthShift(day: string, offset: number) {
  const date = new Date(day.slice(0, 7) + '-01T12:00:00')
  date.setMonth(date.getMonth() + offset)
  const year = date.getFullYear()
  return year + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-01'
}
export function goalRange(day: string, frequency: Frequency): [string, string] {
  if (frequency === 'Monthly') return [monthShift(day, 0), shift(monthShift(day, 1), -1)]
  if (frequency === 'Weekly') return [monday(day), shift(monday(day), 6)]
  return [day, day]
}
export const dateDistance = (from: string, to: string) => (Date.parse(to) - Date.parse(from)) / 86400000
export const recordedNumber = (value: unknown): number | null =>
  (typeof value === 'number' || (typeof value === 'string' && value.trim() !== '')) &&
  Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : null

export function goalProgress(goal: PersonalGoal, journal: Journal, sessions: WorkoutSession[],
  logs: Iterable<GoalLog>, scheduled: ScheduleFor, day: string,
  customDates?: (habit: string) => { day: string; amount: number }[]) {
  const inRange = (date: string) => date >= goal.start && date <= goal.end && date <= day
  const points: { day: string; amount: number }[] = []
  for (const [date, entry] of Object.entries(journal.entries)) {
    if (!inRange(date)) continue
    const walking = recordedNumber(entry.m[1])
    const water = recordedNumber(entry.m[0])
    const sleep = recordedNumber(entry.m[2])
    const weight = recordedNumber(entry.m[3])
    let amount: number | null = null
    if (goal.kind === 'Walking') amount = walking
    if (goal.kind === 'Hydration') amount = goal.threshold > 0 && water !== null ? Number(water >= goal.threshold) : water
    if (goal.kind === 'Sleep' && sleep !== null) amount = Number(sleep >= goal.threshold)
    if (goal.kind === 'Weight' && weight !== null && weight > 0) amount = weight
    if (goal.kind === 'Habit' && scheduled(date).includes(goal.habit)) amount = Number(Boolean(entry.h[goal.habit]))
    if (amount !== null) points.push({ day: date, amount })
  }
  if (goal.kind === 'Custom habit' && goal.customHabit) {
    points.push(...(customDates?.(goal.customHabit) ?? []).filter(point => inRange(point.day)))
  }
  if (goal.kind === 'Workout') for (const session of sessions) {
    if (inRange(session.day) && session.sets.length >= (session.plannedSets ?? Infinity)) points.push({ day: session.day, amount: 1 })
  }
  if (manualGoal(goal.kind)) for (const log of logs) {
    if (log.goal === goal.id && inRange(log.day)) points.push(log)
  }
  let value: number | null = goal.kind === 'Weight' ? null : 0
  let achieved: string | undefined
  const ordered = points.sort((a, b) => a.day.localeCompare(b.day))
  for (const point of ordered) {
    value = goal.kind === 'Weight' ? point.amount : (value ?? 0) + point.amount
    const met = goal.kind === 'Weight' ? (goal.threshold ? value >= goal.target : value <= goal.target) : value >= goal.target
    if (met && !achieved) achieved = point.day
  }
  const baseline = ordered[0]?.amount
  const percentage = goal.kind === 'Weight'
    ? achieved ? 100 : value === null || baseline === undefined || baseline === goal.target ? 0 :
      Math.min(99, Math.max(0, Math.round(100 * (value - baseline) / (goal.target - baseline))))
    : Math.min(100, Math.round(100 * (value ?? 0) / goal.target))
  return { value, achieved, percentage, remaining: Math.max(0, dateDistance(day, goal.end)), recorded: points.length }
}
export const goalUnits = (goal: PersonalGoal) => ({
  Workout: 'sessions', Walking: 'min', Hydration: goal.threshold ? 'days' : 'L', Sleep: 'days',
  Habit: 'days', 'Custom habit': 'days', Weight: 'kg', Reading: 'pages', Custom: 'units',
})[goal.kind]

export const goalTemplates: { title: string; kind: GoalKind; frequency: Frequency; target: number; threshold?: number; habit?: number }[] = [
  { title: 'Monthly workouts', kind: 'Workout', frequency: 'Monthly', target: 12 },
  { title: 'Weekly walking', kind: 'Walking', frequency: 'Weekly', target: 90 },
  { title: habits[0], kind: 'Habit', frequency: 'Monthly', target: 21, habit: 0 },
  { title: 'Daily hydration', kind: 'Hydration', frequency: 'Daily', target: 2 },
  { title: 'Sleep routine', kind: 'Sleep', frequency: 'Monthly', target: 20, threshold: 7 },
  { title: 'Read 10 pages', kind: 'Reading', frequency: 'Daily', target: 10 },
]
