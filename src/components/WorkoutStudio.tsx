import { useState, useEffect, type FormEvent } from 'react'
import { Activity, ArrowRight, CalendarDays, Dumbbell, Flame, HeartPulse, Plus, Search, Timer, X } from 'lucide-react'
import { exerciseById, exercises, groups, type Exercise } from '../domain/exercises'
import { today, shift } from '../domain/journal'
import { body, cooldown, full, lower, upper, warmup, week, completeSet, elapsed, finishWorkout, rest, sequence,
  step, streak, togglePause, workoutTotals, type WorkoutDraft, type WorkoutPlan, type WorkoutSession, type PlanStep } from '../domain/workout'
import type { WorkoutStore } from '../services/workouts'
import { ExerciseDemo } from './ExerciseDemo'
import { ExerciseProgress } from './ExerciseProgress'
import { exerciseHistory, sessionStatus } from '../domain/workout'
import { WeeklyPlanner } from './WeeklyPlanner'
import type { EventChange, PlanSlot } from '../domain/routineEvents'
import { slotStatus } from '../domain/planner'
import './workout.css'

type State = ReturnType<WorkoutStore['snapshot']>
const dayIndex = () => (new Date().getDay() + 6) % 7
const presetPlans = [body, upper, lower, full, warmup, cooldown]
const secondsLabel = (value: number) => {
  const seconds = Math.max(0, Math.ceil(value / 1000))
  return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0')
}

function ExerciseGuide({ exercise }: { exercise: Exercise }) {
  return <div className="exercise-guide">
    <ExerciseDemo key={exercise.id} exercise={exercise} />
    <div>
      <p className="eyebrow">{exercise.difficulty} · {exercise.group} · {exercise.equipment}</p>
      <h3>{exercise.name}</h3>
      <p className="studio-prescription">{exercise.sets} sets × {exercise.reps} {exercise.timed ? 'sec' : 'reps'} · {exercise.rest}s rest</p>
      <dl>
        <dt>Form</dt><dd>{exercise.form}</dd>
        <dt>Breathing</dt><dd>{exercise.breathing}</dd>
        <dt>Common mistake</dt><dd>{exercise.mistake}</dd>
        <dt>Easier option</dt><dd>{exercise.alternative}</dd>
        <dt>Safety</dt><dd>{exercise.weights ? 'Use the unloaded option if you cannot move the weights smoothly. Set weights down before changing position.' :
          'Use a comfortable range and steady support when needed. Stop if a movement causes pain or makes you feel unwell.'}</dd>
      </dl>
      <a href={exercise.source} target="_blank" rel="noreferrer">Form reference · {exercise.source.includes('nhs.uk') ? 'NHS' : 'ACE Fitness'}</a>
    </div>
  </div>
}

