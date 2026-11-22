import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Activity as Pulse, Bike, Footprints, Mountain, Timer, Route } from 'lucide-react'
import { activityCalories, activityDay, activityTypes, gpx, isRun, isWalk, outdoor, pauseActivity, seconds, segmentDistance, splits, type Activity, type ActivityType, type Point } from '../domain/activity'
import { monday, shift, today } from '../domain/journal'
import type { View } from './Dashboard'
import { useActivities } from '../hooks/useActivities'
import type { ActivityToken } from '../services/activityCloud'
import { download } from '../services/exports'
import './activity.css'

const ActivityMap = lazy(() => import('./ActivityMap'))
const icons = [Footprints, Pulse, Route, Footprints, Timer, Mountain, Bike]
const km = (metres: number) => (metres / 1000).toFixed(2)
const time = (value: number) => {
  const whole = Math.max(0, Math.floor(value))
  return [Math.floor(whole / 3600), Math.floor(whole / 60) % 60, whole % 60].map(part => String(part).padStart(2, '0')).join(':')
}
const pace = (distance: number, duration: number) => {
  if (distance <= 0 || duration <= 0) return '—'
  const elapsed = Math.floor(duration * 1000 / distance)
  return Math.floor(elapsed / 60) + ':' + String(elapsed % 60).padStart(2, '0') + ' /km'
}
const dateLabel = (at: number) => new Date(at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })

