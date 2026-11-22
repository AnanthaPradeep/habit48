import { shift } from './journal'
import { weekdayIndex } from './schedule'

export interface CustomHabit {
  id: string; effective: string; title: string; description: string; icon: string; category: string
  unit: 'Check' | 'Count' | 'Minutes' | 'Quantity'; target: number; days: number[]; archived: boolean; expected: string | null
}
export interface HabitLog { id: string; habit: string; day: string; value: number; expected: string | null }
export function customHabitAt(history: Iterable<CustomHabit>, id: string, day: string) {
  let current: CustomHabit | undefined
  for (const habit of history) if (habit.id === id && habit.effective <= day && (!current || habit.effective > current.effective)) current = habit
  return current
}
export function customHabitsFor(history: CustomHabit[], day: string) {
  return [...new Set(history.map(habit => habit.id))].flatMap(id => {
    const habit = customHabitAt(history, id, day)
    return habit && !habit.archived ? [habit] : []
  })
}
export function customStreak(history: CustomHabit[], logs: ReadonlyMap<string, HabitLog>, id: string, day: string,
  isRest: (day: string) => boolean) {
  const first = history.filter(habit => habit.id === id).map(habit => habit.effective).sort()[0]
  let streak = 0
  for (let date = day; first && date >= first; date = shift(date, -1)) {
    const habit = customHabitAt(history, id, date)
    if (!habit || habit.archived || isRest(date) || !habit.days.includes(weekdayIndex(date))) continue
    if ((logs.get(id + ':' + date)?.value ?? 0) >= habit.target) streak++
    else if (date !== day) break
  }
  return streak
}