export default function WorkoutStudio({ store, state, massKg, planner, append, planningStatus }: {
  store: WorkoutStore; state: State; massKg: number; planner: ReadonlyMap<string, PlanSlot>
  append(change: EventChange): boolean; planningStatus: string
}) {
  const [selected, select] = useState(dayIndex)
  const [preview, setPreview] = useState<WorkoutPlan | null>(null)
  const [detail, setDetail] = useState<Exercise | null>(null)
  const [category, setCategory] = useState('All')
  const [group, setGroup] = useState('All')
  const [query, setQuery] = useState('')
  const [building, setBuilding] = useState(false)
  const [history, setHistory] = useState<'week' | 'month' | 'all'>('week')
  const current = week[selected]
  const plans = [...new Map([...presetPlans, ...week.flatMap(day => day.plan ?? []), ...state.plans].map(plan => [plan.id, plan])).values()]
  const todaySlot = selected === dayIndex() ? planner.get(today()) : undefined
  const todayState = todaySlot ? slotStatus(todaySlot, state.sessions, today()) : null
  const heroPlan = todaySlot ? plans.find(plan => plan.id === todaySlot.planId) : current.plan
  const heroName = todaySlot?.name ?? heroPlan?.name ?? (todayState === 'Recovery' ? 'Recovery day' : 'Rest day')
  const matches = exercises.filter(e => (category === 'All' || category === e.equipment) &&
    (group === 'All' || group === e.group) && (e.name + ' ' + e.group).toLowerCase().includes(query.trim().toLowerCase()))
  const availablePlans = [...presetPlans, ...state.plans].filter(plan => {
    const usesWeights = plan.steps.some(item => exerciseById.get(item.exerciseId)?.weights)
    return category === 'All' || (category === 'Dumbbell' ? usesWeights : !usesWeights)
  })
  const visibleSessions = state.sessions.filter(s => history === 'all' || s.day >= shift(today(), history === 'week' ? -6 : -29))
    .sort((a,b) => b.finishedAt.localeCompare(a.finishedAt))

  function start(plan: WorkoutPlan) {
    if (state.draft && !confirm('Replace the workout currently in progress?')) return
    if (store.draft({ id: crypto.randomUUID(), day: today(), plan, sets: [], elapsed: 0,
      runningSince: Date.now(), restUntil: null, pausedRest: 0 })) {
      setPreview(null)
      requestAnimationFrame(() => document.getElementById('guided-workout')?.scrollIntoView({ behavior: 'instant' }))
    }
  }
  return <div className="studio">
    <section className="studio-hero">
      <div><p className="eyebrow">MY ROUTINE / TRAINING</p><h2>Move with purpose.</h2><p>Build strength. Stay consistent.</p>
        <p className="eyebrow studio-today">{selected === dayIndex() ? 'TODAY’S WORKOUT' : 'WEEKLY WORKOUT'}</p>
        <h3>{heroName}</h3>
        <p>{todayState ?? (heroPlan ? `${current.detail} · ${heroPlan.steps.length} exercises · Beginner-friendly` : 'Take a break and recover.')}</p>
        {heroPlan && (!todayState || todayState === 'Planned') && <button onClick={() => setPreview(heroPlan)}>View workout <ArrowRight size={16} /></button>}</div>
      <ExerciseDemo exercise={exerciseById.get('goblet')!} thumbnail />
    </section>
    <p className="studio-safety"><HeartPulse size={18} />Get medical clearance before strength training if you have a history of CVST. Start gently once cleared, breathe continuously, and avoid straining.</p>
    {state.draft && <Guided key={state.draft.id} draft={state.draft} store={store} massKg={massKg} sessions={state.sessions} />}
    {preview && <section className="panel studio-preview" aria-label="Workout preview">
      <div className="section-heading"><h2>{preview.name}</h2><button type="button" className="icon-button" aria-label="Close workout preview" onClick={() => setPreview(null)}><X /></button></div>
      <p>{preview.minutes} min planned · {sequence(preview).length} sets</p>
      <ol>{preview.steps.map((item, i) => {
        const exercise = exerciseById.get(item.exerciseId)
        return <li key={i}>{exercise?.name} <small>{item.sets} × {item.reps} {exercise?.timed ? 'sec' : 'reps'}</small></li>
      })}</ol>
      <button type="button" onClick={() => start(preview)}>Start workout</button>
    </section>}
    <WeeklyPlanner slots={planner} plans={plans} sessions={state.sessions}
      append={append} start={plan => { setPreview(plan); document.querySelector('.studio-hero')?.scrollIntoView({ block: 'start' }) }}
      status={planningStatus} />
    <section className="panel studio-week">
      <div className="section-heading"><h2><CalendarDays /> Suggested week</h2></div>
      <div className="studio-days">{week.map((day, i) => <button key={day.label} aria-pressed={selected === i}
        onClick={() => { select(i); setPreview(null) }}><strong>{day.label}</strong><span>{day.plan?.name.replace(' Strength','') ?? 'Rest'}</span><small>{day.detail}</small></button>)}</div>
      <p>Walking days include a guided indoor circuit. Use an easy walk for the remaining time if that suits your plan.</p>
    </section>
    <section className="studio-categories" aria-label="Exercise categories">
      <button aria-pressed={category === 'Bodyweight'} onClick={() => setCategory(category === 'Bodyweight' ? 'All' : 'Bodyweight')}><Activity /><strong>Bodyweight</strong><span>No gym equipment</span></button>
      <button aria-pressed={category === 'Dumbbell'} onClick={() => setCategory(category === 'Dumbbell' ? 'All' : 'Dumbbell')}><Dumbbell /><strong>Dumbbell</strong><span>Up to 2 × 5 kg</span></button>
    </section>
    <section className="panel">
      <div className="section-heading"><h2>Workout plans</h2><button type="button" onClick={() => setBuilding(value => !value)}><Plus size={16} /> Custom workout</button></div>
      {building && <Builder save={plan => { if (store.savePlan(plan)) setBuilding(false) }} />}
      <div className="studio-plan-grid">{availablePlans.map(plan => <button key={plan.id} className="quiet-button"
        onClick={() => { setPreview(plan); document.querySelector('.studio-hero')?.scrollIntoView({ block: 'start' }) }}>
        <span>{plan.name}<small>{plan.minutes} min · {plan.steps.length} exercises</small></span><ArrowRight size={16} />
      </button>)}</div>
    </section>
    <section className="panel">
      <h2>Exercise library</h2>
      <div className="studio-filters">
        <label><Search size={16} /> Search exercises<input type="search" value={query} onChange={event => setQuery(event.target.value)} /></label>
        <label>Equipment<select value={category} onChange={event => setCategory(event.target.value)}>
          {['All','Bodyweight','Dumbbell'].map(v => <option key={v}>{v}</option>)}
        </select></label>
        <label>Muscle group<select value={group} onChange={event => setGroup(event.target.value)}>
          {['All', ...groups].map(v => <option key={v}>{v}</option>)}
        </select></label>
      </div>
      {detail && <section className="studio-detail" aria-label="Exercise details">
        <button type="button" className="icon-button" aria-label="Close exercise details" onClick={() => setDetail(null)}><X /></button>
        <ExerciseGuide exercise={detail} />
      </section>}
      <p className="studio-match">{matches.length} exercises</p>
      <div className="studio-library">{matches.map(exercise => <button type="button" className="studio-exercise" key={exercise.id}
        onClick={() => { setDetail(exercise); requestAnimationFrame(() => document.querySelector('.studio-detail')?.scrollIntoView({ block: 'nearest' })) }}>
        <ExerciseDemo exercise={exercise} thumbnail /><strong>{exercise.name}</strong>
        <small>{exercise.group} · {exercise.sets} × {exercise.reps} {exercise.timed ? 'sec' : 'reps'}</small>
      </button>)}</div>
    </section>
    <ExerciseProgress sessions={state.sessions} />
    <section className="panel">
      <div className="section-heading"><h2>Workout history</h2><label className="studio-range">Period<select value={history}
        onChange={event => setHistory(event.target.value as typeof history)}><option value="week">Last 7 days</option>
        <option value="month">Last 30 days</option><option value="all">All time</option></select></label></div>
      <WorkoutStats sessions={visibleSessions} currentStreak={streak(state.sessions, today())} />
      <WorkoutTrend sessions={visibleSessions} />
      <p role="status">{state.status}</p>
      <p className="muted">Calorie estimates use your latest journal weight. Workout burn is separate from food calories.</p>
      {!visibleSessions.length && <p>No workouts in this period.</p>}
      {visibleSessions.map(session => <details key={session.id} className="workout-record"><summary>{session.name} <small>{session.day} · {session.sets.length} sets · {sessionStatus(session)}</small></summary>
        <ul>{session.sets.map(set => <li key={set.position}>{exerciseById.get(set.exerciseId)?.name ?? set.exerciseId} · {set.reps} {exerciseById.get(set.exerciseId)?.timed ? 'sec' : 'reps'} · {set.kg} kg total</li>)}</ul>
      </details>)}
    </section>
  </div>
}

