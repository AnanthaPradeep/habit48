import { shift, type Entry, type Journal } from './journal'
import { allHabits, type ScheduleFor } from './review'
import type { ScheduleChange } from './routineEvents'

export const weekdayIndex = (day: string) => (new Date(day + 'T12:00:00').getDay() + 6) % 7
export function effectiveSchedule(schedules: Iterable<ScheduleChange>, day: string) {
  let active: ScheduleChange | undefined
  for (const schedule of schedules) if (schedule.effective <= day && (!active || schedule.effective > active.effective)) active = schedule
  return active
}
export function scheduleFor(schedules: Iterable<ScheduleChange>): ScheduleFor {
  const history = [...schedules]
  return day => effectiveSchedule(history, day)?.days[weekdayIndex(day)] ?? allHabits
}
export function scheduledPercent(entry: Entry, due: readonly number[]) {
  return due.length ? due.filter(index => entry.h[index]).length / due.length * 100 : null
}
export function habitStreak(journal: Journal, today: string, scheduled: ScheduleFor) {
  const first = Object.keys(journal.entries).sort()[0]
  if (!first) return 0
  let streak = 0
  let day = today
  if (scheduled(day).length && !scheduled(day).every(index => journal.entries[day]?.h[index])) day = shift(day, -1)
  for (; day >= first; day = shift(day, -1)) {
    const due = scheduled(day)
    if (!due.length) continue
    if (!due.every(index => journal.entries[day]?.h[index])) break
    streak++
  }
  return streak
}
