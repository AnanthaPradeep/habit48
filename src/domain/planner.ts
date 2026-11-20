import { sevenDays } from './review'
import { sessionStatus, type WorkoutSession } from './workout'
import type { PlanSlot } from './routineEvents'

export function slotStatus(slot: PlanSlot | undefined, sessions: WorkoutSession[], today: string) {
  if (!slot) return 'Unscheduled'
  if (slot.movedTo) return 'Rescheduled'
  if (slot.mode === 'rest') return 'Rest'
  if (slot.mode === 'recovery') return 'Recovery'
  const matches = sessions.filter(session => session.day === slot.day && session.planId === slot.planId)
  if (matches.some(session => sessionStatus(session) === 'Completed')) return 'Completed'
  if (matches.some(session => sessionStatus(session) === 'Partial')) return 'Partial'
  return slot.day < today ? 'Missed' : 'Planned'
}
export function plannerCounts(planner: ReadonlyMap<string, PlanSlot>, sessions: WorkoutSession[], week: string, today: string) {
  const statuses = sevenDays(week).map(day => slotStatus(planner.get(day), sessions, today))
  const count = (status: ReturnType<typeof slotStatus>) => statuses.filter(value => value === status).length
  return { planned: statuses.filter(status => ['Planned','Completed','Missed','Partial'].includes(status)).length,
    completed: count('Completed'), missed: count('Missed'), rescheduled: count('Rescheduled'), partial: count('Partial') }
}