function WorkoutTrend({ sessions }: { sessions: WorkoutSession[] }) {
  const totals = new Map<string, number>()
  for (const session of sessions) totals.set(session.day, (totals.get(session.day) ?? 0) + session.seconds)
  const days = [...totals].sort(([a], [b]) => a.localeCompare(b)).slice(-14)
  if (!days.length) return null
  const max = Math.max(...days.map(([, seconds]) => seconds))
  return <figure className="studio-trend">
    <figcaption>Training time on your last {days.length} active {days.length === 1 ? 'day' : 'days'}</figcaption>
    <ol>{days.map(([day, seconds]) => <li key={day}><time dateTime={day}>{day.slice(5)}</time>
      <meter min={0} max={max} value={seconds} aria-label={'Training time on ' + day} />
      <span>{(seconds / 60).toFixed(1)} min</span></li>)}</ol>
  </figure>
}

function Guided({ draft, store, massKg, sessions }: { draft: WorkoutDraft; store: WorkoutStore; massKg: number; sessions: WorkoutSession[] }) {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(timer)
  }, [])
  const order = sequence(draft.plan)
  const position = draft.sets.length
  const current = order[position]
  const exercise = current ? exerciseById.get(current.exerciseId) : undefined
  const previous = exercise ? (['bodyweight','dumbbell'] as const).flatMap(equipment => {
    const last = exerciseHistory(sessions, exercise.id, equipment)[0]
    return last ? [last] : []
  }).sort((a,b) => b.session.finishedAt.localeCompare(a.session.finishedAt))[0] : undefined
  const remaining = rest(draft, now)
  const paused = draft.runningSince === null
  function finish() {
    const session = finishWorkout(draft, Date.now(), massKg)
    if (session) store.saveSession(session)
  }
  return <section className="panel studio-guided" id="guided-workout" aria-label="Guided workout">
    <div className="section-heading"><div><h2>{draft.plan.name}</h2><p>{position}/{order.length} sets · {secondsLabel(elapsed(draft, now))} elapsed</p></div>
      <button className="quiet-button" type="button" onClick={() => store.draft(togglePause(draft, Date.now()))}>{paused ? 'Resume' : 'Pause'}</button></div>
    <progress value={position} max={order.length} aria-label="Workout progress" />
    {remaining > 0 && <div className="studio-rest"><Timer /><strong>Rest · {secondsLabel(remaining)}</strong>
      <button className="quiet-button" type="button" onClick={() => store.draft({ ...draft, restUntil: null, pausedRest: 0 })}>Skip rest</button></div>}
    {exercise && <><ExerciseGuide exercise={exercise} />
      {previous && <p className="muted">Last time · {previous.session.day} · {previous.sets.map(set =>
        set.reps + (exercise.timed ? ' sec' : ' reps') + (set.kg ? ' at ' + set.kg + ' kg total' : ' unloaded')).join(' · ')}</p>}
      <SetControls key={position} current={current} exercise={exercise}
      disabled={paused || remaining > 0} save={(reps, kg) => {
        const next = completeSet(draft, reps, kg, Date.now())
        if (next !== draft) {
          setNow(Date.now())
          store.draft(next)
        }
      }} /></>}
    {!exercise && <p>All planned sets complete.</p>}
    <div className="studio-guide-actions">
      <button type="button" disabled={!position} onClick={finish}>{exercise ? 'Finish & save completed sets' : 'Finish workout'}</button>
      <button className="quiet-button" type="button" onClick={() => {
        if (confirm('Discard this workout and its unsaved sets?')) store.draft(null)
      }}>Discard workout</button>
    </div>
  </section>
}

