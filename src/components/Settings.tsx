import { useRef, useState, type FormEvent } from 'react'
import { challengeCount, isJournal, validDate, type Journal } from '../domain/journal'
import { download } from '../services/exports'

interface Props {
  journal: Journal
  status: string
  saveChallenge(start: string, target: number): void
  restore(journal: Journal): boolean
  refresh(): void
  logout(): void
}
export function Settings({ journal, status, saveChallenge, restore, refresh, logout }: Props) {
  const file = useRef<HTMLInputElement>(null)
  const [importStatus, setImportStatus] = useState('')
  const count = challengeCount(journal)
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const fields = new FormData(event.currentTarget)
    const start = fields.get('start')
    const target = Number(fields.get('target'))
    if (validDate(start) && Number.isInteger(target) && target >= 0) saveChallenge(start, target)
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
      <h2>Personal challenge</h2>
      <form className="challenge-form" onSubmit={submit} key={journal.start + '/' + journal.target}>
        <label>Start date<input type="date" name="start" defaultValue={journal.start} required /></label>
        <label>Target days (0 = unlimited)<input type="number" name="target" defaultValue={journal.target} min="0" step="1" /></label>
        <button type="submit">Save challenge</button>
      </form>
      <p>{journal.target ? count + '/' + journal.target + ' challenge days logged · journal continues afterwards' : 'Unlimited routine'}</p>
      {!!journal.target && <progress max={journal.target} value={count} aria-label="Challenge days logged" />}
    </section>
    <section className="panel">
      <h2>Cloud backup &amp; privacy</h2>
      <div id="cloud">
        <p role="status" id="cloudStatus">{status}</p>
        <div className="row"><button onClick={refresh}>Refresh from cloud</button><button onClick={logout}>Sign out</button></div>
      </div>
      <p>Export a copy of your journal or restore an existing backup.</p>
      <div className="row mt-3">
        <button onClick={() => download(new Blob([JSON.stringify(journal, null, 2)], { type: 'application/json' }), 'my-routine.json')}>Export JSON</button>
        <button onClick={() => file.current?.click()}>Restore JSON</button>
      </div>
      <input ref={file} id="file" type="file" accept=".json" hidden onChange={event => void importBackup(event.currentTarget)} />
      {importStatus && <p role="status">{importStatus}</p>}
    </section>
  </div>
}
