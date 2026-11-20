import { CalendarDays, ChartNoAxesColumn, ChevronLeft, ChevronRight, LayoutGrid, BookOpen, SlidersHorizontal, Moon, Sun,
  Check, Flame, Footprints, Leaf, Droplet, Soup } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import { useEffect, useRef, type CSSProperties } from 'react'
import { labelDate, shift, monday, today, habits, numberLabel, type Entry, type Journal } from '../domain/journal'
import { total } from '../domain/calories'
import { logo } from './Branding'

export const views = [
  { id: 'today', label: 'Today', Icon: LayoutGrid },
  { id: 'journal', label: 'Journal', Icon: BookOpen },
  { id: 'insights', label: 'Insights', Icon: ChartNoAxesColumn },
  { id: 'settings', label: 'Settings', Icon: SlidersHorizontal },
] as const
export type View = typeof views[number]['id']
export const getView = (): View => views.find(view => '#' + view.id === location.hash)?.id ?? 'today'

export function Sidebar({ view, logged }: { view: View; logged: number }) {
  return <aside className="sidebar">
    <a className="brand" href="#today"><img src={logo} alt="" width="46" height="46" /><span>My Routine<small>Wellness journal</small></span></a>
    <nav className="navigation" aria-label="Main navigation">
      {views.map(({ id, label, Icon }) => <a key={id} href={'#' + id} aria-current={view === id ? 'page' : undefined}>
        <Icon aria-hidden="true" /><span>{label}</span>
      </a>)}
    </nav>
    <p className="sidebar-summary">{logged} {logged === 1 ? 'day' : 'days'} logged · unlimited journal</p>
  </aside>
}

export function PageHeader({ view, day, theme, toggle, connection, lastSynced }: {
  view: View
  day: string
  theme: 'light' | 'dark'
  toggle(): void
  connection: 'Live' | 'Connecting' | 'Syncing' | 'Offline'
  lastSynced: number | null
}) {
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    const focus = () => {
      heading.current?.focus({ preventScroll: true })
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', focus)
    return () => window.removeEventListener('hashchange', focus)
  }, [])
  const dated = view === 'today' || view === 'journal'
  const title = view === 'journal' ? 'Daily journal' : view === 'today' ? day === today() ? 'Make today count.' : 'Daily routine'
    : views.find(item => view === item.id)?.label
  return <header className="page-header">
    <div><p className="eyebrow">{dated ? labelDate(day, { dateStyle: 'full' }) : 'My Routine'}</p>
      <h1 ref={heading} tabIndex={-1}>{title}</h1></div>
    <div className="header-actions">
      <div className="sync-indicator" data-connection={connection}>
        <span role="status">{connection}</span>
        <small>{lastSynced === null ? 'Last synced —' : <>Last synced <time dateTime={new Date(lastSynced).toISOString()}>
          {new Date(lastSynced).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', second: '2-digit' })}
        </time></>}</small>
      </div>
      <button className="icon-button" type="button" aria-label="Toggle dark theme" aria-pressed={theme === 'dark'} onClick={toggle}>
        {theme === 'dark' ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
      </button>
    </div>
  </header>
}

export function Calendar({ day, journal, move }: { day: string; journal: Journal; move(day: string): void }) {
  const start = monday(day)
  const end = shift(start, 6)
  const now = today()
  const short = (date: string) => labelDate(date, { month: 'short', day: 'numeric' })
  return <section className="calendar panel" aria-labelledby="weekTitle">
    <div className="section-heading">
      <div><h2 id="weekTitle">{now >= start && now <= end ? 'This week' : 'Selected week'}</h2><p>{short(start)} – {short(end)}</p></div>
      <div className="calendar-actions">
        <button className="icon-button" aria-label="Previous week" onClick={() => move(shift(day, -7))}><ChevronLeft aria-hidden="true" /></button>
        <button className="quiet-button" onClick={() => move(now)}>Today</button>
        <button className="icon-button" aria-label="Next week" onClick={() => move(shift(day, 7))}><ChevronRight aria-hidden="true" /></button>
      </div>
    </div>
    <div className="week-days" role="group" aria-label="Days of the selected week">
      {Array.from({ length: 7 }, (_, index) => {
        const date = shift(start, index)
        const logged = Boolean(journal.entries[date])
        return <button key={date} className={logged ? 'logged' : undefined} aria-pressed={date === day}
          aria-current={date === now ? 'date' : undefined} aria-label={labelDate(date, { dateStyle: 'full' }) + (logged ? ', logged' : '')}
          onClick={() => move(date)}>
          <span>{labelDate(date, { weekday: 'short' })}</span><strong>{labelDate(date, { day: 'numeric' })}</strong>
        </button>
      })}
    </div>
    <div className="calendar-date"><CalendarDays size={15} aria-hidden="true" /><label htmlFor="day">Jump to date</label>
      <input id="day" type="date" value={day} onChange={event => move(event.target.value)} /></div>
  </section>
}

const habitIcons = [Leaf, Droplet, Flame, Soup, Soup, Footprints, Droplet, Moon, Soup]
export function Today({ entry, day, start, onToggle }: { entry: Entry; day: string; start: string; onToggle(index: number): void }) {
  const count = entry.h.filter(Boolean).length
  const percent = Math.round(count / habits.length * 100)
  const dayNumber = Math.round((Date.parse(day) - Date.parse(start)) / 86400000) + 1
  const calories = total(entry.cal)
  const reducedMotion = useReducedMotion()
  const stats = [
    { Icon: Flame, label: 'Calories', value: calories === null ? null : Math.round(calories), unit: 'kcal' },
    { Icon: Footprints, label: 'Walking', value: entry.m[1], unit: 'min' },
    { Icon: Moon, label: 'Sleep', value: entry.m[2], unit: 'hrs' },
  ]
  return <>
    <div className="bento">
      <section className="momentum" aria-labelledby="momentumTitle">
        <div><h2 className="eyebrow" id="momentumTitle">Habit progress</h2>
          <strong>{percent}%</strong><p>{count} of {habits.length} habits completed</p></div>
        <motion.div className="progress-ring" aria-hidden="true"
          style={{ '--completion': percent + '%' } as CSSProperties}
          initial={false} animate={{ scale: reducedMotion ? 1 : [1, 1.06, 1] }} transition={{ duration: 0.24 }} key={percent}>
          <Check aria-hidden="true" />
        </motion.div>
      </section>
      <div className="stats">{stats.map(({ Icon, label, value, unit }) => <article key={label} className="stat">
        <Icon aria-hidden="true" /><p>{label}</p><strong>{value == null || value === '' ? '—' : numberLabel.format(Number(value))}</strong> <small>{unit}</small>
      </article>)}</div>
    </div>
    <section className="panel habit-panel">
      <div className="section-heading"><div><h2>Daily habits</h2><p>{day}{dayNumber > 0 ? ' · Day ' + dayNumber : ''}</p></div>
        <span className="pill">{count}/{habits.length} done</span></div>
      <div id="habits">{habits.map((habit, index) => {
        const Icon = habitIcons[index]
        return <label className="habit" key={habit}><span className="habit-icon"><Icon aria-hidden="true" /></span>
          <span>{habit}</span><input type="checkbox" checked={Boolean(entry.h[index])} onChange={() => onToggle(index)} /></label>
      })}</div>
    </section>
  </>
}
