import { useState } from 'react'
import { createPortal, flushSync } from 'react-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { compareMonth, type CustomCounts } from '../domain/monthlyReview'
import { goalProgress, monthShift } from '../domain/personalGoals'
import { labelDate, numberLabel, today } from '../domain/journal'
import { weekdayIndex } from '../domain/schedule'
import { sessionStatus } from '../domain/workout'
import type { Reflection, Versioned } from '../domain/routineEvents'
import { ExerciseProgress } from './ExerciseProgress'
import { download, monthlyWorkbook } from '../services/exports'
import type { GoalData } from './MyGoals'

const display = (value: number | null, unit = '') => value === null ? '—' : numberLabel.format(value) + unit
export default function MonthlyReview({ reflections, customCounts, ...data }: GoalData & {
  reflections: ReadonlyMap<string, Versioned<Reflection>>; customCounts: CustomCounts
}) {
  const day = today()
  const [month, setMonth] = useState(() => monthShift(day, 0))
  const [printing, print] = useState(false)
  const { current, previous, comparable } = compareMonth(data.journal, data.sessions, month, day, data.scheduled, customCounts)
  const title = labelDate(month, { month: 'long', year: 'numeric' })
  const metrics = [
    ['Habit consistency', current.habit, previous.habit, comparable.habit, '%', ' pp'],
    ['Completed workouts', current.workoutCount, previous.workoutCount, comparable.workoutCount, '', ' sessions'],
    ['Walking', current.walking, previous.walking, comparable.walking, ' min', ' min'],
    ['Average sleep', current.sleep, previous.sleep, comparable.sleep, ' hrs', ' hrs'],
    ['Average calories', current.calorie, previous.calorie, comparable.calorie, ' kcal', ' kcal'],
    ['Average water', current.water, previous.water, comparable.water, ' L', ' L'],
  ] as const
  const goals = data.goals.filter(goal => goal.start <= current.end && goal.end >= current.start).map(goal => {
    const result = goalProgress(goal, data.journal, data.sessions, data.logs, data.scheduled,
      day < current.end ? day : current.end, data.customDates)
    return { title: goal.title, status: result.achieved ? 'Achieved · ' + result.achieved :
      goal.state === 'Archived' ? 'Archived' : goal.end < day && goal.end <= current.end ? 'Missed' : 'Incomplete' }
  })
  const reflection = reflections.get(month)
  const rows = [
    [title], ['Metric', 'Selected month', 'Previous month', 'Selected comparison period'],
    ...metrics.map(([name, value, prior, matched, unit]) => [name, display(value, unit), display(prior, unit), display(matched, unit)]),
    ['Date', 'Habit completion', 'Weight (kg)'],
    ...current.days.filter(date => date.elapsed).map(date => [date.day, date.done === null || !date.possible ? null : Math.round(date.done / date.possible * 100),
      current.weight.find(point => point.day === date.day)?.value ?? null]),
    ['Goal', 'Status'], ...goals.map(goal => [goal.title, goal.status]),
    ['Workout date', 'Workout', 'Status', 'Sets'],
    ...current.workouts.map(session => [session.day, session.name, sessionStatus(session), session.sets.length]),
    ['Reflection', reflection?.notes ?? ''], ['Next month’s focus', reflection?.focus ?? ''],
  ]
  return <section className="panel progress-module" aria-label="Monthly Review">
    <div className="progress-banner"><p>{title}</p><h2>A month of progress.</h2>
      <p>{current.end > day ? 'Comparison uses the first ' + comparable.elapsedDays + ' days of each month.' : 'Compared with the previous calendar month.'}</p></div>
    <div className="progress-actions">
      <button aria-label="Previous month" onClick={() => setMonth(monthShift(month, -1))}><ChevronLeft size={18} /></button>
      <label>Review month <input type="month" max={day.slice(0, 7)} value={month.slice(0, 7)} onChange={event => {
        if (/^\d{4}-\d{2}$/.test(event.target.value) && event.target.value <= day.slice(0, 7)) setMonth(event.target.value + '-01')
      }} /></label>
      <button aria-label="Next month" disabled={monthShift(month, 1) > day} onClick={() => setMonth(monthShift(month, 1))}><ChevronRight size={18} /></button>
      <a href="#review">Weekly Review</a>
    </div>
    <div className="progress-grid">{metrics.map(([name, value, prior, matched, unit, deltaUnit]) => <article className="progress-tile" key={name}>
      <h3>{name}</h3><strong>{display(value, unit)}</strong>
      <p>{matched === null || prior === null ? 'Comparison unavailable' :
        (matched - prior > 0 ? '+' : '') + display(matched - prior, deltaUnit) + ' vs previous month'}</p>
    </article>)}</div>
    <h3>Daily habit heatmap</h3>
    <div className="month-heatmap">
      {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(label => <span key={label}>{label}</span>)}
      {Array.from({ length: weekdayIndex(month) }, (_, i) => <span key={'empty-' + i} />)}
      {current.days.map(({ day, done, due, possible, elapsed }) => {
        const rate = done === null || !possible ? null : done / possible
        const level = !elapsed ? 'future' : !due ? 'rest' : rate === null ? 'missing' : rate >= .9 ? 'high' : rate >= .5 ? 'mid' : 'low'
        const description = level === 'rest' ? 'Rest day' : rate === null ? 'No logged completion' : display(rate * 100, '%')
        return <span key={day} data-level={level} title={day + ' · ' + description} aria-label={day + ' · ' + description}>{Number(day.slice(-2))}</span>
      })}
    </div>
    <p>Peach below 50% · Lime 50–89% · Forest 90–100% · Lilac rest · Grey no data</p>
    <h3>Habit consistency trend</h3>
    <div className="progress-grid">{Array.from({ length: Math.ceil(current.days.length / 7) }, (_, index) => {
      const block = (days: typeof current.days) => {
        const week = days.slice(index * 7, index * 7 + 7)
        const possible = week.reduce((sum, date) => sum + date.possible, 0)
        return possible ? week.reduce((sum, date) => sum + (date.done ?? 0), 0) / possible * 100 : null
      }
      const values = [['This month', block(comparable.days)], ['Previous month', block(previous.days)]] as const
      return <article className="progress-tile" key={index}><h4>Days {index * 7 + 1}–{Math.min(index * 7 + 7, current.days.length)}</h4>
        {values.map(([name, rate]) => <div key={name}>{name} · {display(rate, '%')}
          {rate !== null && <progress aria-label={name + ' days ' + (index * 7 + 1)} value={rate} max={100} />}</div>)}</article>
    })}</div>
    {current.weight.length > 0 && <details><summary>Weight trend · {current.weight.length} measurements</summary>
      <ol>{current.weight.map(point => <li key={point.day}>{point.day} · {display(point.value, ' kg')}</li>)}</ol>
    </details>}
    <ExerciseProgress sessions={current.workouts} />
    <div className="progress-grid"><section className="progress-tile"><h3>Goal outcomes</h3>
      {goals.length ? <ul>{goals.map((goal, i) => <li key={i}>{goal.title} · {goal.status}</li>)}</ul> : <p>No goals for this month.</p>}</section>
      <section className="progress-tile"><h3>Next month’s goals</h3>
        <ul>{data.goals.filter(goal => goal.state !== 'Archived' && goal.start >= monthShift(month, 1) && goal.start < monthShift(month, 2))
          .map(goal => <li key={goal.id}>{goal.title}</li>)}</ul><a href="#today">Manage My Goals</a></section></div>
    <ReflectionForm key={month} month={month} reflection={reflection} append={data.append} />
    <div className="progress-actions">
      <button onClick={() => download(monthlyWorkbook(rows), 'my-routine-' + month.slice(0, 7) + '.xlsx')}>Export monthly Excel</button>
      <button onClick={() => { flushSync(() => print(true)); try { window.print() } finally { print(false) } }}>Print or save monthly PDF</button>
    </div>
    {printing && createPortal(<MonthlyPrint rows={rows} />, document.getElementById('privateApp')!)}
  </section>
}

