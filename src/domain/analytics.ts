import { total } from './calories'
import { monday, percent, type Entry, type Journal } from './journal'

export type Period = 'daily' | 'weekly' | 'monthly'
export type Metric = 'habit' | 'cal' | '0' | '1' | '2' | '3' | '4'
export interface Filters { from: string; to: string; period: Period; metric: Metric }
const average = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null
const strengthDays = (entries: Entry[]) => entries.filter(entry => Number(entry.m[4]) > 0).length

export function report(journal: Journal, { from, to, period, metric }: Filters) {
  const rows = Object.entries(journal.entries).filter(([day]) => day >= from && day <= to)
    .sort(([a], [b]) => a.localeCompare(b))
  const groups = new Map<string, Entry[]>()
  for (const [day, entry] of rows) {
    const key = period === 'weekly' ? monday(day) : period === 'monthly' ? day.slice(0, 7) : day
    const entries = groups.get(key) ?? []
    entries.push(entry)
    groups.set(key, entries)
  }
  const values = [...groups].map(([key, entries]) => ({
    key,
    count: entries.length,
    habit: average(entries.map(percent)) ?? 0,
    calories: average(entries.flatMap(entry => total(entry.cal) ?? [])),
    strength: strengthDays(entries),
    value: average(entries.flatMap(entry => {
      if (metric === 'habit') return percent(entry)
      if (metric === 'cal') return total(entry.cal) ?? []
      const value = entry.m[Number(metric)]
      return value === '' || value == null || !Number.isFinite(Number(value)) ? [] : Number(value)
    })),
  }))
  const entries = rows.map(([, entry]) => entry)
  const completion = average(entries.map(percent))
  const summary = `${rows.length} logged ${rows.length === 1 ? 'day' : 'days'} · ${completion === null ? 'No entries' : Math.round(completion) + '% average habits'} · ${strengthDays(entries)} strength days`
  return { rows, values, summary }
}
