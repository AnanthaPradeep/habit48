import { useEffect, useState } from 'react'
import { Bell, CalendarDays, Droplets, Dumbbell, Moon, Target, ListChecks } from 'lucide-react'
import { shift, today } from '../domain/journal'
import { weekdayIndex } from '../domain/schedule'
import { download } from '../services/exports'

const labels = ['Workout', 'Water logging', 'Habit completion', 'Weekly review', 'Monthly review', 'Personal goal deadlines']
const icons = [Dumbbell, Droplets, ListChecks, CalendarDays, CalendarDays, Target]
type Rule = { enabled: boolean; time: string }
type Preferences = { rules: Rule[]; quietStart: string; quietEnd: string; snooze: Record<string, number>; seen: string[] }
const defaults = (): Preferences => ({ rules: labels.map(() => ({ enabled: false, time: '18:00' })),
  quietStart: '22:00', quietEnd: '07:00', snooze: {}, seen: [] })
export function quietAt(time: string, start: string, end: string) {
  return start !== end && (start < end ? time >= start && time < end : time >= start || time < end)
}

export function SmartReminders({ owner, settings, workoutDays, deadlines }: {
  owner: string; settings: boolean; workoutDays: string[]; deadlines: string[]
}) {
  const key = 'routine-reminders-v1:' + owner
  const [prefs, setPrefs] = useState<Preferences>(() => {
    try { return { ...defaults(), ...JSON.parse(localStorage.getItem(key) ?? '{}') } }
    catch { return defaults() }
  })
  const [clock, setClock] = useState(Date.now)
  const [permission, setPermission] = useState(() => 'Notification' in window ? Notification.permission : 'unsupported')
  const [status, setStatus] = useState('')
  const date = new Date(clock)
  const day = today()
  const time = date.toTimeString().slice(0, 5)
  const quiet = quietAt(time, prefs.quietStart, prefs.quietEnd)
  const applicable = (index: number, value: string) => index === 0 ? workoutDays.includes(value) :
    index === 3 ? weekdayIndex(value) === 6 : index === 4 ? shift(value, 1).endsWith('-01') :
      index === 5 ? deadlines.includes(value) : true
  const due = quiet ? [] : labels.flatMap((label, index) => {
    const id = day + ':' + index
    const rule = prefs.rules[index]
    return rule.enabled && time >= rule.time && applicable(index, day) && !prefs.seen.includes(id) &&
      (prefs.snooze[id] ?? 0) <= clock ? [{ id, label }] : []
  })
  const notificationIds = due.map(reminder => reminder.id + '@' + (prefs.snooze[reminder.id] ?? 0)).join(',')
  function save(next: Preferences) {
    try { localStorage.setItem(key, JSON.stringify(next)); setPrefs(next) }
    catch { setStatus('Device storage is unavailable.') }
  }
  useEffect(() => {
    const tick = () => setClock(Date.now())
    const timer = window.setInterval(tick, 15000)
    window.addEventListener('focus', tick)
    return () => { clearInterval(timer); window.removeEventListener('focus', tick) }
  }, [])
  useEffect(() => {
    if (permission !== 'granted' || !notificationIds || !('serviceWorker' in navigator)) return
    let active = true
    void navigator.serviceWorker.getRegistration().then(async registration => {
      if (!active || !registration) return
      const notifiedKey = key + ':notified'
      const sent = new Set((localStorage.getItem(notifiedKey) ?? '').split(',').filter(id => id.startsWith(day)))
      for (const id of notificationIds.split(',')) {
        if (!active || sent.has(id)) continue
        await registration.showNotification('My Routine reminder', { tag: id })
        sent.add(id)
        localStorage.setItem(notifiedKey, [...sent].join(','))
      }
    }).catch(() => undefined)
    return () => { active = false }
  }, [day, key, notificationIds, permission])
  function calendar() {
    const stamp = new Date().toISOString().replace(/[-:]|\.\d{3}/g, '')
    const events = Array.from({ length: 90 }, (_, offset) => shift(day, offset)).flatMap(value =>
      prefs.rules.flatMap((rule, index) => {
        if (!rule.enabled || quietAt(rule.time, prefs.quietStart, prefs.quietEnd) || !applicable(index, value)) return []
        const datetime = value.replaceAll('-', '') + 'T' + rule.time.replace(':', '') + '00'
        return ['BEGIN:VEVENT', 'UID:my-routine-' + index + '-' + datetime + '@my-routine', 'DTSTAMP:' + stamp,
          'DTSTART:' + datetime, 'SUMMARY:My Routine reminder', 'BEGIN:VALARM', 'ACTION:DISPLAY',
          'TRIGGER:PT0M', 'DESCRIPTION:My Routine reminder', 'END:VALARM', 'END:VEVENT']
      }))
    const contents = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//My Routine//Reminders//EN', ...events, 'END:VCALENDAR', ''].join('\r\n')
    download(new Blob([contents], { type: 'text/calendar;charset=utf-8' }), 'my-routine-reminders.ics')
  }
  if (!settings && !due.length) return null
  return <section className="panel progress-module reminders" aria-label="Smart reminders">
    <div className="section-heading"><h2><Bell aria-hidden="true" /> Smart reminders</h2></div>
    {settings && <>
      <p>Reminders run while My Routine is open. Export to your calendar for alerts when it’s closed.</p>
      <div className="reminder-list">{labels.map((label, i) => {
        const Icon = icons[i]
        return <div role="group" aria-label={label} className="reminder-row" key={label}>
        <div className="reminder-name"><span className="section-icon"><Icon aria-hidden="true" /></span><strong>{label}</strong></div>
        <label className="reminder-time"><span className="visually-hidden">Reminder time</span><input type="time" value={prefs.rules[i].time} onChange={event => {
          const time = event.target.value
          if (time) save({ ...prefs, rules: prefs.rules.map((rule, index) => index === i ? { ...rule, time } : rule) })
        }} /></label>
        <label className="switch-control"><span className="visually-hidden">Enabled</span><input type="checkbox" checked={prefs.rules[i].enabled} onChange={event => save({ ...prefs,
          rules: prefs.rules.map((rule, index) => index === i ? { ...rule, enabled: event.target.checked } : rule) })} /><span aria-hidden="true" /></label>
        </div>
      })}</div>
      <div className="quiet-hours">
        <h3><Moon aria-hidden="true" /> Quiet hours</h3>
        <label>Quiet hours start<input type="time" value={prefs.quietStart} onChange={event => { if (event.target.value) save({ ...prefs, quietStart: event.target.value }) }} /></label>
        <label>Quiet hours end<input type="time" value={prefs.quietEnd} onChange={event => { if (event.target.value) save({ ...prefs, quietEnd: event.target.value }) }} /></label>
      </div>
      <div className="progress-actions">
        <button disabled={!prefs.rules.some(rule => rule.enabled)} onClick={calendar}>Export 90 days to calendar</button>
        {permission === 'default' && <button className="quiet-button" onClick={() => {
          void Notification.requestPermission().then(setPermission).catch(() => setStatus('Browser notifications are unavailable.'))
        }}>Enable browser notification permission</button>}
        {permission === 'granted' && <button className="quiet-button" onClick={() => {
          if (!('serviceWorker' in navigator)) { setStatus('Browser notifications require an active service worker.'); return }
          void navigator.serviceWorker.getRegistration().then(registration => {
            if (registration) return registration.showNotification('My Routine reminder')
            setStatus('Browser notifications require an active service worker.')
          }).catch(() => setStatus('Browser notifications are unavailable.'))
        }}>Send test notification</button>}
      </div>
      {permission === 'denied' && <p>Browser notification permission is blocked. Calendar and in-app reminders are available.</p>}
      {permission === 'unsupported' && <p>Browser notifications are unavailable here. On iOS, notification support requires a Home Screen installation.</p>}
    </>}
    {due.map(reminder => <div className="progress-actions" key={reminder.id}><strong>{reminder.label}</strong>
      <button onClick={() => save({ ...prefs, snooze: { ...prefs.snooze, [reminder.id]: Date.now() + 600000 } })}>Snooze 10 min</button>
      <button onClick={() => save({ ...prefs, seen: [...prefs.seen.filter(id => id.startsWith(day)), reminder.id] })}>Dismiss</button></div>)}
    {status && <p role="status">{status}</p>}
  </section>
}
