import { habits, monday, shift, type Entry, type Journal } from './journal'
import { total } from './calories'
import type { WorkoutSession } from './workout'

export type ActivityMetric = 'Calories' | 'Water' | 'Sleep' | 'Walking'
export type ScheduleFor = (day: string) => readonly number[]
export const allHabits = habits.map((_, index) => index)
const finite = (value: string | number | null | undefined) =>
  value === '' || value == null || !Number.isFinite(Number(value)) ? null : Number(value)
const average = (values: (number | null)[]) => {
  const actual = values.filter((value): value is number => value !== null)
  return { value: actual.length ? actual.reduce((sum, value) => sum + value, 0) / actual.length : null, days: actual.length }
}
export function sevenDays(week: string) {
  return Array.from({ length: 7 }, (_, index) => shift(monday(week), index))
}
export function weeklyReview(journal: Journal, sessions: WorkoutSession[], week: string, today: string,
  scheduled: ScheduleFor = () => allHabits) {
  const habitsByIndex = habits.map(() => ({ done: 0, logged: 0 }))
  const days = sevenDays(week).map(day => {
    const entry: Entry | undefined = day <= today ? journal.entries[day] : undefined
    const due = scheduled(day)
    const done = entry ? due.filter(index => Boolean(entry.h[index])).length : null
    if (entry) for (const index of due) {
      habitsByIndex[index].logged++
      if (entry.h[index]) habitsByIndex[index].done++
    }
    return { day, due: due.length, done, entry, future: day > today }
  })
  const stats = habitsByIndex.map(({ done, logged }, index) => ({ name: habits[index], done, logged,
    rate: logged ? done / logged : null }))
  const ranked = stats.filter(s => s.rate !== null).sort((a,b) =>
    (b.rate ?? 0) - (a.rate ?? 0) || b.logged - a.logged || a.name.localeCompare(b.name))
  const possible = stats.reduce((sum, habit) => sum + habit.logged, 0)
  const done = stats.reduce((sum, habit) => sum + habit.done, 0)
  const metrics: Record<ActivityMetric, ReturnType<typeof average>> = {
    Calories: average(days.map(({ entry }) => entry ? total(entry.cal) : null)),
    Water: average(days.map(({ entry }) => finite(entry?.m[0]))),
    Sleep: average(days.map(({ entry }) => finite(entry?.m[2]))),
    Walking: average(days.map(({ entry }) => finite(entry?.m[1]))),
  }
  return { days, metrics, completion: possible ? done / possible * 100 : null, possible, done,
    loggedDays: days.filter(d => d.entry).length,
    loggedMeals: days.reduce((sum, { entry }) => sum + (entry?.f.filter(text => text.trim()).length ?? 0), 0),
    strongest: ranked[0],
    improvement: [...ranked].reverse().filter(item => item.done < item.logged)[0],
    workouts: sessions.filter(s => s.day >= days[0].day && s.day <= days[6].day && s.day <= today) }
}
