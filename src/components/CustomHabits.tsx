import { useState } from 'react'
import { Check, BookOpen, Droplet, Footprints, Leaf, Star } from 'lucide-react'
import { customHabitsFor, customStreak, type CustomHabit, type HabitLog } from '../domain/customHabits'
import { shift, today } from '../domain/journal'
import { weekdayIndex } from '../domain/schedule'
import type { EventChange, Versioned } from '../domain/routineEvents'
import { Modal } from './Controls'

const icons = { Check, BookOpen, Droplet, Footprints, Leaf, Star }
const weekdayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const days = weekdayNames.map((_, i) => i)
const units = ['Check', 'Count', 'Minutes', 'Quantity'] as const
type Props = {
  history: Versioned<CustomHabit>[]; logs: ReadonlyMap<string, Versioned<HabitLog>>
  isRest(day: string): boolean; append(event: EventChange): boolean; manage?: boolean; day: string
}
export function CustomHabits({ history, logs, isRest, append, manage, day }: Props) {
  const [draft, edit] = useState<CustomHabit | null>(null)
  const definitions = customHabitsFor(history, day)
  const visible = manage ? definitions : definitions.filter(habit => !isRest(day) && habit.days.includes(weekdayIndex(day)))
  if (!manage && !visible.length) return null
  function save(habit: CustomHabit) {
    const { id, title, description, icon, category, unit, target, archived, days, effective, expected } = habit
    return append({ kind: 'custom_habit', payload: { id, title: title.trim(), description, icon, category, unit, target, archived, days, effective, expected } })
  }
  function version(habit: CustomHabit, archived = false) {
    const effective = shift(today(), 1)
    return { ...habit, effective, archived, expected: history.find(item => item.id === habit.id && item.effective === effective)?.revision ?? null }
  }
  function log(habit: CustomHabit, amount: number) {
    const id = habit.id + ':' + day
    if (Number.isFinite(amount) && amount >= 0) append({ kind: 'habit_log',
      payload: { id, habit: habit.id, day, value: amount, expected: logs.get(id)?.revision ?? null } })
  }
  return <section className="panel progress-module custom-habits" aria-label="Custom habits">
    <div className="section-heading"><h2>Custom habits</h2>{manage && <button onClick={() => edit({
      id: crypto.randomUUID(), effective: today(), title: '', description: '', icon: 'Check', category: '', unit: 'Check',
      target: 1, days, archived: false, expected: null,
    })}>Create habit</button>}</div>
    {manage && <p>Edits and archives take effect tomorrow so previous completions keep their original targets.</p>}
    {draft && <Modal title={draft.expected || draft.effective !== today() ? 'Edit custom habit' : 'Create custom habit'} close={() => edit(null)}>
      <form className="progress-form habit-editor" onSubmit={event => {
      event.preventDefault()
      if (draft.title.trim() && draft.days.length && draft.target > 0 && save(draft)) edit(null)
    }}>
      <label>Name<input required maxLength={60} value={draft.title} onChange={event => edit({ ...draft, title: event.target.value })} /></label>
      <label>Category<input maxLength={30} value={draft.category} onChange={event => edit({ ...draft, category: event.target.value })} /></label>
      <label className="form-wide">Description <span className="muted">(optional)</span><input maxLength={160} value={draft.description} onChange={event => edit({ ...draft, description: event.target.value })} /></label>
      <label>Icon<select value={draft.icon} onChange={event => edit({ ...draft, icon: event.target.value })}>
        {Object.keys(icons).map(icon => <option key={icon}>{icon}</option>)}</select></label>
      <label>Tracking type<select value={draft.unit} onChange={event => {
        const unit = event.target.value as CustomHabit['unit']
        edit({ ...draft, unit, target: unit === 'Check' ? 1 : draft.target })
      }}>{units.map(unit => <option key={unit}>{unit}</option>)}</select></label>
      {draft.unit !== 'Check' && <label>Daily target<input type="number" required min="0.01" step="any" value={draft.target}
        onChange={event => edit({ ...draft, target: Number(event.target.value) })} /></label>}
      <fieldset className="form-wide day-field"><legend>Scheduled days</legend>
        <div className="progress-actions"><button className="quiet-button" type="button" onClick={() => edit({ ...draft, days: [0, 1, 2, 3, 4] })}>Weekdays</button>
          <button className="quiet-button" type="button" onClick={() => edit({ ...draft, days: [5, 6] })}>Weekend</button>
          <button className="quiet-button" type="button" onClick={() => edit({ ...draft, days })}>Every day</button></div>
        <div className="day-chips">
        {weekdayNames.map((label, index) => <label key={label}><input type="checkbox" checked={draft.days.includes(index)}
          onChange={event => edit({ ...draft, days: event.target.checked ? [...draft.days, index] : draft.days.filter(day => day !== index) })} /><span>{label}</span></label>)}
        </div>
      </fieldset>
      <div className="progress-actions form-wide dialog-actions"><button type="button" className="quiet-button" onClick={() => edit(null)}>Cancel</button><button disabled={!draft.days.length}>Save habit</button></div>
    </form></Modal>}
    {visible.length > 0 && <div className="progress-grid">{visible.map(habit => {
      const Icon = icons[habit.icon as keyof typeof icons] ?? Check
      const entry = logs.get(habit.id + ':' + day)
      const streak = customStreak(history, logs, habit.id, day, isRest)
      const next = history.find(item => item.id === habit.id && item.effective === shift(today(), 1))
      return <article className="progress-tile" key={habit.id}>
        <small>{habit.category}</small><h3><Icon size={17} /> {habit.title}</h3>
        {habit.description && <p>{habit.description}</p>}<p>{streak} scheduled days in a row</p>
        {manage ? <div className="progress-actions">
          {next && <small>{next.archived ? 'Archives tomorrow' : 'Edits take effect tomorrow'}</small>}
          <button className="quiet-button" onClick={() => edit(version(next ?? habit))}>Edit</button>
          <button className="quiet-button danger-button" onClick={() => save(version(habit, true))}>Archive</button>
        </div> : habit.unit === 'Check' ?
          <label className="check-row"><input type="checkbox" checked={Boolean(entry?.value)} onChange={event => log(habit, Number(event.target.checked))} /> Complete {habit.title}</label>
          : <form key={entry?.revision ?? 'empty'} onSubmit={event => {
            event.preventDefault()
            const value = new FormData(event.currentTarget).get('value')
            if (value !== null && value !== '') log(habit, Number(value))
          }}><label>{habit.title} · target {habit.target} {habit.unit.toLowerCase()}
            <input name="value" type="number" min="0" step="any" required defaultValue={entry?.value} /></label><button>Save progress</button></form>}
      </article>
    })}</div>}
    {manage && !visible.length && <p>Your existing habits are listed under Flexible Routine. Create a custom habit to track something new.</p>}
  </section>
}
