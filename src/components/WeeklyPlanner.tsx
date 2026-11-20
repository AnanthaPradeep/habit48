import { useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { labelDate, monday, shift, today, validDate } from '../domain/journal'
import { sevenDays } from '../domain/review'
import { slotStatus } from '../domain/planner'
import { type WorkoutPlan, type WorkoutSession } from '../domain/workout'
import type { EventChange, PlanSlot } from '../domain/routineEvents'

export function WeeklyPlanner({ slots, plans, sessions, append, start, status }: {
  slots: ReadonlyMap<string, PlanSlot>; plans: WorkoutPlan[]; sessions: WorkoutSession[]
  append(change: EventChange): boolean; start(plan: WorkoutPlan): void; status: string
}) {
  const [week, setWeek] = useState(() => monday(today()))
  const [day, setDay] = useState(today)
  const slot = slots.get(day)
  const state = slotStatus(slot, sessions, today())
  const training = plans.find(plan => plan.id === slot?.planId)
  function navigate(next: string) {
    setWeek(next)
    setDay(next === monday(today()) ? today() : next)
  }
  return <section className="panel release-stack" aria-label="Workout calendar">
    <div className="release-week"><div><h2><CalendarDays size={19} /> Workout calendar</h2>
      <small>{labelDate(week, { month: 'short', day: 'numeric' })} – {labelDate(shift(week,6), { month: 'short', day: 'numeric' })}</small></div>
      <div className="release-actions">
        <button type="button" className="icon-button" aria-label="Previous planner week" onClick={() => navigate(shift(week,-7))}><ChevronLeft /></button>
        <button type="button" className="quiet-button" onClick={() => navigate(monday(today()))}>This week</button>
        <button type="button" className="icon-button" aria-label="Next planner week" onClick={() => navigate(shift(week,7))}><ChevronRight /></button>
      </div>
    </div>
    <div className="release-calendar">{sevenDays(week).map(date => {
      const item = slots.get(date)
      const label = slotStatus(item, sessions, today())
      return <button type="button" className="quiet-button" key={date} aria-pressed={day === date}
        aria-label={labelDate(date, { weekday: 'long', month: 'short', day: 'numeric' }) + ' · ' + label}
        onClick={() => setDay(date)}><strong>{labelDate(date,{weekday:'short',day:'numeric'})}</strong><small>{label}</small>
        {item?.name && <small>{item.name}</small>}</button>
    })}</div>
    <div><h3>{labelDate(day, { weekday: 'long', month: 'short', day: 'numeric' })}</h3>
      <p>{slot?.name ? slot.name + ' · ' : ''}{state}{slot?.movedTo ? ' to ' + slot.movedTo : slot?.movedFrom ? ' from ' + slot.movedFrom : ''}</p>
      {training && state === 'Planned' && day === today() && <button type="button" onClick={() => start(training)}>View planned workout</button>}
    </div>
    {day >= today() && !['Completed','Partial','Rescheduled'].includes(state) && <Assign key={day + (slot?.revision ?? '')}
      plans={plans} initial={slot?.planId ?? (slot?.mode === 'rest' || slot?.mode === 'recovery' ? slot.mode : plans[0]?.id ?? 'rest')}
      save={choice => {
        const plan = plans.find(item => item.id === choice)
        if (plan) return append({ kind: 'plan', payload: { day, mode: 'workout', planId: plan.id, name: plan.name, expected: slot?.revision ?? null } })
        if (choice === 'rest' || choice === 'recovery') return append({ kind: 'plan', payload: { day, mode: choice, expected: slot?.revision ?? null } })
        return false
      }} />}
    {slot?.mode === 'workout' && ['Missed','Planned','Partial'].includes(state) && <Reschedule key={day + slot.revision} day={day} occupied={slots}
      move={to => {
        if (to === day || !validDate(to) || to < today() || slots.has(to)) return false
        const saved = append({ kind: 'move', payload: { from: day, to, expected: slot.revision, targetExpected: null } })
        if (saved) { setWeek(monday(to)); setDay(to) }
        return saved
      }} />}
    <small role="status">{status}</small>
  </section>
}

function Assign({ plans, initial, save }: { plans: WorkoutPlan[]; initial: string; save(choice: string): boolean }) {
  const [choice, setChoice] = useState(initial)
  return <form className="release-inline" onSubmit={event => { event.preventDefault(); save(choice) }}>
    <label>Assign workout<select value={choice} onChange={event => setChoice(event.target.value)}>
      {plans.map(plan => <option key={plan.id} value={plan.id}>{plan.name}</option>)}
      <option value="rest">Rest day</option><option value="recovery">Recovery day</option>
    </select></label><button type="submit">Save day plan</button>
  </form>
}

function Reschedule({ day, occupied, move }: { day: string; occupied: ReadonlyMap<string, PlanSlot>; move(day: string): boolean }) {
  const [target, setTarget] = useState(() => shift(day < today() ? today() : day, 1))
  const invalid = !validDate(target) || target === day || target < today() || occupied.has(target)
  return <form className="release-inline" onSubmit={event => { event.preventDefault(); if (!invalid) move(target) }}>
    <label>Move workout to<input type="date" required min={today()} value={target} onChange={event => setTarget(event.target.value)} /></label>
    <button type="submit" className="quiet-button" disabled={invalid}>Reschedule workout</button>
    {occupied.has(target) && <small>Choose an unassigned date.</small>}
  </form>
}
