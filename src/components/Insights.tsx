import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { report, type Filters } from '../domain/analytics'
import { total } from '../domain/calories'
import { habits, meals, metrics, type Journal } from '../domain/journal'
import { allHabits, type ScheduleFor } from '../domain/review'
import { scheduledPercent } from '../domain/schedule'
import { download, workbook } from '../services/exports'

type Props = { journal: Journal; filters: Filters; scheduled?: ScheduleFor }
const metricOptions = [
  { value: 'habit', label: 'Habit completion %' }, { value: 'cal', label: 'Logged calories (kcal)' },
  ...metrics.map((label, index) => ({ label, value: String(index) })),
]
export default function Insights({ journal, filters, change, print, scheduled }: Props & {
  change(filters: Filters): void; print(filters: Filters): void
}) {
  const { values, summary } = report(journal, filters, scheduled)
  return <section className="panel insights-panel">
    <h2>Progress over time</h2>
    <div className="report-filters">
      <label>Report period<select value={filters.period} onChange={event => change({ ...filters, period: event.target.value as Filters['period'] })}>
        <option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option>
      </select></label>
      <label>From<input type="date" value={filters.from} onChange={event => change({ ...filters, from: event.target.value })} /></label>
      <label>To<input type="date" value={filters.to} onChange={event => change({ ...filters, to: event.target.value })} /></label>
      <label>Chart metric<select value={filters.metric} onChange={event => change({ ...filters, metric: event.target.value as Filters['metric'] })}>
        {metricOptions.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
      </select></label>
    </div>
    <p id="reportSummary">{summary}</p>
    <div className="chart">
      {values.length ? <>
        {values.some(item => item.value !== null) && <ResponsiveContainer width="100%" height={260} minWidth={0} initialDimension={{ width: 320, height: 260 }}>
          <BarChart data={values} margin={{ top: 10, right: 8, bottom: 0, left: 4 }}>
            <CartesianGrid vertical={false} stroke="var(--line)" />
            <XAxis dataKey="key" tick={{ fill: 'var(--muted)', fontSize: 10 }} minTickGap={18} />
            <YAxis width={34} domain={filters.metric === 'habit' ? [0, 100] : [0, 'auto']} tick={{ fill: 'var(--muted)', fontSize: 11 }} />
            <Tooltip contentStyle={{ background: 'var(--surface)', borderColor: 'var(--line)' }} />
            <Bar dataKey="value" name={metricOptions.find(option => option.value === filters.metric)?.label} fill="var(--accent)" radius={[6, 6, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>}
        <details><summary>View chart data</summary><ValueList values={values} /></details>
      </> : <p>No entries in this date range.</p>}
    </div>
    <div className="row">
      <button onClick={() => download(workbook(journal, filters, scheduled), 'my-routine.xlsx')}>Export Excel (.xlsx)</button>
      <button onClick={() => print(filters)}>Print / Save PDF</button>
    </div>
  </section>
}

function ValueList({ values }: { values: ReturnType<typeof report>['values'] }) {
  return <ul>{values.map(({ key, value, count }) =>
    <li key={key}>{key} · {value === null ? 'No data' : value.toFixed(1)} · {count} logged {count === 1 ? 'day' : 'days'}</li>)}</ul>
}

export function ReportPrint({ journal, filters, scheduled = () => allHabits }: Props) {
  const { rows, values, summary } = report(journal, filters, scheduled)
  return <section id="printReport">
    <h1>My Routine — Report</h1><p>{filters.from} to {filters.to}</p><p>{summary}</p><h2>Progress</h2>
    <ValueList values={values} />
    {rows.map(([day, entry]) => {
      const calories = total(entry.cal)
      const completion = scheduledPercent(entry, scheduled(day))
      return <div key={day}><h2>{day} — {completion === null ? 'Rest' : Math.round(completion) + '%'}</h2>
        <p>Logged calories: {calories === null ? 'Not recorded' : Math.round(calories) + ' kcal'}</p>
        {entry.cal?.map((item, index) => <p key={index}>{item.meal}: {item.name} × {item.qty} = {Math.round(item.qty * item.rate)} kcal</p>)}
        <p>{habits.map((habit, index) => habit + ': ' + (entry.h[index] ? 'Yes' : 'No')).join(' · ')}</p>
        {meals.map((meal, index) => <p key={meal}>{meal}: {entry.f[index]}</p>)}
        {metrics.map((metric, index) => <p key={metric}>{metric}: {entry.m[index]}</p>)}
        <p>{entry.notes}</p>
      </div>
    })}
  </section>
}
