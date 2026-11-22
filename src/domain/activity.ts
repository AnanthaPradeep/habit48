export const activityTypes = ['Outdoor Walking', 'Outdoor Jogging', 'Outdoor Running', 'Indoor Walking', 'Treadmill Running', 'Hiking', 'Cycling'] as const
export type ActivityType = typeof activityTypes[number]
export type Point = { lat: number; lng: number; at: number; accuracy: number; altitude: number | null; speed: number | null; segment: number }
export type Draft = {
  id: string; type: ActivityType; source: 'gps' | 'manual'; started: number; timezone: string
  elapsed: number; resumed: number | null; ended: number | null; points: Point[]
  distance: number; moving: number; segment: number; targetMetres: number; targetSeconds: number
}
export type Activity = Draft & { title: string; notes: string; effort: string; mood: string; editedAt: number }
export const outdoor = (type: ActivityType) => type !== 'Indoor Walking' && type !== 'Treadmill Running'
export const seconds = (draft: Draft, now: number) => draft.elapsed + (draft.resumed === null ? 0 : Math.max(0, now - draft.resumed) / 1000)

export function segmentDistance(a: Point, b: Point) {
  const rad = Math.PI / 180
  const h = Math.sin((b.lat - a.lat) * rad / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin((b.lng - a.lng) * rad / 2) ** 2
  return 12_742_000 * Math.asin(Math.sqrt(Math.min(1, h)))
}

export function acceptPoint(draft: Draft, point: Omit<Point, 'segment'>): Draft {
  if (draft.resumed === null || draft.ended !== null || draft.points.length >= 36_000 ||
      ![point.lat, point.lng, point.at, point.accuracy].every(Number.isFinite) ||
      Math.abs(point.lat) > 90 || Math.abs(point.lng) > 180 || point.at < draft.resumed ||
      point.accuracy < 0 || point.accuracy > 35) return draft
  const previous = draft.points.at(-1)
  if (previous && point.at <= previous.at) return draft
  const interval = previous ? (point.at - previous.at) / 1000 : 0
  const interrupted = !!previous && (interval > 45 || previous.segment !== draft.segment)
  const distance = interrupted || !previous ? 0 : segmentDistance(previous, { ...point, segment: draft.segment })
  const maxSpeed = draft.type === 'Cycling' ? 30 : draft.type === 'Outdoor Walking' || draft.type === 'Hiking' ? 6 : 13
  if (previous && !interrupted && (interval < 2 || distance / interval > maxSpeed ||
      distance < Math.max(3, (point.accuracy + previous.accuracy) / 3))) return draft
  const segment = interrupted && previous.segment === draft.segment ? draft.segment + 1 : draft.segment
  return { ...draft, distance: draft.distance + distance, moving: draft.moving + (distance > 0 ? interval : 0),
    segment, points: [...draft.points, { ...point, segment }] }
}

export function pauseActivity(draft: Draft, now: number): Draft {
  return { ...draft, elapsed: seconds(draft, now), resumed: null }
}

export function recoverActivity(draft: Draft, checkpoint: number): Draft {
  return draft.resumed === null ? draft : pauseActivity(draft, checkpoint)
}

export function splits(points: Point[]) {
  const complete: number[] = []
  let metres = 0
  let duration = 0
  points.forEach((point, index) => {
    const previous = points[index - 1]
    if (!previous || previous.segment !== point.segment) { metres = 0; duration = 0; return }
    let distance = segmentDistance(previous, point)
    if (!distance) return
    let time = (point.at - previous.at) / 1000
    while (metres + distance >= 1000) {
      const remaining = 1000 - metres
      const consumed = time * remaining / distance
      complete.push(duration + consumed)
      time -= consumed
      distance -= remaining
      metres = 0
      duration = 0
    }
    metres += distance
    duration += time
  })
  return complete
}

export function gpx(activity: Activity) {
  const segments = new Map<number, Point[]>()
  for (const point of activity.points) {
    const items = segments.get(point.segment) ?? []
    items.push(point)
    segments.set(point.segment, items)
  }
  const track = [...segments.values()].map(points => '<trkseg>' + points.map(point =>
    '<trkpt lat="' + point.lat + '" lon="' + point.lng + '">' +
    (point.altitude !== null ? '<ele>' + point.altitude + '</ele>' : '') +
    '<time>' + new Date(point.at).toISOString() + '</time></trkpt>').join('') + '</trkseg>').join('')
  return '<?xml version="1.0" encoding="UTF-8"?><gpx version="1.1" creator="My-Routine" xmlns="http://www.topografix.com/GPX/1/1"><trk>' + track + '</trk></gpx>'
}

export function activityCalories(activity: Draft, massKg: number | null | undefined) {
  if (!massKg || massKg <= 0) return null
  const met = activity.type.includes('Running') ? 8 : activity.type.includes('Jogging') ? 7 :
    activity.type === 'Cycling' ? 6 : activity.type === 'Hiking' ? 5 : 3.5
  return Math.round(met * massKg * activity.moving / 3600)
}

export function activityDay(activity: Draft) {
  const parts = new Intl.DateTimeFormat('en-US', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: activity.timezone })
    .formatToParts(activity.started)
  const value = (name: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === name)?.value
  return [value('year'), value('month'), value('day')].join('-')
}

export const isWalk = (type: ActivityType) => type === 'Outdoor Walking' || type === 'Indoor Walking'
export const isRun = (type: ActivityType) => type === 'Outdoor Running' || type === 'Outdoor Jogging' || type === 'Treadmill Running'
