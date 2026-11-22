import { useState, type FormEvent } from 'react'
import { total } from '../domain/calories'
import { catalog } from '../domain/foods'
import { meals, metrics, numberLabel, type Entry, type Food } from '../domain/journal'

interface Props {
  entry: Entry
  warnings: string[]
  changeMeal(index: number, value: string): void
  changeEntry(entry: Entry): void
  recalculate(): void
}
export function DailyJournal({ entry, warnings, changeMeal, changeEntry, recalculate }: Props) {
  const items = entry.cal ?? []
  const calories = total(items)
  return <div className="journal-grid">
    <section className="panel meal-panel">
      <h2>Food journal</h2><p>Include portions, for example, 4 idiyappam + 1 egg curry.</p>
      <div id="food">{meals.map((meal, index) => <label className="meal-field" key={meal}><span>{meal}</span>
        <textarea rows={2} value={entry.f[index] ?? ''} onChange={event => changeMeal(index, event.target.value)} />
      </label>)}</div>
    </section>
    <section className="panel calories-panel">
      <h2>Calories by meal</h2>
      <div id="calorieSummary" className="calorie-summary">{calories === null ? 'No calories logged' : numberLabel.format(Math.round(calories)) + ' kcal'}</div>
      {meals.map(meal => {
        const amount = total(items.filter(item => item.meal === meal))
        return <div className="meal-progress" key={meal}>
          <div>{meal}<strong>{amount === null ? '—' : numberLabel.format(Math.round(amount)) + ' kcal'}</strong></div>
          <div className="bar" aria-hidden="true"><span style={{ width: (calories ? (amount ?? 0) / calories * 100 : 0) + '%' }} /></div>
        </div>
      })}
      <p className="muted">Estimates depend on portions and preparation.</p>
      <div id="autoWarnings" role="status">{warnings.join(' | ')}</div>
      <details><summary>Breakdown and manual adjustments</summary>
        <ManualFood items={items} change={cal => changeEntry({ ...entry, cal })} />
        <button type="button" className="quiet-button" onClick={recalculate}>Recalculate from journal</button>
      </details>
    </section>
    <section className="panel recovery">
      <h2>Activity &amp; recovery</h2>
      <div id="metrics">{metrics.map((metric, index) => <label key={metric}>{metric}
        <input type="number" min="0" step="any" value={entry.m[index] ?? ''}
          onChange={event => changeEntry({ ...entry, m: entry.m.map((value, i) => i === index ? event.target.value : value) })} />
      </label>)}</div>
      <label>Notes<textarea value={entry.notes ?? ''} placeholder="Anything you’d like to remember?"
        onChange={event => changeEntry({ ...entry, notes: event.target.value })} /></label>
    </section>
  </div>
}

function ManualFood({ items, change }: { items: Food[]; change(items: Food[]): void }) {
  const [selection, setSelection] = useState(0)
  const [name, setName] = useState(catalog[0][0])
  const [rate, setRate] = useState(String(catalog[0][1]))
  function select(index: number) {
    const [label, calories] = catalog[index]
    setSelection(index)
    setName(calories === null ? '' : label)
    setRate(calories === null ? '' : String(calories))
  }
  function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const quantity = Number(data.get('quantity'))
    const price = Number(rate)
    if (!name.trim() || !rate || !Number.isFinite(quantity) || !Number.isFinite(price) || quantity <= 0 || price < 0) return
    const meal = meals.find(meal => meal === data.get('meal'))
    if (meal) change([...items, { meal, name: name.trim(), qty: quantity, rate: price }])
  }
  return <>
    <p>Approximate calories per serving. Choose food, portion and meal. Oil, recipes and serving sizes vary.</p>
    <form className="manual-food" onSubmit={add}>
      <label htmlFor="manual-meal">Meal</label>
      <select id="manual-meal" name="meal">{meals.map(meal => <option key={meal}>{meal}</option>)}</select>
      <label htmlFor="manual-food">Food</label>
      <select id="manual-food" value={selection} onChange={event => select(Number(event.target.value))}>
        {catalog.map(([name], index) => <option key={name} value={index}>{name}</option>)}
      </select>
      <label>Food name / description<input value={name} onChange={event => setName(event.target.value)} required /></label>
      <div className="row">
        <label>Servings<input name="quantity" type="number" min="0.01" step="any" defaultValue="1" required /></label>
        <label>kcal per serving<input value={rate} onChange={event => setRate(event.target.value)} type="number" min="0" step="any" required /></label>
      </div>
      <button type="submit">Add food</button>
    </form>
    <div id="calList">{meals.map(meal => {
      const matches = items.map((item, index) => ({ item, index })).filter(({ item }) => item.meal === meal)
      if (!matches.length) return null
      return <div key={meal}><h3>{meal} · {Math.round(total(matches.map(match => match.item)) ?? 0)} kcal</h3>
        {matches.map(({ item, index }) => <p key={index}>
          {item.name} × {item.qty} = {Math.round(item.qty * item.rate)} kcal
          <button type="button" className="quiet-button danger-button" onClick={() => change(items.filter((_, i) => i !== index))}>Remove</button>
        </p>)}</div>
    })}</div>
  </>
}
