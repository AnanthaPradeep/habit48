import { total } from './calories'
import { monday, type Entry, type Journal } from './journal'
import { allHabits, type ScheduleFor } from './review'
import { scheduledPercent } from './schedule'

export type Period = 'daily' | 'weekly' | 'monthly'
export type Metric = 'habit' | 'cal' | '0' | '1' | '2' | '3' | '4'
export interface Filters { from: string; to: string; period: Period; metric: Metric }
const average = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null
const strengthDays = (entries: Entry[]) => entries.filter(entry => Number(entry.m[4]) > 0).length

export function report(journal: Journal, { from, to, period, metric }: Filters, scheduled: ScheduleFor = () => allHabits) {
  const rows = Object.entries(journal.entries).filter(([day]) => day >= from && day <= to)
    .sort(([a], [b]) => a.localeCompare(b))
  const groups = new Map<string, typeof rows>()
  for (const [day, entry] of rows) {
    const key = period === 'weekly' ? monday(day) : period === 'monthly' ? day.slice(0, 7) : day
    const entries = groups.get(key) ?? []
    entries.push([day, entry])
    groups.set(key, entries)
  }
  const values = [...groups].map(([key, entries]) => ({
    key,
    count: entries.length,
    habit: average(entries.flatMap(([day, entry]) => scheduledPercent(entry, scheduled(day)) ?? [])),
    calories: average(entries.flatMap(([, entry]) => total(entry.cal) ?? [])),
    strength: strengthDays(entries.map(([, entry]) => entry)),
    value: average(entries.flatMap(([day, entry]) => {
      if (metric === 'habit') return scheduledPercent(entry, scheduled(day)) ?? []
      if (metric === 'cal') return total(entry.cal) ?? []
      const value = entry.m[Number(metric)]
      return value === '' || value == null || !Number.isFinite(Number(value)) ? [] : Number(value)
    })),
  }))
  const entries = rows.map(([, entry]) => entry)
  const completion = average(rows.flatMap(([day, entry]) => scheduledPercent(entry, scheduled(day)) ?? []))
  const summary = `${rows.length} logged ${rows.length === 1 ? 'day' : 'days'} · ${completion === null ? 'No entries' : Math.round(completion) + '% average habits'} · ${strengthDays(entries)} strength days`
  return { rows, values, summary }
}
