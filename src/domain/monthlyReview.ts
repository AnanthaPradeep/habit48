import { shift, type Journal } from './journal'
import { total } from './calories'
import { dateDistance, monthShift, recordedNumber } from './personalGoals'
import type { ScheduleFor } from './review'
import { sessionStatus, type WorkoutSession } from './workout'
export type CustomCounts = (day: string) => { done: number; due: number; recorded: number }

export function monthReview(journal: Journal, sessions: WorkoutSession[], month: string, today: string,
  scheduled: ScheduleFor, maxDays = Infinity, customCounts?: CustomCounts) {
  const start = monthShift(month, 0)
  const end = shift(monthShift(start, 1), -1)
  const length = dateDistance(start, end) + 1
  const days = Array.from({ length }, (_, index) => {
    const day = shift(start, index)
    const due = scheduled(day)
    const elapsed = day <= today && index < maxDays
    const entry = elapsed ? journal.entries[day] : undefined
    const custom = elapsed ? customCounts?.(day) : undefined
    const done = entry || custom?.recorded ? (entry ? due.filter(index => entry.h[index]).length : 0) + (custom?.done ?? 0) : null
    return { day, entry, done, due: due.length + (custom?.due ?? 0), elapsed,
      possible: (entry ? due.length : 0) + (custom?.recorded ?? 0) }
  })
  const possible = days.reduce((total, day) => total + day.possible, 0)
  const done = days.reduce((total, day) => total + (day.done ?? 0), 0)
  const collect = (index: number) => days.flatMap(({ day, entry }) => {
    const value = entry ? recordedNumber(entry.m[index]) : null
    return value === null ? [] : [{ day, value }]
  })
  const mean = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null
  const walks = collect(1)
  const lastDay = days.filter(day => day.elapsed).at(-1)?.day ?? ''
  const workouts = sessions.filter(session => session.day >= start && session.day <= lastDay)
  return {
    start, end, days, elapsedDays: days.filter(day => day.elapsed).length, workouts,
    workoutCount: workouts.filter(session => sessionStatus(session) === 'Completed').length,
    habit: possible ? done / possible * 100 : null,
    walking: walks.length ? walks.reduce((sum, point) => sum + point.value, 0) : null,
    calorie: mean(days.flatMap(({ entry }) => {
      const value = total(entry?.cal)
      return value === null ? [] : [value]
    })),
    water: mean(collect(0).map(point => point.value)),
    sleep: mean(collect(2).map(point => point.value)),
    weight: collect(3).filter(point => point.value > 0),
  }
}
export function compareMonth(journal: Journal, sessions: WorkoutSession[], month: string, today: string, scheduled: ScheduleFor, customCounts?: CustomCounts) {
  const current = monthReview(journal, sessions, month, today, scheduled, Infinity, customCounts)
  const priorMonth = monthShift(month, -1)
  const partial = current.end > today
  const previous = monthReview(journal, sessions, priorMonth, today, scheduled, partial ? current.elapsedDays : Infinity, customCounts)
  const comparable = partial && previous.elapsedDays < current.elapsedDays
    ? monthReview(journal, sessions, month, today, scheduled, previous.elapsedDays, customCounts)
    : current
  return { current, previous, comparable }
}
