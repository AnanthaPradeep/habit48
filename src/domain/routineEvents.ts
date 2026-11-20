export type GoalChange = { id: string; week: string; text: string; done: boolean; expected: string | null }
export type ScheduleChange = { effective: string; days: number[][]; recovery?: number[]; expected: string | null }
export type PlanChange = { day: string; mode: 'workout' | 'rest' | 'recovery'; planId?: string; name?: string; expected: string | null }
export type MoveChange = { from: string; to: string; expected: string; targetExpected: string | null }
export type EventChange =
  | { kind: 'goal'; payload: GoalChange }
  | { kind: 'schedule'; payload: ScheduleChange }
  | { kind: 'plan'; payload: PlanChange }
  | { kind: 'move'; payload: MoveChange }
export type RoutineEvent = EventChange & { id: string; position?: number }
export type Versioned<T> = T & { revision: string }
export interface PlanSlot extends Versioned<PlanChange> { movedFrom?: string; movedTo?: string }

export function projectEvents(events: RoutineEvent[]) {
  const goals = new Map<string, Versioned<GoalChange>>()
  const schedules = new Map<string, Versioned<ScheduleChange>>()
  const planner = new Map<string, PlanSlot>()
  const rejected: string[] = []
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
    } else {
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
  return { goals, schedules, planner, rejected }
}
