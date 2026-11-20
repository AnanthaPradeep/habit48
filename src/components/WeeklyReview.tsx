import { useState, type FormEvent } from 'react'
import { ArrowDownRight, ArrowUpRight, Check, ChevronLeft, ChevronRight, Flag } from 'lucide-react'
import { labelDate, monday, shift, today, type Journal } from '../domain/journal'
import { weeklyReview, type ActivityMetric, type ScheduleFor } from '../domain/review'
import type { EventChange, GoalChange, Versioned } from '../domain/routineEvents'
import type { WorkoutSession } from '../domain/workout'

const unit: Record<ActivityMetric, string> = { Calories: 'kcal', Water: 'L', Sleep: 'h', Walking: 'min' }
const rounded = (value: number) => new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(value)
type Counts = { planned: number; completed: number; missed: number; rescheduled: number; partial: number }
const zero: Counts = { planned: 0, completed: 0, missed: 0, rescheduled: 0, partial: 0 }

function Difference({ current, previous, suffix }: { current: number | null; previous: number | null; suffix: string }) {
  if (current === null || previous === null) return <small>Previous week · {previous === null ? 'no data' : rounded(previous) + ' ' + suffix}</small>
  const delta = Math.round((current - previous) * 10) / 10
  return <small className="review-delta">{delta > 0 ? <ArrowUpRight /> : delta < 0 ? <ArrowDownRight /> : null}
    {delta ? (delta > 0 ? '+' : '') + rounded(delta) + ' ' + suffix : 'No change'} vs last week</small>
}

