import { BrandLockup } from './Branding'
import { version } from '../../package.json'
import { useRef, useState, type FormEvent } from 'react'
import { challengeCount, isJournal, validDate, type Journal } from '../domain/journal'
import { download } from '../services/exports'
import { ShieldCheck, Target } from 'lucide-react'

interface Props {
  theme: 'light' | 'dark'
  journal: Journal
  status: string
  saveChallenge(start: string, target: number): boolean
  restore(journal: Journal): boolean
  refresh(): void
  logout(): void
}
export function Settings({ journal, status, saveChallenge, restore, refresh, logout, theme }: Props) {
  const file = useRef<HTMLInputElement>(null)
  const [importStatus, setImportStatus] = useState('')
  const [challenge, setChallenge] = useState<{ start: string; target: string; baselineStart: string; baselineTarget: number } | null>(null)
  const count = challengeCount(journal)
  const fields = challenge ?? { start: journal.start, target: String(journal.target), baselineStart: journal.start, baselineTarget: journal.target }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const { start, baselineStart, baselineTarget } = fields
    const target = Number(fields.target)
    if (!validDate(start) || !Number.isInteger(target) || target < 0) return
    if ((baselineStart !== journal.start || baselineTarget !== journal.target) &&
        (start !== journal.start || target !== journal.target) &&
        !confirm('Both devices changed the personal challenge. Keep this device version?')) return
    if (saveChallenge(start, target)) setChallenge(null)
  }
  async function importBackup(input: HTMLInputElement) {
    const backup = input.files?.[0]
    input.value = ''
    if (!backup) return
    setImportStatus('')
    try {
      const value: unknown = JSON.parse(await backup.text())
      if (!isJournal(value)) throw Error('Invalid My Routine backup')
      if (confirm('Replace current journal?') && restore(value)) setImportStatus('Backup restored.')
    } catch { setImportStatus('Invalid My Routine backup') }
  }
  return <div className="settings-grid">
    <section className="panel">
      <div className="section-heading"><h2><Target aria-hidden="true" /> Personal challenge</h2></div>
      <form className="challenge-form" onSubmit={submit}>
        <label>Start date<input type="date" name="start" value={fields.start} required onChange={event =>
          setChallenge({ ...fields, start: event.target.value })} /></label>
        <label>Target days (0 = unlimited)<input type="number" name="target" value={fields.target} min="0" step="1" onChange={event =>
          setChallenge({ ...fields, target: event.target.value })} /></label>
        <button type="submit">Save challenge</button>
      </form>
      <p>{journal.target ? count + '/' + journal.target + ' challenge days logged · journal continues afterwards' : 'Unlimited routine'}</p>
      {!!journal.target && <progress max={journal.target} value={count} aria-label="Challenge days logged" />}
    </section>
    <section className="panel">
      <div className="section-heading"><h2><ShieldCheck aria-hidden="true" /> Cloud backup &amp; privacy</h2></div>
      <div id="cloud">
        <p role="status" id="cloudStatus">{status}</p>
        <div className="row"><button className="quiet-button" onClick={refresh}>Refresh from cloud</button><button className="quiet-button" onClick={logout}>Sign out</button></div>
      </div>
      <p>Export a copy of your journal or restore an existing backup.</p>
      <div className="row">
        <button onClick={() => download(new Blob([JSON.stringify(journal, null, 2)], { type: 'application/json' }), 'my-routine.json')}>Export JSON</button>
        <button className="quiet-button danger-button" onClick={() => file.current?.click()}>Restore JSON</button>
      </div>
      <input ref={file} id="file" type="file" accept=".json" hidden onChange={event => void importBackup(event.currentTarget)} />
      {importStatus && <p role="status">{importStatus}</p>}
    </section>
    <section className="panel brand-about" aria-labelledby="about-heading">
      <BrandLockup theme={theme} tagline decorative />
      <div><h2 id="about-heading">About My-Routine</h2><p>Version {version} · Private wellness journal</p></div>
    </section>
  </div>
}