function MonthlyPrint({ rows }: { rows: (string | number | null)[][] }) {
  return <article className="month-print"><h1>My Routine Monthly Review</h1><table><tbody>
    {rows.map((row, index) => <tr key={index}>{row.map((value, column) => <td key={column}>{value ?? '—'}</td>)}</tr>)}
  </tbody></table></article>
}

function ReflectionForm({ month, reflection, append }: {
  month: string; reflection?: Versioned<Reflection>; append: GoalData['append']
}) {
  const [draft, setDraft] = useState<Reflection | null>(null)
  const [status, setStatus] = useState('')
  const value = draft ?? { month, notes: reflection?.notes ?? '', focus: reflection?.focus ?? '', expected: reflection?.revision ?? null }
  return <form className="progress-form" onSubmit={event => {
    event.preventDefault()
    if (draft && append({ kind: 'reflection', payload: draft })) { setDraft(null); setStatus('Reflection saved on this device') }
  }}>
    <label>What went well?<textarea maxLength={400} value={value.notes} onChange={event => setDraft({ ...value, notes: event.target.value })} /></label>
    <label>Next month’s focus<textarea maxLength={400} value={value.focus} onChange={event => setDraft({ ...value, focus: event.target.value })} /></label>
    <div className="progress-actions"><button disabled={!draft}>Save reflection</button><p role="status">{status}</p></div>
  </form>
}
