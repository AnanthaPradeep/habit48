import { useState } from 'react'
import { exerciseById, exercises } from '../domain/exercises'
import { exerciseHistory, sessionStatus, type WorkoutSession } from '../domain/workout'

export function ExerciseProgress({ sessions }: { sessions: WorkoutSession[] }) {
  const [exerciseId, setExerciseId] = useState(exercises[0].id)
  const [equipment, setEquipment] = useState<'bodyweight' | 'dumbbell'>('bodyweight')
  const exercise = exerciseById.get(exerciseId)
  const history = exerciseHistory(sessions, exerciseId, equipment)
  const trend = history.slice(0, 8).reverse()
  const max = Math.max(1, ...trend.map(item => item.total))
  const volumeMax = Math.max(1, ...trend.map(item => item.volume ?? 0))
  const records = new Map<number, number>()
  for (const item of history) for (const set of item.sets) records.set(set.kg, Math.max(records.get(set.kg) ?? 0, set.reps))
  const unit = exercise?.timed ? 'sec' : 'reps'
  const describe = ({ reps, kg }: { reps: number; kg: number }) => reps + ' ' + unit + (kg ? ' at ' + kg + ' kg total' : '')
  return <section className="panel release-stack" aria-label="Exercise progress">
    <h2>Exercise progress</h2>
    <div className="release-inline"><label>Progress exercise<select value={exerciseId} onChange={event => setExerciseId(event.target.value)}>
      {exercises.map(exercise => <option key={exercise.id} value={exercise.id}>{exercise.name}</option>)}
    </select></label><div className="release-actions">
      <button type="button" className="quiet-button" aria-pressed={equipment === 'bodyweight'} onClick={() => setEquipment('bodyweight')}>Bodyweight / unloaded</button>
      <button type="button" className="quiet-button" aria-pressed={equipment === 'dumbbell'} onClick={() => setEquipment('dumbbell')}>Dumbbell</button>
    </div></div>
    {history.length === 0 ? <p>No sets logged in this category.</p> : <>
      <div className="release-bento"><div><h3>Last time</h3>
        <p>{history[0].session.day} · {history[0].sets.length} sets · {sessionStatus(history[0].session)}</p>
        <p>{history[0].sets.map(describe).join(' · ')}</p></div>
        <div><h3>Personal records</h3>{[...records].sort(([a],[b]) => a-b).map(([kg, value]) =>
          <p key={kg}>{value} {unit} in one set · {kg ? kg + ' kg total' : 'unloaded'}</p>)}
          <small>Past bests are reference points. Use a comfortable load and controlled form.</small></div></div>
      <div className="release-stack"><h3>{exercise?.timed ? 'Duration trend' : 'Repetition trend'}</h3>
        {trend.map(({ session, total }) => <div className="release-trend" key={session.id}><time>{session.day}</time>
          <meter max={max} value={total} aria-label={session.day + ' ' + unit} /><span>{total} {unit}</span></div>)}</div>
      {equipment === 'dumbbell' && !exercise?.timed && <div className="release-stack"><h3>Training volume</h3>
        {trend.map(({ session, volume }) => <div className="release-trend" key={session.id}><time>{session.day}</time>
          <meter max={volumeMax} value={volume ?? 0} aria-label={session.day + ' training volume'} /><span>{volume} kg·reps</span></div>)}</div>}
      <details><summary>Exercise history</summary><ul>{history.map(({ session, sets }) => <li key={session.id}>
        {session.day} · {sessionStatus(session)} · {sets.map(describe).join(' / ')}
      </li>)}</ul></details>
    </>}
  </section>
}
