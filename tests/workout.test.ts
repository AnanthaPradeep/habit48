import { describe, expect, test } from 'vitest'
import { exerciseById, exercises } from '../src/domain/exercises'
import { completeSet, elapsed, finishWorkout, full, rest, sequence, streak, togglePause, type WorkoutDraft } from '../src/domain/workout'

const start: WorkoutDraft = { id: 'test-session', day: '2026-11-20', plan: full, sets: [], elapsed: 0,
  runningSince: 1000, restUntil: null, pausedRest: 0 }

describe('Workout Studio', () => {
  test('includes 40 exercises with instructional details and supported equipment', () => {
    expect(exercises.length).toBeGreaterThanOrEqual(40)
    expect(exerciseById.size).toBe(exercises.length)
    for (const exercise of exercises) {
      expect(exercise).toMatchObject({ form: expect.any(String), breathing: expect.any(String),
        mistake: expect.any(String), alternative: expect.any(String), pose: expect.any(String) })
      expect(exercise.weights).toBeLessThanOrEqual(2)
    }
    expect(full.steps).toHaveLength(6)
  })
  test('preserves rest and elapsed time while paused and prevents duplicate set completion', () => {
    const first = completeSet(start, 10, 0, 9000)
    expect(first.sets).toHaveLength(1)
    expect(completeSet(first, 10, 0, 9001)).toBe(first)
    const paused = togglePause(first, 14000)
    expect(elapsed(paused, 100000)).toBe(13000)
    expect(rest(paused, 100000)).toBe(55000)
    const resumed = togglePause(paused, 100000)
    expect(rest(resumed, 154000)).toBe(1000)
    const next = completeSet(resumed, 9, 0, 155000)
    expect(next.sets.map(set => set.reps)).toEqual([10,9])
    expect(sequence(full).length).toBeGreaterThan(next.sets.length)
  })
  test('calculates a rough estimate only when a weight is available and counts streaks by distinct day', () => {
    expect(finishWorkout(start, 241000, 70)).toBeNull()
    const completed = completeSet(start, 10, 0, 240000)
    const saved = finishWorkout(completed, 241000, 70)!
    expect(saved).toMatchObject({ seconds: 240, energy: 14, strength: true })
    expect(finishWorkout(completed, 241000)?.energy).toBeNull()
    expect(streak([saved, saved, { ...saved, day: '2026-11-19' }], '2026-11-20')).toBe(2)
  })
})
