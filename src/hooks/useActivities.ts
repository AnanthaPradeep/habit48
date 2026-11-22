import { useCallback, useEffect, useRef, useState } from 'react'
import { acceptPoint, pauseActivity, recoverActivity, type Draft } from '../domain/activity'
import { readActivities, writeActivities, type ActivityCache } from '../services/activityStorage'

import { pullActivities, syncActivity, type ActivityMutation, type ActivityToken } from '../services/activityCloud'
import type { Activity } from '../domain/activity'

const empty: ActivityCache = { draft: null, records: [], checkpoint: 0 }
export function useActivities(owner: string, wake: boolean, token: ActivityToken) {
  const [cache, setCache] = useState(empty)
  const [ready, setReady] = useState(false)
  const [notice, setNotice] = useState('')
  const [syncStatus, setSyncStatus] = useState('Saved locally')
  const [lastFix, setLastFix] = useState(0)
  const [gps, setGps] = useState('Waiting for GPS')
  const current = useRef(empty)
  const pending = useRef(Promise.resolve())
  useEffect(() => {
    let mounted = true
    let release = () => {}
    const load = () => readActivities(owner).then(saved => {
      if (!mounted) return
      current.current = saved?.draft ? { ...saved, draft: recoverActivity(saved.draft, saved.checkpoint) } : saved ?? empty
      setCache(current.current)
      setReady(true)
      if (saved?.draft?.resumed != null) setNotice('Recording recovered. Resume when ready.')
    }).catch(() => { if (mounted) setNotice('Local activity storage is unavailable.') })
    if (navigator.locks) {
      void navigator.locks.request('routine-activities:' + owner, { ifAvailable: true }, lock => {
        if (!mounted) return
        if (!lock) {
          setNotice('Activity Studio is open in another tab. Close that tab and reload to use this one.')
          return
        }
        void load()
        return new Promise<void>(resolve => { release = resolve })
      }).catch(() => { if (mounted) setNotice('Could not open Activity Studio storage.') })
    } else void load()
    return () => { mounted = false; void pending.current.then(release, release) }
  }, [owner])
  const change = useCallback((update: (value: ActivityCache) => ActivityCache) => {
    const previous = current.current
    const next = update(previous)
    if (next === previous) return
    current.current = next
    setCache(next)
    pending.current = pending.current.catch(() => undefined).then(() => writeActivities(owner, next))
    void pending.current.catch(() => setNotice('Activity could not be saved locally. Check available storage.'))
  }, [owner])
  const sync = useRef<() => void>(() => undefined)
  const commit = (record: Activity | null, id: string, expected: number | null) => {
    change(state => {
      const queued = state.outbox?.find(item => item.id === id)
      const mutation: ActivityMutation = { id, record, expected: queued ? queued.expected : expected }
      return { ...state, draft: state.draft?.id === id && record ? null : state.draft,
        records: record ? [record, ...state.records.filter(item => item.id !== id)] : state.records.filter(item => item.id !== id),
        outbox: [...(state.outbox ?? []).filter(item => item.id !== id), mutation] }
    })
    sync.current()
  }
  useEffect(() => {
    if (!ready) return
    let live = true
    let busy = false
    let queued = false
    async function exchange() {
      if (!live || !navigator.onLine) { if (live) setSyncStatus('Offline · saved locally'); return }
      if (busy) { queued = true; return }
      busy = true
      setSyncStatus('Synchronizing')
      try {
        await pending.current
        const key = await token()
        const attempted = current.current.outbox ?? []
        for (const item of attempted) {
          if (!live) return
          const accepted = await syncActivity(owner, key, item)
          if (!live) return
          if (!accepted) setNotice('This activity changed on another device. The cloud version was kept.')
          change(state => ({ ...state, outbox: state.outbox?.flatMap(next => {
            if (next === item || (!accepted && next.id === item.id)) return []
            if (next.id === item.id && item.record) return [{ ...next, expected: item.record.editedAt }]
            return [next]
          }) }))
        }
        const remote = await pullActivities(owner, key, current.current.records.filter(row => !(current.current.outbox ?? []).some(item => item.id === row.id)))
        if (!live) return
        change(state => {
          const unsynced = new Set(state.outbox?.map(item => item.id))
          const records = [...remote.filter(item => !unsynced.has(item.id)), ...state.records.filter(item => unsynced.has(item.id))]
            .sort((a, b) => b.started - a.started)
          return records.length === state.records.length && records.every((record, index) =>
            record.id === state.records[index].id && record.editedAt === state.records[index].editedAt) ? state : { ...state, records }
        })
        setSyncStatus(current.current.outbox?.length ? 'Pending sync' : 'Synced')
      } catch {
        if (live) setSyncStatus('Sync unavailable · saved locally')
      } finally {
        busy = false
        if (queued && live) { queued = false; void exchange() }
      }
    }
    const refresh = () => void exchange()
    sync.current = refresh
    refresh()
    window.addEventListener('online', refresh)
    window.addEventListener('offline', refresh)
    window.addEventListener('focus', refresh)
    const timer = window.setInterval(refresh, 30_000)
    return () => {
      live = false
      sync.current = () => undefined
      clearInterval(timer)
      window.removeEventListener('online', refresh)
      window.removeEventListener('offline', refresh)
      window.removeEventListener('focus', refresh)
    }
  }, [owner, token, ready, change])
  const draft = cache.draft
  const running = !!draft && draft.resumed !== null && draft.ended === null
  const gpsRunning = running && draft.source === 'gps'
  useEffect(() => {
    if (!running) return
    const checkpoint = () => change(state => ({ ...state, checkpoint: Date.now() }))
    const timer = window.setInterval(checkpoint, 5000)
    const pause = () => {
      if (document.visibilityState === 'hidden') change(state => state.draft?.resumed != null
        ? { ...state, checkpoint: Date.now(), draft: pauseActivity(state.draft, Date.now()) } : state)
    }
    document.addEventListener('visibilitychange', pause)
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', pause) }
  }, [running, change])
  useEffect(() => {
    if (!gpsRunning) return
    if (!navigator.geolocation) { setGps('Location unavailable'); return }
    setLastFix(0)
    setGps('Checking location')
    const finite = (value: number | null) => value !== null && Number.isFinite(value) ? value : null
    const listener = navigator.geolocation.watchPosition(position => {
      const { latitude: lat, longitude: lng, accuracy, altitude, speed } = position.coords
      const receivedAt = Date.now()
      if (position.timestamp > receivedAt + 5000) return
      if (Number.isFinite(accuracy) && accuracy <= 35) setLastFix(receivedAt)
      setGps(accuracy <= 35 ? 'Accurate GPS signal' : 'Weak GPS signal')
      change(state => {
        if (!state.draft) return state
        const next = acceptPoint(state.draft, { lat, lng, accuracy, altitude: finite(altitude),
          speed: speed !== null && speed >= 0 ? finite(speed) : null, at: position.timestamp })
        return next === state.draft ? state : { ...state, draft: next, checkpoint: Date.now() }
      })
    }, error => setGps(error.code === 1 ? 'Location permission denied' : 'Location unavailable'),
    { enableHighAccuracy: true, maximumAge: 0, timeout: 15_000 })
    return () => navigator.geolocation.clearWatch(listener)
  }, [gpsRunning, change])
  useEffect(() => {
    if (!wake || !running || !navigator.wakeLock) return
    let done = false
    let lock: WakeLockSentinel | undefined
    void navigator.wakeLock.request('screen').then(value => {
      if (done) void value.release()
      else lock = value
    }).catch(() => setNotice('Screen wake lock is unavailable.'))
    return () => { done = true; void lock?.release() }
  }, [running, wake])
  const patchDraft = (update: (draft: Draft) => Draft | null) => change(state => state.draft
    ? { ...state, draft: update(state.draft), checkpoint: Date.now() } : state)
  return { cache, ready, notice, gps, lastFix, syncStatus, change, patchDraft, commit }
}
