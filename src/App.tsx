import { lazy, Suspense, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { flushSync } from 'react-dom'
import { Login, Splash } from './components/Branding'
import { Calendar, PageHeader, Sidebar, Today, getView } from './components/Dashboard'
import { DailyJournal } from './components/Journal'
import Insights, { ReportPrint } from './components/Insights'
import { Settings } from './components/Settings'
import { estimateCalories } from './domain/calories'
import { blankEntry, shift, today, validDate, type Entry } from './domain/journal'
import type { Filters } from './domain/analytics'
import { useTheme } from './hooks/useTheme'
import { CloudJournal } from './services/cloud'
import { WorkoutStore } from './services/workouts'
import { workoutTotals } from './domain/workout'
import { RoutineEventStore } from './services/routineEvents'
import { projectEvents } from './domain/routineEvents'
import { QuickLog } from './components/QuickLog'
import { projectQuick, recentMeals } from './domain/quickLog'
import { scheduleFor, habitStreak } from './domain/schedule'
import { plannerCounts } from './domain/planner'
import './components/release.css'
const WorkoutStudio = lazy(() => import('./components/WorkoutStudio'))
const WeeklyReview = lazy(() => import('./components/WeeklyReview'))
const FlexibleRoutine = lazy(() => import('./components/FlexibleRoutine'))

export function App({ cloud }: { cloud: CloudJournal }) {
  const state = useSyncExternalStore(cloud.subscribe, cloud.getSnapshot)
  const { theme, toggle } = useTheme()
  useEffect(() => {
    const unmount = cloud.mountLive(navigator.onLine)
    void cloud.initialize()
    const online = () => cloud.setOnline(true)
    const offline = () => cloud.setOnline(false)
    const visible = () => { if (document.visibilityState === 'visible') cloud.focus() }
    window.addEventListener('online', online)
    window.addEventListener('offline', offline)
    window.addEventListener('focus', cloud.focus)
    document.addEventListener('visibilitychange', visible)
    return () => {
      window.removeEventListener('online', online)
      window.removeEventListener('offline', offline)
      window.removeEventListener('focus', cloud.focus)
      document.removeEventListener('visibilitychange', visible)
      unmount()
    }
  }, [cloud])
  return <>
    <Splash />
    {state.unlocked
      ? <Workspace key={cloud.workoutOwner()} owner={cloud.workoutOwner()!} cloud={cloud} state={state} theme={theme} toggle={toggle} />
      : <Login busy={state.busy} status={state.status} login={cloud.login} />}
  </>
}

function Workspace({ cloud, state, theme, toggle, owner }: {
  cloud: CloudJournal
  state: ReturnType<CloudJournal['getSnapshot']>
  theme: 'light' | 'dark'
  toggle(): void
  owner: string
}) {
  const { status } = state
  const journal = useMemo(() => projectQuick(state.journal, state.quick), [state.journal, state.quick])
  const [view, setView] = useState(getView)
  const [day, setDay] = useState(today)
  const [draft, setDraft] = useState<{ entry: Entry; baseline: Entry | undefined } | null>(null)
  const [warnings, setWarnings] = useState<string[] | null>(null)
  const [formStatus, setFormStatus] = useState('')
  const [filters, setFilters] = useState<Filters>(() => ({ from: shift(today(), -30), to: today(), period: 'daily', metric: 'habit' }))
  const [printFilters, setPrintFilters] = useState<Filters | null>(null)
  const workout = useMemo(() => new WorkoutStore(owner, cloud.workoutToken), [owner, cloud])
  const workouts = useSyncExternalStore(workout.subscribe, workout.snapshot)
  useEffect(() => workout.mount(), [workout])
  const routine = useMemo(() => new RoutineEventStore(owner, cloud.workoutToken), [owner, cloud])
  const routineState = useSyncExternalStore(routine.subscribe, routine.snapshot)
  useEffect(() => routine.mount(), [routine])
  const planning = useMemo(() => projectEvents(routineState.events), [routineState.events])
  const planningStatus = routineState.status + (planning.rejected.length ? ' · Concurrent changes kept their saved version' : '')
  const scheduled = useMemo(() => scheduleFor(planning.schedules.values()), [planning])
  const due = scheduled(day)
  const dailyWorkouts = workoutTotals(workouts.sessions.filter(session => session.day === day))
  const rangeWorkouts = workoutTotals(workouts.sessions.filter(session => session.day >= filters.from && session.day <= filters.to))
  const massKg = Number(Object.entries(journal.entries).filter(([, entry]) => Number(entry.m[3]) > 0)
    .sort(([a], [b]) => b.localeCompare(a))[0]?.[1].m[3])
  const saved = journal.entries[day]
  const current = draft?.entry ?? saved ?? blankEntry()
  const inferred = draft || current.cal?.length ? null : estimateCalories(current.f)
  const entry = inferred ? { ...current, cal: inferred.items } : current
  useEffect(() => {
    const update = () => setView(getView())
    window.addEventListener('hashchange', update)
    return () => window.removeEventListener('hashchange', update)
  }, [])
  useEffect(() => {
    if (!draft) return
    const preventLoss = (event: BeforeUnloadEvent) => { event.preventDefault() }
    window.addEventListener('beforeunload', preventLoss)
    return () => window.removeEventListener('beforeunload', preventLoss)
  }, [draft])

  function discard() {
    if (draft && !confirm('Discard unsaved changes?')) return false
    setDraft(null)
    setWarnings(null)
    setFormStatus('')
    return true
  }
  function move(next: string) {
    if (next !== day && validDate(next) && discard()) setDay(next)
  }
  function changeEntry(next: Entry) {
    setFormStatus('')
    setDraft(previous => ({ entry: next, baseline: previous ? previous.baseline : saved }))
  }
  function recalculate(food: string[]) {
    const estimate = estimateCalories(food)
    setWarnings(estimate.warnings)
    changeEntry({ ...entry, f: food, cal: estimate.items })
  }
  function save() {
    if (entry.m.some(value => value != null && value !== '' && (!Number.isFinite(Number(value)) || Number(value) < 0))) {
      setFormStatus('Enter valid, non-negative values in Activity & recovery.')
      return
    }
    if ((draft && cloud.hasDraftConflict(day, draft.baseline, entry)) ||
        (!draft && cloud.hasDraftConflict(day, saved, entry))) {
      if (!confirm('Both devices changed ' + day + '. Keep this device version?')) {
        setFormStatus('Cloud version kept. Your draft is still open.')
        return
      }
    }
    if (cloud.saveEntry(day, entry, { entry: draft ? draft.baseline : saved })) {
      setDraft(null)
      setWarnings(null)
      setFormStatus('')
    } else setFormStatus('Storage unavailable or full. Export a backup.')
  }
  function print(next: Filters) {
    flushSync(() => setPrintFilters(next))
    window.print()
  }

  const dated = view === 'today' || view === 'journal'
  return <main id="privateApp">
    <Sidebar view={view} logged={Object.keys(journal.entries).length} />
    <div className="workspace">
      <PageHeader day={day} view={view} theme={theme} toggle={toggle}
        connection={state.connection} lastSynced={state.lastSynced} />
      {dated && <Calendar day={day} journal={journal} move={move} />}
      {view === 'today' && <Today entry={entry} day={day} start={journal.start} due={due}
        streak={habitStreak(journal, today(), scheduled)} onToggle={index =>
        changeEntry({ ...entry, h: entry.h.map((done, i) => index === i ? !done : done) })} />}
      {view === 'today' && day === today() && <QuickLog entry={saved ?? blankEntry()} due={due} recent={recentMeals(journal, day)}
        submit={input => cloud.quickLog(day, input)} undo={cloud.undoQuick} canUndo={state.lastQuick?.day === day} />}
      <div hidden={view !== 'journal'}>
        <DailyJournal entry={entry} warnings={warnings ?? inferred?.warnings ?? []} changeEntry={changeEntry}
          changeMeal={(index, value) => recalculate(entry.f.map((text, i) => i === index ? value : text))}
          recalculate={() => recalculate(entry.f)} />
        {dailyWorkouts.count > 0 && <section className="panel workout-summary" aria-label="Workout Studio summary">
          <h2>Workout Studio summary</h2><p>{dailyWorkouts.count} workouts · {dailyWorkouts.minutes} min · {dailyWorkouts.sets} sets</p>
          <a href="#workout">Open workout history</a>
        </section>}
      </div>
      {view === 'workout' && <Suspense fallback={<p role="status">Loading Workout Studio…</p>}>
        <WorkoutStudio store={workout} state={workouts} massKg={massKg} planner={planning.planner}
          append={routine.append} planningStatus={planningStatus} />
      </Suspense>}
      {view === 'review' && <Suspense fallback={<p role="status">Loading Weekly Review…</p>}>
        <WeeklyReview journal={journal} sessions={workouts.sessions} goals={[...planning.goals.values()]}
        append={routine.append} status={planningStatus} scheduled={scheduled}
        planCounts={week => plannerCounts(planning.planner, workouts.sessions, week, today())} />
      </Suspense>}
      {view === 'insights' && <><Insights journal={journal} filters={filters} change={setFilters} print={print} scheduled={scheduled} />
        {rangeWorkouts.count > 0 && <section className="panel workout-summary" aria-label="Workout Studio activity">
          <h2>Workout Studio activity</h2><p>{rangeWorkouts.count} workouts · {rangeWorkouts.minutes} min · {rangeWorkouts.sets} sets
            {rangeWorkouts.energy === null ? '' : ' · ' + rangeWorkouts.energy + ' estimated kcal burned'}</p>
          <p>Studio activity is shown separately from manually logged activity and food calories.</p>
        </section>}
      </>}
      {view === 'settings' && <div className="release-stack"><Suspense fallback={<p role="status">Loading habit schedules…</p>}>
        <FlexibleRoutine schedules={[...planning.schedules.values()]} append={routine.append} />
      </Suspense>
        <Settings journal={journal} status={status}
        saveChallenge={(start, target) => discard() && cloud.saveChallenge(start, target)}
        restore={backup => discard() && cloud.restore(backup)}
        refresh={() => void cloud.refresh(Boolean(draft))} logout={() => void cloud.logout(Boolean(draft))} /></div>}
      {dated && <footer className="save-bar"><p role="status">{formStatus || (draft ? 'Unsaved changes' :
        status.includes('newer saved values') ? status : saved ? 'Saved' : 'Not saved')}</p>
        <button onClick={save}>Save day</button></footer>}
    </div>
    {printFilters && <ReportPrint journal={journal} filters={printFilters} scheduled={scheduled} />}
  </main>
}
