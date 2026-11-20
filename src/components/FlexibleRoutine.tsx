import { useState } from 'react'
import { CalendarDays } from 'lucide-react'
import { habits, today, validDate } from '../domain/journal'
import { allHabits } from '../domain/review'
import { effectiveSchedule, weekdayIndex } from '../domain/schedule'
import type { EventChange, ScheduleChange, Versioned } from '../domain/routineEvents'

const names = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']
function draftAt(history: Versioned<ScheduleChange>[], effective: string) {
  const active = effectiveSchedule(history, effective)
  return { days: active?.days.map(day => [...day]) ?? names.map(() => [...allHabits]),
    recovery: [...(active?.recovery ?? [])], expected: history.find(schedule => schedule.effective === effective)?.revision ?? null }
}
export default function FlexibleRoutine({ schedules, append }: { schedules: Iterable<Versioned<ScheduleChange>>; append(change: EventChange): boolean }) {
  const history = [...schedules]
  const [day, setDay] = useState(() => weekdayIndex(today()))
  const [effective, setEffective] = useState(today)
  const [draft, setDraft] = useState<ReturnType<typeof draftAt> | null>(null)
  const [notice, setNotice] = useState('')
  const current = draft ?? draftAt(history, effective)
  const due = current.days[day]
  const mode = due.length ? 'routine' : current.recovery.includes(day) ? 'recovery' : 'rest'
  function apply(indices: number[], selected: number[], recovery = false) {
    setNotice('')
    setDraft({ ...current, days: current.days.map((value, index) => indices.includes(index) ? selected : value),
      recovery: [...current.recovery.filter(index => !indices.includes(index)), ...(recovery ? indices : [])] })
  }
  return <section className="panel release-stack" aria-label="Flexible routine">
    <div className="section-heading"><div><p className="eyebrow">HABIT SCHEDULE</p><h2><CalendarDays size={18} /> Flexible routine</h2></div>
      <label>Effective date<input type="date" min={today()} value={effective} onChange={event => {
        if (validDate(event.target.value) && event.target.value >= today()) {
          setEffective(event.target.value); setDraft(null); setNotice('')
        }
      }} /></label></div>
    <p>Choose what counts on each day. Rest and recovery days are excluded from completion and streaks.</p>
    <div className="release-calendar">{names.map((name, index) => <button key={name} type="button" className="quiet-button"
      aria-pressed={day === index} onClick={() => setDay(index)}><strong>{name}</strong>
      <small>{current.days[index].length ? current.days[index].length + ' habits' : current.recovery.includes(index) ? 'Recovery' : 'Rest'}</small></button>)}</div>
    <label>Day mode<select value={mode} onChange={event => apply([day], event.target.value === 'routine' ? [...allHabits] : [], event.target.value === 'recovery')}>
      <option value="routine">Routine day</option><option value="rest">Rest day</option><option value="recovery">Recovery day</option>
    </select></label>
    {mode === 'routine' && <fieldset className="release-checks"><legend>Scheduled habits for {names[day]}</legend>
      {habits.map((habit, index) => <label className="release-goal" key={habit}><input type="checkbox" checked={due.includes(index)}
        onChange={event => apply([day], event.target.checked ? [...due,index].sort((a,b) => a-b) : due.filter(item => item !== index))} /> {habit}</label>)}</fieldset>}
    <div className="release-actions">
      <button type="button" className="quiet-button" onClick={() => apply([0,1,2,3,4], due, mode === 'recovery')}>Use for weekdays</button>
      <button type="button" className="quiet-button" onClick={() => apply([5,6], due, mode === 'recovery')}>Use for weekends</button>
      <button type="button" disabled={!draft} onClick={() => {
        if (effective >= today() && append({ kind: 'schedule', payload: { effective, ...current } })) {
          setDraft(null); setNotice('Schedule saved')
        }
      }}>Save habit schedule</button>
    </div>
    {history.length > 0 && <details><summary>Schedule history</summary><ul>{history.sort((a,b) => b.effective.localeCompare(a.effective)).map(item =>
      <li key={item.revision}>From {item.effective} · {item.days.filter(day => day.length > 0).length} routine days per week</li>)}</ul></details>}
    <p role="status" className="muted">{notice}</p>
  </section>
}
