import { expect, test } from 'vitest'
import { acceptPoint, activityCalories, gpx, pauseActivity, recoverActivity, seconds, segmentDistance, splits, type Activity, type Draft } from '../src/domain/activity'

const point = (lat: number, at: number, accuracy = 4) => ({ lat, lng: 0, at, accuracy, altitude: null, speed: null })
const draft: Draft = { id: 'track', type: 'Outdoor Walking', source: 'gps', started: 1000, timezone: 'UTC',
  elapsed: 0, resumed: 1000, ended: null, points: [], distance: 0, moving: 0, segment: 0, targetMetres: 0, targetSeconds: 0 }

test('rejects weak, duplicate, stationary and unrealistic readings', () => {
  expect(acceptPoint(draft, point(0, 2000, 80))).toBe(draft)
  const first = acceptPoint(draft, point(0, 2000))
  expect(acceptPoint(first, point(.01, 2000))).toBe(first)
  expect(acceptPoint(first, point(.000001, 6000))).toBe(first)
  expect(acceptPoint(first, point(.01, 6000))).toBe(first)
  const next = acceptPoint(first, point(.0001, 6000))
  expect(next.distance).toBeCloseTo(11.12, 1)
  expect(next.moving).toBe(4)
})

test('breaks a track across GPS gaps, pause and recovery', () => {
  const first = acceptPoint(draft, point(0, 2000))
  const interrupted = acceptPoint(first, point(1, 52000))
  expect(interrupted.distance).toBe(0)
  expect(interrupted.points.map(item => item.segment)).toEqual([0, 1])
  const recovered = recoverActivity(interrupted, 52000)
  expect(seconds(recovered, 100000)).toBe(51)
  expect(acceptPoint(recovered, point(1.001, 55000))).toBe(recovered)
  const restarted = acceptPoint({ ...recovered, resumed: 100000, segment: 2 }, point(2, 102000))
  expect(restarted.distance).toBe(0)
  expect(seconds(pauseActivity(restarted, 104000), 180000)).toBe(55)
})

test('reports full kilometre splits without bridging gaps and exports recorded GPX points only', () => {
  const points = [{ ...point(0, 1000), segment: 0 }, { ...point(.012, 500000), segment: 0 },
    { ...point(4, 550000), segment: 1 }, { ...point(4.006, 650000), segment: 1 }]
  expect(splits(points)).toHaveLength(1)
  expect(splits(points)[0]).toBeCloseTo(499 * 1000 / segmentDistance(points[0], points[1]))
  const activity: Activity = { ...draft, points, ended: 660000, title: 'Walk', notes: '', effort: '', mood: '', editedAt: 660000 }
  expect(gpx(activity).match(/<trkseg>/g)).toHaveLength(2)
  expect(gpx(activity).match(/<trkpt /g)).toHaveLength(4)
  expect(activityCalories({ ...activity, moving: 1800 }, 70)).toBe(123)
  expect(activityCalories(activity, null)).toBeNull()
})
