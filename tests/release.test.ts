import { expect, test } from 'vitest'
import { blankEntry, type Journal } from '../src/domain/journal'
import { weeklyReview } from '../src/domain/review'
import { projectEvents } from '../src/domain/routineEvents'
import { habitStreak, scheduleFor, scheduledPercent } from '../src/domain/schedule'
import { plannerCounts, slotStatus } from '../src/domain/planner'
import { mergeJournal } from '../src/services/cloud'
import { exerciseHistory, sessionStatus, type WorkoutSession } from '../src/domain/workout'
import { projectQuick, type QuickAction } from '../src/domain/quickLog'

const journal: Journal = { start: '2026-11-16', target: 0, entries: {} }
test('keeps overlapping cloud edits while merging independent changes on the same date', () => {
  const day = '2026-11-20'
  const before = blankEntry()
  const local = { ...before, m: ['', '10', '', '', ''], notes: 'offline note' }
  const cloud = { ...before, notes: 'newer note' }
  const merged = mergeJournal({ ...journal, entries: { [day]: local } }, { ...journal, entries: { [day]: cloud } },
    { ...journal, entries: { [day]: before } }, () => false)
  expect(merged.entries[day]).toMatchObject({ notes: 'newer note', m: local.m })
})
test('reviews a Monday to Sunday week, preserving measured zeros and missing days', () => {
  const monday = blankEntry()
  monday.h[0] = true
  monday.m[0] = '0'
  monday.m[2] = '6'
  const tuesday = blankEntry()
  tuesday.m[2] = ''
  const review = weeklyReview({ ...journal, entries: { '2026-11-16': monday, '2026-11-17': tuesday } }, [], '2026-11-20',
    '2026-11-20', () => [0,1])
  expect(review.days.map(day => day.day)).toEqual(['2026-11-16','2026-11-17','2026-11-18','2026-11-19','2026-11-20','2026-11-21','2026-11-22'])
  expect(review.completion).toBe(25)
  expect(review.days[2].done).toBeNull()
  expect(review.days[5].future).toBe(true)
  expect(review.metrics.Water).toEqual({ value: 0, days: 1 })
  expect(review.metrics.Sleep).toEqual({ value: 6, days: 1 })
  expect(review.metrics.Calories.value).toBeNull()
})

test('weekly goals accept later revisions and quietly reject stale offline toggles', () => {
  const goal = { id: 'goal', week: '2026-11-23', text: 'Walk twice', done: false, expected: null }
  const projected = projectEvents([
    { id: 'a', kind: 'goal', payload: goal, position: 1 },
    { id: 'b', kind: 'goal', payload: { ...goal, done: true, expected: 'a' }, position: 2 },
    { id: 'c', kind: 'goal', payload: { ...goal, expected: 'a' }, position: 3 },
  ])
  expect(projected.goals.get('goal')?.done).toBe(true)
  expect(projected.rejected).toEqual(['c'])
})

test('historical schedules apply from their effective dates and rest days preserve streaks', () => {
  const due = scheduleFor([{ effective: '2026-11-16', expected: null, days: [[0],[0],[0],[0],[0],[],[]] },
    { effective: '2026-11-24', expected: null, days: [[1],[1],[1],[1],[1],[],[]] }])
  const completed = blankEntry()
  completed.h[0] = true
  expect(due('2026-11-13')).toHaveLength(9)
  expect(due('2026-11-23')).toEqual([0])
  expect(due('2026-11-24')).toEqual([1])
  expect(scheduledPercent(completed, due('2026-11-22'))).toBeNull()
  expect(habitStreak({ ...journal, entries: { '2026-11-20': completed, '2026-11-23': completed } }, '2026-11-23', due)).toBe(2)
})

test('rescheduling moves one assignment and keeps its origin in the previous week', () => {
  const from = '2026-11-19'
  const to = '2026-11-23'
  const { planner, rejected } = projectEvents([
    { id: 'a', position: 1, kind: 'plan', payload: { day: from, mode: 'workout', planId: 'full', name: 'Full body', expected: null } },
    { id: 'b', position: 2, kind: 'move', payload: { from, to, expected: 'a', targetExpected: null } },
    { id: 'c', position: 3, kind: 'move', payload: { from, to: '2026-11-24', expected: 'a', targetExpected: null } },
  ])
  expect(rejected).toEqual(['c'])
  expect(slotStatus(planner.get(from), [], '2026-11-20')).toBe('Rescheduled')
  expect(slotStatus(planner.get(to), [], '2026-11-20')).toBe('Planned')
  expect(plannerCounts(planner, [], from, '2026-11-20')).toMatchObject({ planned: 0, rescheduled: 1 })
  expect(plannerCounts(planner, [], to, '2026-11-24')).toMatchObject({ planned: 1, missed: 1 })
})

test('exercise progress separates unloaded and fixed dumbbell sets and labels partial sessions', () => {
  const session: WorkoutSession = { id: 's', day: '2026-11-20', finishedAt: '2026-11-20T11:00:00Z', name: 'Strength',
    seconds: 100, strength: true, energy: null, plannedSets: 4, sets: [
      { position: 0, exerciseId: 'curl', reps: 8, kg: 5 },
      { position: 1, exerciseId: 'curl', reps: 10, kg: 0 },
    ] }
  expect(sessionStatus(session)).toBe('Partial')
  expect(sessionStatus({ ...session, plannedSets: undefined })).toBe('Logged')
  expect(sessionStatus({ ...session, plannedSets: 2 })).toBe('Completed')
  expect(exerciseHistory([session], 'curl', 'dumbbell')[0]).toMatchObject({ total: 8, volume: 40 })
  expect(exerciseHistory([session], 'curl', 'bodyweight')[0]).toMatchObject({ total: 10, volume: null })
})

test('quick logs rebase increments, deduplicate receipts and protect newer values on undo', () => {
  const day = '2026-11-20'
  const entry = blankEntry()
  entry.m[0] = '1'
  const action: QuickAction = { id: 'water', day, kind: 'metric', index: 0, amount: .25 }
  const first = projectQuick({ ...journal, entries: { [day]: entry } }, [action,action])
  expect(first.entries[day].m[0]).toBe('1.25')
  const undo: QuickAction = { id: 'undo', day, kind: 'undo', target: 'water' }
  expect(projectQuick(first, [undo]).entries[day].m[0]).toBe('1')
  const newer = { ...first, entries: { [day]: { ...first.entries[day], m: ['2','','','',''] } } }
  expect(projectQuick(newer, [undo]).entries[day].m[0]).toBe('2')
})

test('quick meal logs preserve existing manual calorie corrections', () => {
  const day = '2026-11-20'
  const entry = { ...blankEntry(), cal: [{ meal: 'Lunch' as const, name: 'Manual', qty: 1, rate: 500 }] }
  const result = projectQuick({ ...journal, entries: { [day]: entry } }, [{ id: 'food', day, kind: 'meal', index: 0, text: '2 idli' }])
  expect(result.entries[day].f[0]).toBe('2 idli')
  expect(result.entries[day].cal?.map(food => food.rate)).toEqual([500,60])
})
