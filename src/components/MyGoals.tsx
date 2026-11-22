import { useState, type FormEvent } from 'react'
import { Target } from 'lucide-react'
import { habits, labelDate, numberLabel, today, validDate, type Journal } from '../domain/journal'
import { goalProgress, goalRange, goalTemplates, goalUnits, manualGoal, type Frequency, type GoalKind, type GoalLog, type PersonalGoal } from '../domain/personalGoals'
import type { ScheduleFor } from '../domain/review'
import type { EventChange, Versioned } from '../domain/routineEvents'
import type { WorkoutSession } from '../domain/workout'

const frequencies: Frequency[] = ['Daily', 'Weekly', 'Monthly', 'Custom']
const kinds: GoalKind[] = ['Workout', 'Walking', 'Hydration', 'Sleep', 'Habit', 'Custom habit', 'Weight', 'Reading', 'Custom']
export interface GoalData {
  journal: Journal
  sessions: WorkoutSession[]
  goals: Versioned<PersonalGoal>[]
  logs: GoalLog[]
  customOptions: { id: string; title: string }[]
  customDates(habit: string): { day: string; amount: number }[]
  scheduled: ScheduleFor
  append(change: EventChange): boolean
}

export default function MyGoals(data: GoalData) {
  const day = today()
  const [editing, edit] = useState<PersonalGoal | null>(null)
  const [history, showHistory] = useState(false)
  const [notice, setNotice] = useState('')
  const [logging, startLog] = useState('')
  const [amount, setAmount] = useState('')
  const active = data.goals.filter(goal => goal.state !== 'Archived' && goal.start <= day && goal.end >= day)
  const sorted = [...data.goals].sort((a, b) => b.end.localeCompare(a.end))
  const achieved = active.filter(goal => goalProgress(goal, data.journal, data.sessions, data.logs, data.scheduled, day, data.customDates).achieved).length
  function create(template?: typeof goalTemplates[number], original?: PersonalGoal) {
    const frequency = template?.frequency ?? original?.frequency ?? 'Monthly'
    const anchor = original && original.end >= day ? nextDay(original.end) : day
    const [start, end] = goalRange(anchor, frequency)
    edit({ id: crypto.randomUUID(), title: template?.title ?? original?.title ?? '', kind: template?.kind ?? original?.kind ?? 'Workout',
      frequency, start, end, target: template?.target ?? original?.target ?? 1, habit: template?.habit ?? original?.habit ?? 0,
      threshold: template?.threshold ?? original?.threshold ?? 0, customHabit: original?.customHabit, state: 'Active', expected: null })
    setNotice('')
  }
  function save(goal: PersonalGoal) {
    const { id, title, kind, frequency, start, end, target, threshold, habit, customHabit, state, expected } = goal
    return data.append({ kind: 'personal_goal', payload: { id, title: title.trim(), kind, frequency, start, end, target, threshold, habit, customHabit, state, expected } })
  }
  function submit(event: FormEvent) {
    event.preventDefault()
    if (!editing || !validDate(editing.start) || !validDate(editing.end) || editing.start > editing.end ||
      !editing.title.trim() || !Number.isFinite(editing.target) || editing.target <= 0) {
      setNotice('Enter a title, a positive target and a valid date range.')
      return
    }
    if (save(editing)) { edit(null); setNotice('Goal saved') }
  }
  return <section className="panel progress-module personal-goals" aria-label="My Goals">
    <div className="section-heading"><h2><Target size={22} /> My Goals</h2>
      <button type="button" onClick={() => create()}>Create personal goal</button></div>
    <div className="progress-banner"><p>{labelDate(day, { month: 'long', year: 'numeric' })}</p>
      <h3>Keep showing up.</h3><p>{achieved} of {active.length} current goals achieved</p></div>
    {editing && <form className="progress-form" onSubmit={submit}>
      {!editing.expected && <label>Goal template<select defaultValue="" onChange={event => {
        const template = goalTemplates[Number(event.target.value)]
        if (event.target.value !== '' && template) create(template)
      }}><option value="">Choose a template</option>{goalTemplates.map((item, i) => <option key={item.title} value={i}>{item.title}</option>)}</select></label>}
      <label>Goal name<input required maxLength={80} value={editing.title} onChange={event => edit({ ...editing, title: event.target.value })} /></label>
      <label>Category<select value={editing.kind} onChange={event => {
        const kind = event.target.value as GoalKind
        edit({ ...editing, kind, threshold: kind === 'Sleep' ? 7 : 0 })
      }}>{kinds.map(kind => <option key={kind}>{kind}</option>)}</select></label>
      <label>Frequency<select value={editing.frequency} onChange={event => {
        const frequency = event.target.value as Frequency
        const [start, end] = goalRange(editing.start, frequency)
        edit({ ...editing, frequency, start, end })
      }}>{frequencies.map(item => <option key={item}>{item}</option>)}</select></label>
      <label>Start date<input required type="date" value={editing.start} onChange={event => {
        const date = event.target.value
        if (editing.frequency === 'Custom' || !validDate(date)) edit({ ...editing, start: date })
        else {
          const [start, end] = goalRange(date, editing.frequency)
          edit({ ...editing, start, end })
        }
      }} /></label>
      <label>End date<input required type="date" readOnly={editing.frequency !== 'Custom'} value={editing.end}
        onChange={event => edit({ ...editing, end: event.target.value })} /></label>
      {editing.kind === 'Habit' && <label>Habit<select value={editing.habit} onChange={event => edit({ ...editing, habit: Number(event.target.value) })}>
        {habits.map((habit, i) => <option key={habit} value={i}>{habit}</option>)}</select></label>}
      {editing.kind === 'Custom habit' && <label>Custom habit<select required value={editing.customHabit ?? ''} onChange={event => edit({ ...editing, customHabit: event.target.value })}>
        <option value="">Choose a custom habit</option>
        {data.customOptions.map(habit => <option key={habit.id} value={habit.id}>{habit.title}</option>)}</select></label>}
      {(editing.kind === 'Sleep' || editing.kind === 'Hydration') && <label>{editing.kind === 'Sleep' ? 'Minimum hours per day' : 'Minimum litres per day (optional)'}
        <input type="number" min={editing.kind === 'Sleep' ? 0.1 : 0} step="0.1" value={editing.threshold}
          onChange={event => edit({ ...editing, threshold: Number(event.target.value) })} /></label>}
      {editing.kind === 'Weight' && <label>Target direction<select value={editing.threshold} onChange={event => edit({ ...editing, threshold: Number(event.target.value) })}>
        <option value={0}>At or below</option><option value={1}>At or above</option></select></label>}
      <label>Target ({goalUnits(editing)})<input required type="number" min="0.01" step="any" value={editing.target}
        onChange={event => edit({ ...editing, target: Number(event.target.value) })} /></label>
      <div className="progress-actions form-wide dialog-actions"><button type="button" className="quiet-button" onClick={() => edit(null)}>Cancel</button><button>Save goal</button></div>
    </form>}
    <div className="progress-grid">{(history ? sorted : active).map(goal => {
      const progress = goalProgress(goal, data.journal, data.sessions, data.logs, data.scheduled, day, data.customDates)
      return <article className={'progress-tile' + (progress.achieved ? ' goal-achieved' : '')} key={goal.id}>
        <span className="goal-emblem"><Target size={18} aria-hidden="true" /></span>
        <small>{goal.frequency} · {goal.state}</small><h3>{goal.title}</h3>
        <p>{progress.recorded ? numberLabel.format(progress.value ?? 0) : '—'} / {goal.target} {goalUnits(goal)} <strong>{progress.percentage}%</strong></p>
        <progress aria-label={goal.title + ' progress'} max={100} value={progress.percentage} />
        <small>{progress.achieved ? 'Achieved ' + progress.achieved : goal.end < day ? 'Missed' : goal.start > day ?
          'Starts ' + goal.start : progress.remaining ? progress.remaining + ' days left' : 'Ends today'}</small>
        <div className="progress-actions">
          <button type="button" className="quiet-button" onClick={() => edit({ ...goal, expected: goal.revision })}>Edit</button>
          {goal.state !== 'Archived' && <><button type="button" className="quiet-button" onClick={() => save({ ...goal, state: goal.state === 'Paused' ? 'Active' : 'Paused', expected: goal.revision })}>
            {goal.state === 'Paused' ? 'Resume' : 'Pause'}</button>
            <button type="button" className="quiet-button danger-button" onClick={() => save({ ...goal, state: 'Archived', expected: goal.revision })}>Archive</button></>}
          <button type="button" className="quiet-button" onClick={() => create(undefined, goal)}>Renew</button>
          {manualGoal(goal.kind) && goal.state === 'Active' && goal.start <= day && goal.end >= day &&
            <button type="button" onClick={() => { startLog(goal.id); setAmount('') }}>Log progress</button>}
        </div>
        {logging === goal.id && <form onSubmit={event => {
          event.preventDefault()
          if (Number(amount) > 0 && Number.isFinite(Number(amount)) && data.append({ kind: 'goal_log',
            payload: { id: crypto.randomUUID(), goal: goal.id, day, amount: Number(amount), expected: null } })) startLog('')
        }}><label>Amount ({goalUnits(goal)})<input type="number" required min="0.01" step="any" value={amount} onChange={event => setAmount(event.target.value)} /></label>
          <button>Add progress</button></form>}
      </article>
    })}</div>
    {!history && !active.length && <p>Set a goal and see it move as you log your routine.</p>}
    <div className="progress-actions"><button type="button" className="quiet-button" aria-pressed={history} onClick={() => showHistory(!history)}>{history ? 'Current goals' : 'Goal history'}</button>
      <a href="#monthly">Monthly Review</a></div>
    <p role="status" className="status-line">{notice}</p>
  </section>
}
function nextDay(day: string) {
  const date = new Date(day + 'T00:00:00Z')
  date.setUTCDate(date.getUTCDate() + 1)
  return date.toISOString().slice(0, 10)
}
