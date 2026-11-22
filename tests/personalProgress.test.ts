import { describe, expect, it } from 'vitest'
import { blankEntry, blankJournal } from '../src/domain/journal'
import { allHabits } from '../src/domain/review'
import { compareMonth } from '../src/domain/monthlyReview'
import { goalProgress, goalRange, type PersonalGoal } from '../src/domain/personalGoals'
import { projectEvents } from '../src/domain/routineEvents'
import { customStreak, type CustomHabit } from '../src/domain/customHabits'
import { quietAt } from '../src/components/SmartReminders'
import { completeSet, step, togglePause, type WorkoutDraft } from '../src/domain/workout'

const schedule = () => allHabits
const goal: PersonalGoal = { id: 'goal', title: 'Walking', kind: 'Walking', frequency: 'Monthly',
  start: '2024-02-01', end: '2024-02-29', target: 30, threshold: 0, habit: 0, state: 'Active', expected: null }

describe('personal progress', () => {
  it('uses Monday weeks and leap-year calendar months', () => {
    expect(goalRange('2024-03-01', 'Weekly')).toEqual(['2024-02-26', '2024-03-03'])
    expect(goalRange('2024-02-19', 'Monthly')).toEqual(['2024-02-01', '2024-02-29'])
  })
  it('calculates automatic progress and the first achievement date', () => {
    const journal = blankJournal()
    journal.entries['2024-02-01'] = { ...blankEntry(), m: ['', 0, '', '', ''] }
    journal.entries['2024-02-03'] = { ...blankEntry(), m: ['', 30, '', '', ''] }
    expect(goalProgress(goal, journal, [], [], schedule, '2024-02-03')).toMatchObject({
      value: 30, achieved: '2024-02-03', percentage: 100, recorded: 2,
    })
  })
  it('compares matched elapsed days and distinguishes an unlogged metric from zero', () => {
    const journal = blankJournal()
    journal.entries['2024-01-03'] = { ...blankEntry(), m: [5, 90, 6, '', ''] }
    journal.entries['2024-02-01'] = { ...blankEntry(), m: ['', 0, '', '', ''] }
    const { current, previous } = compareMonth(journal, [], '2024-02-01', '2024-02-02', schedule)
    expect(current.days).toHaveLength(29)
    expect(current.walking).toBe(0)
    expect(current.water).toBeNull()
    expect(previous.walking).toBeNull()
    expect(previous.elapsedDays).toBe(2)
  })
  it('retains a new cloud goal when an offline edit used an older revision', () => {
    const result = projectEvents([
      { id: 'one', position: 1, kind: 'personal_goal', payload: goal },
      { id: 'two', position: 2, kind: 'personal_goal', payload: { ...goal, title: 'Newer', expected: 'one' } },
      { id: 'three', kind: 'personal_goal', payload: { ...goal, title: 'Stale', expected: 'one' } },
    ])
    expect(result.personalGoals.get(goal.id)?.title).toBe('Newer')
    expect(result.rejected).toEqual(['three'])
  })
  it('keeps completed sets and paused time after recovering a saved draft', () => {
    const draft: WorkoutDraft = { id: 'shared', day: '2024-02-01', plan: { id: 'plan', name: 'Plan', minutes: 5,
      steps: [step('wall-push')] }, sets: [], elapsed: 0, runningSince: 1000, restUntil: null, pausedRest: 0, notes: 'Easy pace' }
    const saved = togglePause(completeSet(draft, 8, 0, 3000), 4000)
    const result = projectEvents([{ id: 'start', position: 1, kind: 'active_workout', payload: { draft, expected: null } },
      { id: 'saved', position: 2, kind: 'active_workout', payload: { draft: saved, expected: 'start' } },
      { id: 'stale', kind: 'active_workout', payload: { draft: null, expected: 'start' } }])
    expect(result.activeWorkout?.draft).toMatchObject({ sets: [{ reps: 8, kg: 0 }], elapsed: 3000, runningSince: null, notes: 'Easy pace' })
  })
  it('uses historical custom targets and skips planned rest days', () => {
    const first: CustomHabit = { id: 'read', title: 'Reading', description: '', category: '', icon: 'BookOpen', unit: 'Count',
      effective: '2024-02-01', target: 5, days: [0, 1, 2, 3, 4, 5, 6], archived: false, expected: null }
    const second = { ...first, effective: '2024-02-03', target: 10 }
    const dates = ['2024-02-01', '2024-02-03']
    const logs = new Map(dates.map((day, index) => [first.id + ':' + day, { id: first.id + ':' + day,
      habit: first.id, day, value: index ? 10 : 5, expected: null }]))
    expect(customStreak([first, second], logs, first.id, dates[1], day => day === '2024-02-02')).toBe(2)
  })
  it('handles quiet hours across midnight without suppressing the end time', () => {
    expect(quietAt('23:40', '22:00', '07:00')).toBe(true)
    expect(quietAt('06:59', '22:00', '07:00')).toBe(true)
    expect(quietAt('07:00', '22:00', '07:00')).toBe(false)
  })
})