function SetControls({ current, exercise, disabled, save }: { current: PlanStep & { setNumber: number }; exercise: Exercise;
  disabled: boolean; save(reps: number, kg: number): void }) {
  return <form className="studio-set" onSubmit={event => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    save(Number(data.get('reps')), Number(data.get('weight')))
  }}>
    <label>{exercise.timed ? 'Seconds completed' : 'Reps completed'}<input name="reps" type="number" defaultValue={current.reps} min="1" max="600" required /></label>
    <label>Weight used<select name="weight" defaultValue="0"><option value="0">Bodyweight / unloaded</option>
      {exercise.weights >= 1 && <option value="5">1 × 5 kg</option>}
      {exercise.weights === 2 && <option value="10">2 × 5 kg</option>}</select></label>
    <button type="submit" disabled={disabled}>Complete set {current.setNumber}</button>
  </form>
}

function Builder({ save }: { save(plan: WorkoutPlan): void }) {
  const [steps, setSteps] = useState<PlanStep[]>([])
  const [choice, setChoice] = useState(exercises[0].id)
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const name = String(form.get('name')).trim()
    if (!name || !steps.length) return
    save({ id: crypto.randomUUID(), name, minutes: Math.max(1, Math.ceil(steps.reduce((n, item) => n + item.sets * (40 + item.rest), 0) / 60)),
      steps, createdAt: new Date().toISOString() })
  }
  return <form className="studio-builder" onSubmit={submit}>
    <label>Workout name<input name="name" required maxLength={80} /></label>
    <div className="studio-set"><label>Add exercise<select value={choice} onChange={event => setChoice(event.target.value)}>
      {exercises.map(e => <option value={e.id} key={e.id}>{e.name}</option>)}
    </select></label><button type="button" disabled={steps.length >= 20} onClick={() => setSteps([...steps,step(choice)])}>Add exercise</button></div>
    {steps.map((item, index) => <div className="studio-builder-step" key={index}><strong>{exerciseById.get(item.exerciseId)?.name}</strong>
      {([['sets','Sets',6],['reps',exerciseById.get(item.exerciseId)?.timed ? 'Seconds' : 'Reps',120],['rest','Rest (sec)',300]] as const).map(([key,label,max]) =>
        <label key={key}>{label}<input aria-label={label + ' for exercise ' + (index + 1)} type="number" required value={item[key]}
          min={key === 'rest' ? '0' : '1'} max={max}
          onChange={event => setSteps(previous => previous.map((other, i) => i === index ? { ...other, [key]: Number(event.target.value) } : other))} /></label>)}
      <button type="button" className="icon-button" aria-label={'Remove exercise ' + (index + 1)} onClick={() => setSteps(steps.filter((_,i) => i !== index))}><X /></button>
    </div>)}
    <button type="submit" disabled={!steps.length}>Save custom workout</button>
  </form>
}

export function WorkoutStats({ sessions, currentStreak }: { sessions: WorkoutSession[]; currentStreak?: number }) {
  const totals = workoutTotals(sessions)
  return <div className="studio-stats">
    <div><Dumbbell size={17} /><strong>{totals.count}</strong><span>Workouts</span></div>
    <div><Timer size={17} /><strong>{totals.minutes}</strong><span>Minutes</span></div>
    <div><Activity size={17} /><strong>{totals.sets}</strong><span>Sets</span></div>
    <div><Flame size={17} /><strong>{totals.energy ?? '—'}</strong><span>Est. kcal</span></div>
    {currentStreak !== undefined && <div><CalendarDays size={17} /><strong>{currentStreak}</strong><span>Day streak</span></div>}
  </div>
}
