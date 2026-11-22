import { useState } from 'react'
import { labelDate, monday, shift, today, type Journal } from '../domain/journal'
import { monthShift } from '../domain/personalGoals'
import type { ScheduleFor } from '../domain/review'
import { Modal } from './Controls'

function status(journal: Journal, scheduled: ScheduleFor, id: number, day: string, current: string) {
  if (day > current) return 'Future'
  if (!scheduled(day).includes(id)) return 'Rest'
  const entry = journal.entries[day]
  return !entry ? 'Not logged' : entry.h[id] ? 'Completed' : 'Missed'
}
export function habitRecord(journal: Journal, scheduled: ScheduleFor, id: number, day: string) {
  const dates = Object.keys(journal.entries).filter(date => date <= day).sort()
  let current = 0
  let longest = 0
  let weekly = 0
  let weekDue = 0
  const week = monday(day)
  const start = dates[0] && dates[0] < week ? dates[0] : week
  for (let date = start; date <= day; date = shift(date, 1)) {
    const value = status(journal, scheduled, id, date, day)
    if (value === 'Rest') continue
    if (date >= week) {
      weekDue++
      if (value === 'Completed') weekly++
    }
    if (value === 'Completed') { current++; longest = Math.max(longest, current) }
    else if (!(date === day && value === 'Not logged')) current = 0
  }
  return { current, longest, weekly, weekDue }
}

export function HabitDetail({ name, id, journal, scheduled, day, close }: {
  name: string; id: number; journal: Journal; scheduled: ScheduleFor; day: string; close(): void
}) {
  return <HabitHistory name={name} day={day} close={close}
    state={date => status(journal, scheduled, id, date, today())} />
}

export function HabitHistory({ name, day, close, state, amount }: {
  name: string; day: string; close(): void; state(date: string): string; amount?(date: string): number | undefined
}) {
  const [month, setMonth] = useState(() => monthShift(day, 0))
  const now = today()
  const [period, setPeriod] = useState<'week' | 'month'>('week')
  const start = period === 'week' ? monday(day) : month
  const count = period === 'week' ? 7 : (Date.parse(monthShift(month, 1)) - Date.parse(month)) / 86400000
  const dates = Array.from({ length: count }, (_, i) => shift(start, i))
  const states = dates.map(state)
  const year = Array.from({ length: 365 }, (_, i) => shift(now, i - 364))
  const amounts = dates.flatMap(date => {
    const value = amount?.(date)
    return value === undefined ? [] : [value]
  })
  const total = amounts.reduce((sum, value) => sum + value, 0)
  return <Modal title={name} close={close}><div className="habit-detail">
    <div className="progress-actions">
      <button className="quiet-button" aria-pressed={period === 'week'} onClick={() => setPeriod('week')}>Week</button>
      <button className="quiet-button" aria-pressed={period === 'month'} onClick={() => setPeriod('month')}>Month</button>
      {period === 'month' && <><button className="quiet-button" onClick={() => setMonth(monthShift(month, -1))}>Previous month</button>
        <button className="quiet-button" disabled={monthShift(month, 1) > now} onClick={() => setMonth(monthShift(month, 1))}>Next month</button></>}
    </div>
    <p>{period === 'month' ? labelDate(month, { month: 'long', year: 'numeric' }) : 'Selected week'}</p>
    <div className="habit-grid">{dates.map((date, i) => <span key={date} data-status={states[i]}
      title={date + ' · ' + states[i]} aria-label={date + ' · ' + states[i]}>{Number(date.slice(-2))}</span>)}</div>
    <p>{states.filter(value => value === 'Completed').length} completed · {states.filter(value => value === 'Partial').length} partial · {states.filter(value => value === 'Missed').length} missed</p>
    {!!amounts.length && <p>Total {Number(total.toFixed(2))} · Average {Number((total / amounts.length).toFixed(2))} on logged days</p>}
    <h3>Last 365 days</h3>
    <div className="habit-year" role="img" aria-label={name + ' yearly consistency heatmap'}>
      {year.map(date => {
        const value = state(date)
        return <span key={date} data-status={value} title={date + ' · ' + value} />
      })}
    </div>
    <p className="muted">Solid green completed · Ring partial · Peach missed · Lilac rest · Neutral not logged · Faded future</p>
  </div></Modal>
}
