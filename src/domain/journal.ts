export const habits = [
  'Avoid added sugar', 'Avoid sugarcane & sweetened juice', 'Reduce fried food', 'Limit porotta',
  'Moderate protein', 'Walk 30–45 minutes', 'Adequate water', 'Sleep 7–9 hours', 'Light timely dinner',
] as const
export const meals = ['Breakfast', 'Lunch', 'Snacks', 'Dinner', 'Drinks'] as const
export const metrics = ['Water (L)', 'Walking (min)', 'Sleep (hours)', 'Weight (kg)', 'Strength training (min)'] as const

export interface Food {
  meal: typeof meals[number]
  name: string
  qty: number
  rate: number
}
export interface Entry {
  h: boolean[]
  f: string[]
  m: (string | number | null)[]
  notes: string
  cal?: Food[]
}
export interface Journal {
  start: string
  target: number
  entries: Record<string, Entry>
}

function isoDate(date: Date) {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-')
}
export const today = () => isoDate(new Date())
export const labelDate = (day: string, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat(undefined, options).format(new Date(day + 'T12:00:00'))
export const numberLabel = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 })

export function shift(day: string, days: number) {
  const date = new Date(day + 'T12:00:00')
  date.setDate(date.getDate() + days)
  return isoDate(date)
}
export function monday(day: string) {
  return shift(day, -((new Date(day + 'T12:00:00').getDay() + 6) % 7))
}
export function validDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value
}
export function blankEntry(): Entry {
  return { h: habits.map(() => false), f: meals.map(() => ''), m: metrics.map(() => ''), notes: '', cal: [] }
}
export const blankJournal = (): Journal => ({ start: today(), target: 0, entries: {} })
export const percent = (entry: Entry) => entry.h.filter(Boolean).length * 100 / habits.length
export const challengeCount = (journal: Journal) => Object.keys(journal.entries)
  .filter(day => day >= journal.start && (!journal.target || day <= shift(journal.start, journal.target - 1))).length

function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}
function validEntry(value: unknown): value is Entry {
  return object(value) && Array.isArray(value.h) && value.h.length === habits.length &&
    Array.isArray(value.f) && value.f.length === meals.length &&
    Array.isArray(value.m) && value.m.length === metrics.length &&
    (value.cal === undefined || (Array.isArray(value.cal) && value.cal.every(item =>
      object(item) && typeof item.name === 'string' && meals.some(meal => meal === item.meal) &&
      typeof item.qty === 'number' && Number.isFinite(item.qty) && item.qty >= 0 &&
      typeof item.rate === 'number' && Number.isFinite(item.rate) && item.rate >= 0)))
}
export function isJournal(value: unknown): value is Journal {
  return object(value) && validDate(value.start) && typeof value.target === 'number' &&
    Number.isInteger(value.target) && value.target >= 0 && object(value.entries) &&
    Object.entries(value.entries).every(([day, entry]) => validDate(day) && validEntry(entry))
}

export const keys = {
  journal: 'myroutine-v1', legacy: 'habit48', beforeMerge: 'routine-before-merge',
  pending: 'routine-pending', session: 'routine-session', theme: 'routine-theme',
} as const
export function readJournal(storage: Pick<Storage, 'getItem'>): Journal {
  try {
    const current: unknown = JSON.parse(storage.getItem(keys.journal) ?? 'null')
    if (isJournal(current)) return current
    if (current !== null) return blankJournal()
    const legacy: unknown = JSON.parse(storage.getItem(keys.legacy) ?? 'null')
    if (object(legacy) && validDate(legacy.start) && object(legacy.entries)) {
      const { start } = legacy
      const entries: Journal['entries'] = {}
      for (const [index, entry] of Object.entries(legacy.entries)) {
        const day = shift(start, Number(index) - 1)
        if (validDate(day) && validEntry(entry)) entries[day] = entry
      }
      return { start, target: 48, entries }
    }
  } catch { /* Keep unreadable browser data intact. */ }
  return blankJournal()
}