export default function WeeklyReview({ journal, sessions, goals, append, status, scheduled, planCounts }: {
  journal: Journal; sessions: WorkoutSession[]; goals: Iterable<Versioned<GoalChange>>
  append(change: EventChange): boolean; status: string; scheduled?: ScheduleFor; planCounts?(week: string): Counts
}) {
  const [week, setWeek] = useState(() => monday(today()))
  const [goalText, setGoalText] = useState('')
  const currentWeek = monday(today())
  const upcoming = shift(currentWeek, 7)
  const target = week >= upcoming ? week : week === currentWeek ? upcoming : week
  const review = weeklyReview(journal, sessions, week, today(), scheduled)
  const previous = weeklyReview(journal, sessions, shift(week, -7), today(), scheduled)
  const counts = planCounts?.(week) ?? zero
  const previousCounts = planCounts?.(shift(week,-7)) ?? zero
  const allGoals = [...goals]
  const weekGoals = allGoals.filter(goal => goal.week === target)
  const activeGoals = allGoals.filter(goal => goal.week === week && week !== target)
  const markGoal = (goal: Versioned<GoalChange>, done: boolean) => append({ kind: 'goal',
    payload: { id: goal.id, week: goal.week, text: goal.text, done, expected: goal.revision } })
  const monthDay = (day: string) => labelDate(day, { month: 'short', day: 'numeric' })
  function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const text = goalText.trim()
    if (!text || !append({ kind: 'goal', payload: { id: crypto.randomUUID(), week: target, text, done: false, expected: null } })) return
    setGoalText('')
  }
  return <div className="release-stack">
    <section className="panel release-week">
      <div><p className="eyebrow">MONDAY TO SUNDAY</p><h2>{monthDay(week)} – {monthDay(shift(week, 6))}</h2></div>
      <div className="release-actions">
        <button type="button" className="icon-button" aria-label="Previous review week" onClick={() => setWeek(shift(week, -7))}><ChevronLeft /></button>
        <button type="button" className="quiet-button" onClick={() => setWeek(currentWeek)}>This week</button>
        <button type="button" className="icon-button" aria-label="Next review week" onClick={() => setWeek(shift(week, 7))}><ChevronRight /></button>
      </div>
    </section>
    <div className="release-bento">
      <section className="panel release-feature"><h2>Habit completion</h2><strong>{review.completion === null ? '—' : rounded(review.completion) + '%'}</strong>
        <p>{review.done} of {review.possible} scheduled habits on {review.loggedDays} logged days</p>
        {review.completion !== null && <progress max={100} value={review.completion} aria-label="Weekly habit completion" />}
        <Difference current={review.completion} previous={previous.completion} suffix="pp" />
      </section>
      <section className="panel"><h2>Daily consistency</h2>
        <div className="review-days">{review.days.map(({ day, due, done, future }) => {
          const label = future ? 'Upcoming' : !due ? 'Rest' : done === null ? 'No log' : done + '/' + due
          return <div key={day}><span>{labelDate(day, { weekday: 'short' })}</span>
            {done !== null && !!due ? <meter value={done} max={due} aria-label={labelDate(day, { weekday: 'long' }) + ' consistency'} /> : <i />}
            <small>{label}</small></div>
        })}</div>
      </section>
    </div>
    <section className="panel"><div className="section-heading"><div><h2>Daily averages</h2>
      <p>{review.loggedMeals} meal entries · {previous.loggedMeals} last week</p></div><a href="#journal">Open journal</a></div>
      <div className="release-metrics">
      {(Object.keys(unit) as ActivityMetric[]).map(metric => {
        const { value, days } = review.metrics[metric]
        return <div key={metric}><span>{metric}</span><strong>{value === null ? '—' : rounded(value) + ' ' + unit[metric]}</strong>
          <small>{days ? 'From ' + days + ' logged ' + (days === 1 ? 'day' : 'days') : 'No data this week'}</small>
          <Difference current={value} previous={previous.metrics[metric].value} suffix={unit[metric]} /></div>
      })}
    </div></section>
    <div className="release-bento">
      <section className="panel"><h2>Workouts</h2><p>{review.workouts.length} logged · {previous.workouts.length} last week</p>
        <p>{counts.planned} planned · {counts.completed} completed as planned · {counts.missed} missed</p>
        {!!counts.rescheduled && <p>{counts.rescheduled} rescheduled</p>}
        {!!counts.partial && <p>{counts.partial} partially completed</p>}
        <small>Last week · {previousCounts.planned} planned · {previousCounts.completed} completed · {previousCounts.missed} missed</small><br />
        <a href="#workout">Open Workout Studio</a>
      </section>
      <section className="panel"><h2>What stands out</h2>
        {review.strongest ? <p><strong>{review.strongest.name}</strong> was most consistent, completed {review.strongest.done} of {review.strongest.logged} logged scheduled days.</p> :
          <p>Log a scheduled habit day to see a comparison.</p>}
        {review.improvement && <p><strong>{review.improvement.name}</strong> was unchecked on {review.improvement.logged - review.improvement.done} logged scheduled days.</p>}
      </section>
    </div>
    {activeGoals.length > 0 && <section className="panel"><h2>This week’s goals</h2>
      {activeGoals.map(goal => <label className="release-goal" key={goal.id}><input type="checkbox" checked={goal.done}
        onChange={event => markGoal(goal, event.target.checked)} /> {goal.text}</label>)}
    </section>}
    <section className="panel"><h2><Flag size={18} /> {target > currentWeek ? 'Upcoming goals' : 'Weekly goals'} · {monthDay(target)}</h2>
      {weekGoals.map(goal => <label className="release-goal" key={goal.id}><input type="checkbox" checked={goal.done}
        onChange={event => markGoal(goal, event.target.checked)} /> {goal.text}</label>)}
      {target >= currentWeek && <form className="release-inline" onSubmit={add}>
        <label>Small goal<input value={goalText} maxLength={100} required onChange={event => setGoalText(event.target.value)} placeholder="Walk after lunch twice" /></label>
        <button type="submit"><Check size={16} /> Add goal</button>
      </form>}
      {!weekGoals.length && target < currentWeek && <p>No goals recorded.</p>}
      <p className="muted" role="status">{status}</p>
    </section>
  </div>
}
