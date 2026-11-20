import { useEffect, useState, useSyncExternalStore } from 'react'
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

export function App({ cloud }: { cloud: CloudJournal }) {
  const state = useSyncExternalStore(cloud.subscribe, cloud.getSnapshot)
  const { theme, toggle } = useTheme()
  useEffect(() => {
    void cloud.initialize()
    window.addEventListener('online', cloud.sync)
    return () => window.removeEventListener('online', cloud.sync)
  }, [cloud])
  return <>
    <Splash />
    {state.unlocked
      ? <Workspace cloud={cloud} state={state} theme={theme} toggle={toggle} />
      : <Login busy={state.busy} status={state.status} login={cloud.login} />}
  </>
}

function Workspace({ cloud, state, theme, toggle }: {
  cloud: CloudJournal
  state: ReturnType<CloudJournal['getSnapshot']>
  theme: 'light' | 'dark'
  toggle(): void
}) {
  const { journal, status } = state
  const [view, setView] = useState(getView)
  const [day, setDay] = useState(today)
  const [draft, setDraft] = useState<Entry | null>(null)
  const [warnings, setWarnings] = useState<string[] | null>(null)
  const [formStatus, setFormStatus] = useState('')
  const [filters, setFilters] = useState<Filters>(() => ({ from: shift(today(), -30), to: today(), period: 'daily', metric: 'habit' }))
  const [printFilters, setPrintFilters] = useState<Filters | null>(null)
  const saved = journal.entries[day]
  const current = draft ?? saved ?? blankEntry()
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
    setDraft(next)
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
    if (cloud.saveEntry(day, entry)) {
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
      <PageHeader day={day} view={view} theme={theme} toggle={toggle} />
      {dated && <Calendar day={day} journal={journal} move={move} />}
      {view === 'today' && <Today entry={entry} day={day} start={journal.start} onToggle={index =>
        changeEntry({ ...entry, h: entry.h.map((done, i) => index === i ? !done : done) })} />}
      <div hidden={view !== 'journal'}>
        <DailyJournal entry={entry} warnings={warnings ?? inferred?.warnings ?? []} changeEntry={changeEntry}
          changeMeal={(index, value) => recalculate(entry.f.map((text, i) => i === index ? value : text))}
          recalculate={() => recalculate(entry.f)} />
      </div>
      {view === 'insights' && <Insights journal={journal} filters={filters} change={setFilters} print={print} />}
      {view === 'settings' && <Settings journal={journal} status={status}
        saveChallenge={(start, target) => { if (discard()) cloud.saveChallenge(start, target) }}
        restore={backup => discard() && cloud.restore(backup)}
        refresh={() => void cloud.refresh(Boolean(draft))} logout={() => void cloud.logout(Boolean(draft))} />}
      {dated && <footer className="save-bar"><p role="status">{formStatus || (draft ? 'Unsaved changes' : saved ? 'Saved' : 'Not saved')}</p>
        <button onClick={save}>Save day</button></footer>}
    </div>
    {printFilters && <ReportPrint journal={journal} filters={printFilters} />}
  </main>
}
