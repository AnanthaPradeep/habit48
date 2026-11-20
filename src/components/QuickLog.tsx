import { useState } from 'react'
import { Droplet, Footprints, Undo2 } from 'lucide-react'
import { habits, meals, type Entry } from '../domain/journal'
import type { QuickInput } from '../domain/quickLog'

export function QuickLog({ entry, recent, due, submit, undo, canUndo }: {
  entry: Entry; recent: { index: number; text: string }[]; due: readonly number[]
  submit(input: QuickInput): boolean; undo(): boolean; canUndo: boolean
}) {
  const [meal, setMeal] = useState(0)
  const [text, setText] = useState('')
  const [habit, setHabit] = useState<number | null>(null)
  const [notice, setNotice] = useState('')
  const unfinished = due.filter(index => !entry.h[index])
  const picked = habit !== null && unfinished.includes(habit) ? habit : unfinished[0]
  function log(input: QuickInput, message: string) {
    if (!submit(input)) return false
    setNotice(message)
    return true
  }
  return <section className="panel release-quick" aria-label="Quick log">
    <div className="section-heading"><h2>Quick log</h2>{canUndo && <button type="button" className="quiet-button" onClick={() => {
      setNotice(undo() ? 'Last log undone locally' : 'The last log changed and could not be undone')
    }}><Undo2 size={16} /> Undo last log</button>}</div>
    <div className="release-quick-tiles">
      <div><h3><Droplet size={17} /> Water <small>{entry.m[0] === '' || entry.m[0] == null ? '—' : entry.m[0] + ' L'}</small></h3>
        {[250,500].map(ml => <button type="button" className="quiet-button" key={ml}
          onClick={() => log({ kind: 'metric', index: 0, amount: ml / 1000 }, ml + ' ml logged')}>+{ml} ml</button>)}</div>
      <div><h3><Footprints size={17} /> Walking <small>{entry.m[1] === '' || entry.m[1] == null ? '—' : entry.m[1] + ' min'}</small></h3>
        {[5,10,15].map(minutes => <button type="button" className="quiet-button" key={minutes}
          onClick={() => log({ kind: 'metric', index: 1, amount: minutes }, minutes + ' walking minutes logged')}>+{minutes} min</button>)}</div>
    </div>
    {picked !== undefined && <div className="release-inline"><label>Quick habit<select value={picked} onChange={event => setHabit(Number(event.target.value))}>
      {unfinished.map(index => <option value={index} key={index}>{habits[index]}</option>)}</select></label>
      <button type="button" onClick={() => log({ kind: 'habit', index: picked, checked: true }, 'Habit completed')}>Complete habit</button></div>}
    <form className="release-inline" onSubmit={event => {
      event.preventDefault()
      if (text.trim() && log({ kind: 'meal', index: meal, text: text.trim() }, 'Meal logged')) setText('')
    }}>
      <label>Meal<select value={meal} onChange={event => setMeal(Number(event.target.value))}>
        {meals.map((name, index) => <option value={index} key={name}>{name}</option>)}</select></label>
      <label>Quick meal<input value={text} onChange={event => setText(event.target.value)} maxLength={280} required placeholder="2 idli + 1 egg" /></label>
      <button type="submit">Log meal</button>
    </form>
    {!!recent.length && <details><summary>Recently logged meals</summary><div className="release-actions">
      {recent.map(item => <button type="button" key={item.index + item.text} className="quiet-button" onClick={() => {
        setMeal(item.index); setText(item.text.slice(0, 280))
      }}>{meals[item.index]} · {item.text.slice(0, 65)}</button>)}</div></details>}
    <p role="status" className="muted">{notice}</p>
  </section>
}