export default function ActivityStudio({ owner, view, day, massKg, token, onWalking }: { owner: string; view: View; day: string; massKg?: number | null; token: ActivityToken; onWalking(minutes: Readonly<Record<string, number>>): void }) {
  const visible = view === 'activity'
  const [wake, setWake] = useState(false)
  const { cache, ready, notice, gps, lastFix, syncStatus, change, patchDraft, commit } = useActivities(owner, wake, token)
  const { draft, records } = cache
  useEffect(() => {
    const minutes: Record<string, number> = {}
    for (const activity of records) {
      if (!isWalk(activity.type)) continue
      const date = activityDay(activity)
      minutes[date] = (minutes[date] ?? 0) + activity.elapsed / 60
    }
    onWalking(minutes)
  }, [records, onWalking])
  const [type, setType] = useState<ActivityType>(activityTypes[0])
  const [manual, setManual] = useState(false)
  const [targetKm, setTargetKm] = useState('')
  const [targetMinutes, setTargetMinutes] = useState('')
  const [mode, setMode] = useState<'map' | 'performance'>('map')
  const [locked, setLocked] = useState(false)
  const [now, setNow] = useState(Date.now)
  const [tab, setTab] = useState('Overview')
  const [selected, setSelected] = useState('')
  const [filter, setFilter] = useState('')
  const [query, setQuery] = useState('')
  const [historyDate, setHistoryDate] = useState('')
  const [minimumKm, setMinimumKm] = useState('')
  const [sort, setSort] = useState('recent')
  const [historyView, setHistoryView] = useState('List')
  const [countdown, setCountdown] = useState(false)
  const [startAt, setStartAt] = useState<number | null>(null)
  const [voice, setVoice] = useState(false)
  const spoken = useRef('')
  const [limit, setLimit] = useState(12)
  const [result, setResult] = useState('')
  const active = !!draft && draft.resumed !== null && draft.ended === null
  useEffect(() => {
    if (!active || !visible) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [active, visible])
  const filtered = records.filter(record => (!filter || record.type === filter) &&
    (!historyDate || activityDay(record) === historyDate) && record.distance >= (Number(minimumKm) || 0) * 1000 &&
    record.title.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => sort === 'distance' ? b.distance - a.distance : b.started - a.started)
  const recordedDates = useMemo(() => new Set(records.map(activityDay)), [records])
  let streak = 0
  for (let date = recordedDates.has(today()) ? today() : shift(today(), -1); recordedDates.has(date); date = shift(date, -1)) streak++
  const monthStart = today().slice(0, 8) + '01'
  const monthDays = Array.from({ length: 31 }, (_, index) => shift(monthStart, index)).filter(date => date.slice(0, 7) === monthStart.slice(0, 7))
  const liveSeconds = draft ? seconds(draft, now) : 0
  const liveDistance = draft?.distance ?? 0
  const lastPoint = draft?.points.at(-1)
  const priorPoint = draft?.points.at(-2)
  const currentSpeed = active && lastPoint && now - lastPoint.at < 15_000
    ? lastPoint.speed ?? (priorPoint?.segment === lastPoint.segment
      ? segmentDistance(priorPoint, lastPoint) * 1000 / (lastPoint.at - priorPoint.at) : null)
    : null
  useEffect(() => {
    if (!voice || !active || !draft || !('speechSynthesis' in window)) return
    const marker = draft.id + ':' + Math.floor(liveDistance / 1000) + ':' + Number(draft.targetSeconds > 0 && liveSeconds >= draft.targetSeconds)
    const previous = spoken.current
    spoken.current = marker
    if (previous.startsWith(draft.id + ':') && previous !== marker) {
      speechSynthesis.speak(new SpeechSynthesisUtterance(km(liveDistance) + ' kilometres. Elapsed time ' + Math.floor(liveSeconds / 60) + ' minutes.'))
    }
  }, [voice, active, draft, liveDistance, liveSeconds])
  useEffect(() => {
    if (startAt === null) return
    const interval = window.setInterval(() => setNow(Date.now()), 150)
    return () => clearInterval(interval)
  }, [startAt])
  const chosen = records.find(record => record.id === selected)
  const currentWeek = records.filter(record => activityDay(record) >= monday(today()))
  const daily = records.filter(record => activityDay(record) === day)
  const walks = daily.filter(record => isWalk(record.type))
  const runs = daily.filter(record => isRun(record.type))
  const walkMinutes = walks.reduce((sum, item) => sum + item.elapsed / 60, 0)
  const runKm = currentWeek.filter(record => isRun(record.type)).reduce((sum, item) => sum + item.distance / 1000, 0)
  const goals = cache.goals ?? { walkMinutes: 0, runKm: 0 }
  const weekly = currentWeek.reduce((sum, record) => ({ distance: sum.distance + record.distance, duration: sum.duration + record.elapsed }),
    { distance: 0, duration: 0 })
  const recordGroups = useMemo(() => activityTypes.map(kind => {
    const same = records.filter(record => record.type === kind)
    return { kind, longest: same.reduce<Activity | undefined>((best, record) => !best || record.distance > best.distance ? record : best, undefined),
      longestTime: Math.max(0, ...same.map(record => record.elapsed)) }
  }).filter(group => group.longest), [records])

  const start = useCallback(() => {
    const when = Date.now()
    setNow(when)
    setResult('')
    change(state => state.draft ? state : { ...state, checkpoint: when, draft: {
      id: crypto.randomUUID(), type, source: outdoor(type) && !manual ? 'gps' : 'manual',
      started: when, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      elapsed: 0, resumed: when, ended: null, points: [], distance: 0, moving: 0, segment: 0,
      targetMetres: Math.max(0, Number(targetKm) || 0) * 1000, targetSeconds: Math.max(0, Number(targetMinutes) || 0) * 60,
    } })
  }, [change, type, manual, targetKm, targetMinutes])
  useEffect(() => {
    if (startAt === null || !visible) return
    const timer = window.setTimeout(() => {
      setStartAt(null)
      if (document.visibilityState === 'visible') start()
    }, Math.max(0, startAt - Date.now()))
    return () => clearTimeout(timer)
  }, [startAt, visible, start])
  function finish() {
    if (!confirm('Finish this activity and review it?')) return
    const end = Date.now()
    patchDraft(value => ({ ...pauseActivity(value, end), ended: end }))
  }
  function discard() {
    if (confirm('Discard this unsaved activity?')) { patchDraft(() => null); setLocked(false) }
  }
  function save(form: HTMLFormElement) {
    if (!draft) return
    const fields = new FormData(form)
    const title = String(fields.get('title') ?? '').trim() || draft.type
    const distance = draft.source === 'manual' ? Math.max(0, Number(fields.get('distance')) || 0) * 1000 : draft.distance
    const activity: Activity = { ...draft, distance, title, moving: draft.source === 'manual' ? draft.elapsed : draft.moving,
      notes: String(fields.get('notes') ?? ''), effort: String(fields.get('effort') ?? ''), mood: String(fields.get('mood') ?? ''), editedAt: Date.now() }
    commit(activity, activity.id, null)
    setSelected(activity.id)
    setTab('History')
    setResult('Saved on this device')
  }
  if (!visible) return <>
    {draft && <aside className="activity-mini" aria-label="Active activity">
      <span>{draft.type} · {draft.ended ? 'Ready to save' : active ? 'Recording' : 'Paused'}</span>
      <a className="quiet-button" href="#activity">Resume Activity</a></aside>}
    {!!records.length && (view === 'today' || view === 'journal' || view === 'workout') && <section className="panel activity-integration">
      <div className="section-heading"><h2>{view === 'workout' ? 'Recorded outdoor activity' : 'Recorded activity'}</h2>
        <a href="#activity" onClick={() => setTab('History')}>Activity history</a></div>
      {view === 'today' ? <div className="activity-bento">
        <a href="#activity" onClick={() => setTab('History')}><small>Walking</small>
          <strong>{km(walks.reduce((sum, item) => sum + item.distance, 0))} km</strong>{Math.round(walkMinutes)} min recorded</a>
        <a href="#activity" onClick={() => setTab('History')}><small>Running</small>
          <strong>{km(runs.reduce((sum, item) => sum + item.distance, 0))} km</strong></a>
        <a href="#activity" onClick={() => setTab('History')}><small>Activities</small><strong>{daily.length}</strong></a>
      </div> : <div className="activity-list">{(view === 'journal' ? daily : records.filter(item => outdoor(item.type))).slice(0, 5).map(item =>
        <a className="quiet-button" key={item.id} href="#activity" onClick={() => { setTab('History'); setSelected(item.id) }}>
          {item.title} · {km(item.distance)} km · {time(item.elapsed)}</a>)}</div>}
      {!daily.length && view === 'journal' && <p>No recorded activity for this date.</p>}
      <small>Recorded activity is shown separately from manual journal entries.</small>
    </section>}
    {!!records.length && (view === 'review' || view === 'monthly' || view === 'insights') && <section className="panel activity-integration">
      <h2>Recorded activity trends</h2>
      <ActivityTrends records={records} initial={view === 'monthly' ? 30 : 7} />
      <a href="#activity" onClick={() => setTab('Analytics')}>Open activity analytics</a>
    </section>}
  </>

  return <div className="activity-studio">
    <section className="panel activity-intro"><p className="eyebrow">Movement journal</p><h2>Every route starts here.</h2>
      <p>Record a walk, run, hike or ride. GPS recording needs the app open and visible.</p></section>
    {notice && <p role="status">{notice}</p>}
    {result && <p role="status">{result}</p>}
    {ready && <small role="status">Activity sync: {syncStatus}</small>}
    {!ready && <p>Opening local activity storage…</p>}
    {ready && !draft && <>
      <nav className="activity-actions" aria-label="Activity Studio views">
        {['Overview', 'History', 'Analytics', 'Records', 'Goals'].map(item => <button type="button" className="quiet-button" key={item}
          aria-pressed={tab === item} onClick={() => { setTab(item); setSelected('') }}>{item}</button>)}
      </nav>
      {tab === 'Overview' && <>
        <div className="activity-bento">{[['Activities this week', String(currentWeek.length)], ['Weekly distance', km(weekly.distance) + ' km'],
          ['Active duration', time(weekly.duration)], ['Activity streak', streak + ' days']].map(([label, value], index) => <button className="panel activity-metric" type="button" key={label}
          onClick={() => setTab(index === 0 ? 'History' : 'Analytics')}><small>{label}</small><strong>{value}</strong></button>)}</div>
        <form className="panel activity-setup" onSubmit={event => { event.preventDefault()
          if (countdown) { const when = Date.now(); setNow(when); setStartAt(when + 3000) }
          else start()
        }}>
          <h2>Start activity</h2>
          <div className="activity-types" role="group" aria-label="Activity type">{activityTypes.map((kind, index) => {
            const Icon = icons[index]
            return <button key={kind} className="quiet-button" type="button" aria-pressed={type === kind} onClick={() => setType(kind)}>
              <Icon aria-hidden="true" />{kind}</button>
          })}</div>
          <div className="activity-fields">
            <label>Distance target (km)<input type="number" min="0" max="1000" step=".01" value={targetKm} onChange={event => setTargetKm(event.target.value)} /></label>
            <label>Duration target (min)<input type="number" min="0" max="1440" value={targetMinutes} onChange={event => setTargetMinutes(event.target.value)} /></label>
          </div>
          {outdoor(type) && <label className="activity-check"><input type="checkbox" checked={manual} onChange={event => setManual(event.target.checked)} /> Record manually</label>}
          <label className="activity-check"><input type="checkbox" checked={wake} onChange={event => setWake(event.target.checked)} /> Keep screen awake while recording</label>
          <label className="activity-check"><input type="checkbox" checked={countdown} onChange={event => setCountdown(event.target.checked)} /> Three-second countdown</label>
          {'speechSynthesis' in window && <label className="activity-check"><input type="checkbox" checked={voice} onChange={event => setVoice(event.target.checked)} /> Voice milestones</label>}
          {startAt === null ? <button>Start activity</button> : <div className="activity-actions">
            <strong role="status">Starting in {Math.max(1, Math.ceil((startAt - now) / 1000))}</strong>
            <button type="button" className="quiet-button" onClick={() => setStartAt(null)}>Cancel countdown</button></div>}

        </form>
        <section className="panel"><h2>This month</h2>
          <div className="activity-calendar">{monthDays.map(date => <button key={date} type="button" className="quiet-button"
            aria-label={date + (recordedDates.has(date) ? ', recorded activity' : ', no recorded activity')}
            onClick={() => { setHistoryDate(date); setTab('History') }}
            data-recorded={recordedDates.has(date)}>{Number(date.slice(-2))}</button>)}</div>
        </section>
        {!!records.length && <section className="panel"><h2>Recent activities</h2><div className="activity-list">
          {records.slice(0, 3).map(item => <button key={item.id} type="button" className="quiet-button"
            onClick={() => { setSelected(item.id); setTab('History'); setHistoryDate('') }}>
            {item.points.length > 0 && <RoutePreview points={item.points} />}
            <strong>{item.title}</strong><small>{km(item.distance)} km · {time(item.elapsed)}</small></button>)}
        </div></section>}
      </>}
      {tab === 'Goals' && <section className="panel">
        <h2>Activity goals</h2><p>Targets use recorded activities only. Personal walking goals use the larger of manual and recorded walking minutes per day to avoid counting the same walk twice.</p>
        <form key={goals.walkMinutes + ':' + goals.runKm} className="activity-fields" onSubmit={event => {
          event.preventDefault()
          const fields = new FormData(event.currentTarget)
          change(state => ({ ...state, goals: { walkMinutes: Number(fields.get('walk')), runKm: Number(fields.get('run')) } }))
          setResult('Activity goals saved on this device')
        }}>
          <label>Daily walking minutes<input type="number" name="walk" min="0" max="1440" defaultValue={goals.walkMinutes} required /></label>
          <label>Weekly running distance (km)<input type="number" name="run" min="0" max="1000" step=".1" defaultValue={goals.runKm} required /></label>
          <button>Save goals</button>
        </form>
        {goals.walkMinutes > 0 && <label>Walking today: {Math.round(walkMinutes)} / {goals.walkMinutes} min
          <progress max={goals.walkMinutes} value={walkMinutes} /></label>}
        {goals.runKm > 0 && <label>Running this week: {runKm.toFixed(2)} / {goals.runKm} km
          <progress max={goals.runKm} value={runKm} /></label>}
      </section>}
      {tab === 'History' && <section className="panel">
        <h2>Activity history</h2>
        <div className="activity-fields"><label>Search<input value={query} onChange={event => { setQuery(event.target.value); setLimit(12) }} /></label>
          <label>Activity type<select value={filter} onChange={event => { setFilter(event.target.value); setLimit(12) }}><option value="">All types</option>
            {activityTypes.map(kind => <option key={kind}>{kind}</option>)}</select></label></div>
        <div className="activity-fields">
          <label>Activity date<input type="date" value={historyDate} onChange={event => { setHistoryDate(event.target.value); setLimit(12) }} /></label>
          <label>Minimum distance (km)<input type="number" min="0" step=".1" value={minimumKm} onChange={event => { setMinimumKm(event.target.value); setLimit(12) }} /></label>
          <label>Sort activities<select value={sort} onChange={event => setSort(event.target.value)}>
            <option value="recent">Newest first</option><option value="distance">Longest distance</option></select></label>
          <label>History layout<select value={historyView} onChange={event => setHistoryView(event.target.value)}>
            <option>List</option><option>Cards</option></select></label>
        </div>
        {chosen && <ActivityDetails activity={chosen} massKg={massKg} close={() => setSelected('')}
          update={record => commit(record, record.id, chosen.editedAt)}
          remove={() => { if (confirm('Permanently delete this activity?')) {
            commit(null, chosen.id, chosen.editedAt)
            setSelected(''); setResult('Activity deleted')
          } }} />}
        <div className={historyView === 'Cards' ? 'activity-list activity-bento' : 'activity-list'}>{filtered.slice(0, limit).map(record => <button key={record.id} className="quiet-button" type="button"
          onClick={() => { setSelected(record.id); requestAnimationFrame(() => document.getElementById('activity-details')?.scrollIntoView({ block: 'start' })) }}>
          {historyView === 'Cards' && record.points.length > 0 && <RoutePreview points={record.points} />}
          <strong>{record.title}</strong><small>{dateLabel(record.started)} · {km(record.distance)} km · {time(record.elapsed)}</small></button>)}</div>
        {!filtered.length && <p>No matching activities.</p>}
        {filtered.length > limit && <button className="quiet-button" type="button" onClick={() => setLimit(value => value + 12)}>Show more</button>}
      </section>}
      {tab === 'Analytics' && <section className="panel"><h2>Activity trends</h2>
        <ActivityTrends records={records} /></section>}
      {tab === 'Records' && <section className="panel"><h2>Personal records</h2>
        {recordGroups.length ? <div className="activity-bento">{recordGroups.map(group => <button key={group.kind} className="panel activity-metric" type="button"
          onClick={() => { setSelected(group.longest!.id); setTab('History') }}><small>{group.kind}</small>
          <strong>{km(group.longest!.distance)} km</strong><small>Longest duration {time(group.longestTime)}</small></button>)}</div> : <p>Complete an activity to see your records.</p>}
      </section>}
    </>}
    {draft && draft.ended === null && <section className="panel activity-recording">
      <div className="section-heading"><h2>{draft.type}</h2><span role="status">{active ? draft.source === 'gps' ? (lastFix > 0 && now - lastFix > 45_000 ? 'GPS interrupted' : gps) : 'Recording manually' : 'Paused'}</span></div>
      <div className="activity-actions" role="group" aria-label="Recording layout">
        <button type="button" className="quiet-button" aria-pressed={mode === 'map'} disabled={locked} onClick={() => setMode('map')}>Map mode</button>
        <button type="button" className="quiet-button" aria-pressed={mode === 'performance'} disabled={locked} onClick={() => setMode('performance')}>Performance mode</button>
      </div>
      <div className="activity-bento"><div><small>Elapsed</small><strong>{time(seconds(draft, now))}</strong></div>
        <div><small>Distance</small><strong>{draft.source === 'gps' && draft.points.length ? km(draft.distance) + ' km' : '—'}</strong></div>
        <div><small>Average pace</small><strong>{pace(draft.distance, draft.moving)}</strong></div>
        <div><small>Current speed</small><strong>{currentSpeed === null ? '—' : (currentSpeed * 3.6).toFixed(1) + ' km/h'}</strong></div>
        <div><small>Current pace</small><strong>{currentSpeed && currentSpeed > 0 ? pace(currentSpeed, 1) : '—'}</strong></div>
        <div><small>Moving time</small><strong>{draft.source === 'gps' ? time(draft.moving) : time(liveSeconds)}</strong></div>
        <div><small>Average speed</small><strong>{draft.moving > 0 ? (draft.distance * 3.6 / draft.moving).toFixed(1) + ' km/h' : '—'}</strong></div>
        <div><small>Estimated calories</small><strong>{activityCalories(draft, massKg) ?? '—'}</strong></div></div>
      {draft.targetMetres > 0 && <label>Distance goal<progress max={draft.targetMetres} value={draft.distance} /></label>}
      {draft.targetSeconds > 0 && <label>Duration goal<progress max={draft.targetSeconds} value={seconds(draft, now)} /></label>}
      {mode === 'map' && draft.source === 'gps' && <Suspense fallback={<p>Loading route map…</p>}><ActivityMap points={draft.points} /></Suspense>}
      <div className="activity-actions">
        {active ? <button type="button" disabled={locked} onClick={() => patchDraft(value => pauseActivity(value, Date.now()))}>Pause activity</button> :
          <button type="button" disabled={locked} onClick={() => { const start = Date.now(); setNow(start)
            patchDraft(value => ({ ...value, resumed: start, segment: value.segment + 1 })) }}>Resume activity</button>}
        <button type="button" className="quiet-button" disabled={locked} onClick={finish}>Finish activity</button>
        <button type="button" className="quiet-button" aria-pressed={locked} onClick={() => setLocked(value => !value)}>{locked ? 'Unlock controls' : 'Lock controls'}</button>
        <button type="button" className="quiet-button" disabled={locked} onClick={discard}>Discard activity</button>
        {draft.source === 'gps' && !draft.points.length && <button type="button" className="quiet-button" disabled={locked}
          onClick={() => patchDraft(value => ({ ...value, source: 'manual' }))}>Switch to manual</button>}
      </div>
      <small>Recording pauses if the app is hidden. Keep the screen unlocked for GPS.</small>
    </section>}
    {draft?.ended != null && <form className="panel activity-completion" onSubmit={event => { event.preventDefault(); save(event.currentTarget) }}>
      <h2>Activity complete</h2><p>{draft.type} · {time(draft.elapsed)} · {draft.source === 'gps' ? draft.points.length ? km(draft.distance) + ' km' : 'GPS distance unavailable' : 'Manual entry'}</p>
      {!!draft.points.length && <Suspense fallback={<p>Loading route map…</p>}><ActivityMap points={draft.points} /></Suspense>}
      <ActivityFields title={draft.type} />
      {draft.source === 'manual' && <label>Distance (km, optional)<input name="distance" type="number" min="0" max="1000" step=".01" /></label>}
      <div className="activity-actions"><button>Save activity</button><button type="button" className="quiet-button" onClick={discard}>Discard activity</button></div>
    </form>}
  </div>
}

function ActivityFields({ title, record }: { title: string; record?: Activity }) {
  return <>
    <label>Activity title<input name="title" defaultValue={title} maxLength={100} required /></label>
    <label>Notes<textarea name="notes" defaultValue={record?.notes} maxLength={2000} /></label>
    <div className="activity-fields">
      <label>Effort<select name="effort" defaultValue={record?.effort}><option value="">Not recorded</option><option>Easy</option><option>Moderate</option><option>Hard</option></select></label>
      <label>Mood<select name="mood" defaultValue={record?.mood}><option value="">Not recorded</option><option>Calm</option><option>Energized</option><option>Tired</option></select></label>
    </div>
  </>
}
function ActivityDetails({ activity, massKg, close, update, remove }: {
  activity: Activity; massKg?: number | null; close(): void; update(record: Activity): void; remove(): void
}) {
  const [editing, setEditing] = useState(false)
  const [share, setShare] = useState(false)
  const [imageStatus, setImageStatus] = useState('')
  const segments = useMemo(() => splits(activity.points), [activity.points])
  const calories = activityCalories(activity, massKg)
  const distanceLabel = activity.source === 'gps' && !activity.points.length ? 'Distance unavailable' : km(activity.distance) + ' km'
  const summary = activity.type + ' · ' + distanceLabel + ' · ' + time(activity.elapsed)
  const exportFile = (body: string, contentType: string, extension: string) =>
    download(new Blob([body], { type: contentType }), 'my-routine-activity.' + extension)
  return <article className="activity-details" id="activity-details">
    <div className="section-heading"><h3>{activity.title}</h3><button className="quiet-button" type="button" onClick={close}>Close details</button></div>
    <p>{dateLabel(activity.started)}</p><p>{summary}</p>
    <p>Moving time {time(activity.moving)} · Average pace {pace(activity.distance, activity.moving)}
      {calories !== null && ' · ' + calories + ' estimated kcal burned'}</p>
    {(activity.targetMetres > 0 || activity.targetSeconds > 0) && <p>{activity.targetMetres > 0 &&
      'Distance goal ' + Math.min(100, Math.round(activity.distance * 100 / activity.targetMetres)) + '%'}
      {activity.targetMetres > 0 && activity.targetSeconds > 0 && ' ? '}{activity.targetSeconds > 0 &&
      'Duration goal ' + Math.min(100, Math.round(activity.elapsed * 100 / activity.targetSeconds)) + '%'}</p>}
    {segments.length > 0 && <p>Fastest complete split {time(Math.min(...segments))} /km</p>}
    {activity.notes && <p>{activity.notes}</p>}
    {!!activity.points.length && <Suspense fallback={<p>Loading route map…</p>}><ActivityMap points={activity.points} /></Suspense>}
    {!!segments.length && <details><summary>Kilometre splits</summary><ol>{segments.map((duration, index) => <li key={index}>{time(duration)}</li>)}</ol></details>}
    <div className="activity-actions">
      <button type="button" className="quiet-button" onClick={() => setEditing(value => !value)}>Edit activity</button>
      {!!activity.points.length && <button type="button" className="quiet-button" onClick={() => exportFile(gpx(activity), 'application/gpx+xml', 'gpx')}>Export GPX</button>}
      <button type="button" className="quiet-button" onClick={() => exportFile(JSON.stringify(activity, null, 2), 'application/json', 'json')}>Export JSON</button>
      <button type="button" className="quiet-button" onClick={() => exportFile('distance_m,elapsed_seconds,moving_seconds\n' +
        [activity.distance, activity.elapsed, activity.moving].join(','), 'text/csv', 'csv')}>Export CSV</button>
      <button type="button" className="quiet-button" aria-expanded={share} onClick={() => setShare(value => !value)}>Route-free summary</button>
      <button type="button" className="quiet-button danger-button" onClick={remove}>Delete activity</button>
    </div>
    {share && <div>
      <label>Copy this summary to share<textarea readOnly value={summary} /></label>
      <button type="button" className="quiet-button" onClick={() => {
        void summaryImage(activity.type, distanceLabel, time(activity.elapsed)).then(blob => {
          download(blob, 'my-routine-activity-summary.png')
          setImageStatus('Route-free image ready')
        }).catch(() => setImageStatus('Unable to create a summary image'))
      }}>Export route-free PNG</button>
      {imageStatus && <p role="status">{imageStatus}</p>}
    </div>}
    {editing && <form onSubmit={event => {
      event.preventDefault()
      const values = new FormData(event.currentTarget)
      update({ ...activity, title: String(values.get('title')).trim() || activity.type, notes: String(values.get('notes')),
        mood: String(values.get('mood')), effort: String(values.get('effort')), editedAt: Math.max(Date.now(), activity.editedAt + 1) })
      setEditing(false)
    }}><ActivityFields record={activity} title={activity.title} /><button>Save edits</button></form>}
  </article>
}
function RoutePreview({ points }: { points: Point[] }) {
  const paths = useMemo(() => {
    const grouped = new Map<number, Point[]>()
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    for (const point of points) {
      minX = Math.min(minX, point.lng)
      maxX = Math.max(maxX, point.lng)
      minY = Math.min(minY, point.lat)
      maxY = Math.max(maxY, point.lat)
      const group = grouped.get(point.segment) ?? []
      group.push(point)
      grouped.set(point.segment, group)
    }
    const scale = Math.min(104 / (maxX - minX || 1e-7), 38 / (maxY - minY || 1e-7))
    const centreX = (maxX + minX) / 2
    const centreY = (maxY + minY) / 2
    return [...grouped].map(([segment, group]) => {
      const step = Math.max(1, Math.ceil(group.length / 70))
      const path = group.filter((_, index) => index % step === 0 || index === group.length - 1)
        .map(point => [60 + (point.lng - centreX) * scale, 28 - (point.lat - centreY) * scale].map(value => value.toFixed(1)).join(','))
      return { segment, path }
    })
  }, [points])
  return <svg className="activity-route-preview" viewBox="0 0 120 56" aria-hidden="true">
    {paths.map(({ segment, path }) => path.length > 1
      ? <polyline key={segment} points={path.join(' ')} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      : <circle key={segment} cx={path[0].split(',')[0]} cy={path[0].split(',')[1]} r="3" fill="currentColor" />)}
  </svg>
}
function ActivityTrends({ records, initial = 7 }: { records: Activity[]; initial?: number }) {
  const [period, setPeriod] = useState(initial)
  const [customStart, setCustomStart] = useState(() => shift(today(), -6))
  const [customEnd, setCustomEnd] = useState(today)
  const [metric, setMetric] = useState('distance')
  const end = period === -1 ? customEnd : today()
  const from = period === -1 ? customStart : shift(end, 1 - period)
  const span = Math.max(1, Math.round((Date.parse(end) - Date.parse(from)) / 86_400_000) + 1)
  const prior = shift(from, -span)
  const days = records.filter(record => period === 0 || (activityDay(record) >= from && activityDay(record) <= end))
  const previous = records.filter(record => activityDay(record) >= prior && activityDay(record) < from)
  const sum = (items: Activity[]) => items.reduce((total, item) => total + item.distance, 0)
  const byDate = new Map<string, Activity[]>()
  for (const item of days) {
    const date = activityDay(item)
    const entries = byDate.get(date) ?? []
    entries.push(item)
    byDate.set(date, entries)
  }
  const values = [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-31)
  const valueFor = (items: Activity[]) => {
    if (metric === 'duration') return items.reduce((total, item) => total + item.elapsed, 0) / 60
    if (metric === 'frequency') return items.length
    if (metric === 'speed' || metric === 'pace') {
      const measured = items.filter(item => item.distance > 0 && item.moving > 0)
      const moving = measured.reduce((total, item) => total + item.moving, 0)
      const distance = sum(measured)
      if (!moving || !distance) return null
      return metric === 'speed' ? distance * 3.6 / moving : moving * 1000 / (distance * 60)
    }
    return sum(items) / 1000
  }
  const max = Math.max(1, ...values.map(([, items]) => valueFor(items) ?? 0))
  const unit = metric === 'duration' ? 'min' : metric === 'frequency' ? 'activities' :
    metric === 'speed' ? 'km/h' : metric === 'pace' ? 'min/km' : 'km'
  return <>
    <label>Trend period<select value={period} onChange={event => setPeriod(Number(event.target.value))}>
      <option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="365">Last year</option><option value="0">All time</option><option value="-1">Custom range</option>
    </select></label>
    {period === -1 && <div className="activity-fields">
      <label>From<input type="date" max={customEnd} value={customStart} onChange={event => { if (event.target.value) setCustomStart(event.target.value) }} /></label>
      <label>To<input type="date" min={customStart} max={today()} value={customEnd} onChange={event => { if (event.target.value) setCustomEnd(event.target.value) }} /></label>
    </div>}
    <label>Chart metric<select value={metric} onChange={event => setMetric(event.target.value)}>
      <option value="distance">Distance</option><option value="duration">Duration</option><option value="pace">Average pace</option>
      <option value="speed">Average speed</option><option value="frequency">Activity count</option>
    </select></label>
    <p>{days.length} activities · {km(sum(days))} km · {time(days.reduce((total, item) => total + item.elapsed, 0))}</p>
    {period !== 0 && <p>Previous period: {previous.length} activities · {km(sum(previous))} km</p>}
    {!!values.length && <details open><summary>Daily trend (latest {values.length} recorded days)</summary>
      <ul className="activity-bars">{values.map(([date, items]) => {
        const value = valueFor(items)
        return <li key={date}><span>{date}</span>
          {value === null ? <span /> : <meter aria-label={date + ' ' + metric} min={0} max={max} value={value} />}
          <strong>{value === null ? 'Unavailable' : value.toFixed(metric === 'frequency' ? 0 : 2) + ' ' + unit}</strong></li>
      })}</ul></details>}
    <ul>{activityTypes.map(kind => {
      const items = days.filter(item => item.type === kind)
      return items.length > 0 ? <li key={kind}>{kind}: {items.length} · {km(sum(items))} km</li> : null
    })}</ul>
  </>
}

async function summaryImage(type: string, distance: string, duration: string) {
  const canvas = document.createElement('canvas')
  canvas.width = 960
  canvas.height = 540
  const drawing = canvas.getContext('2d')
  if (!drawing) throw Error('Canvas unavailable')
  const background = drawing.createLinearGradient(0, 0, 960, 540)
  background.addColorStop(0, '#292b39')
  background.addColorStop(.56, '#35454c')
  background.addColorStop(1, '#473c43')
  drawing.fillStyle = background
  drawing.fillRect(0, 0, 960, 540)
  const logo = new Image()
  logo.src = import.meta.env.BASE_URL + 'brand/icons/icon-512-mr-rose-rounded-v2.png'
  await logo.decode()
  drawing.drawImage(logo, 64, 58, 72, 72)
  drawing.fillStyle = '#f7edf8'
  drawing.font = '600 40px system-ui'
  drawing.fillText('My-Routine', 158, 109)
  drawing.font = '500 68px Georgia'
  drawing.fillText(type, 64, 250)
  drawing.font = '600 34px system-ui'
  drawing.fillText(distance + '  ·  ' + duration, 64, 345)
  drawing.font = '400 24px system-ui'
  drawing.fillText('ACTIVITY SUMMARY', 64, 460)
  return new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(Error('Unable to create image')), 'image/png'))
}
