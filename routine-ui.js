const dateLabel = (day, options) => new Intl.DateTimeFormat(undefined, options)
  .format(new Date(day + 'T12:00:00'))
const shortDate = day => dateLabel(day, { month: 'short', day: 'numeric' })
const numberLabel = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 })

function buildJournalFields(habits, meals, metrics) {
  const symbols = ['leaf', 'drop', 'flame', 'meal', 'meal', 'shoe', 'drop', 'moon', 'meal']
  $('habits').innerHTML = habits.map((label, i) =>
    `<label class="habit"><span class="habit-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><use href="#symbol-${symbols[i]}"/></svg></span><span>${label}</span><input type="checkbox" id="h${i}"></label>`).join('')
  $('food').innerHTML = meals.map((label, i) =>
    `<label class="meal-field" for="f${i}"><span>${label}</span><textarea id="f${i}" rows="2"></textarea></label>`).join('')
  $('metrics').innerHTML = metrics.map((label, i) =>
    `<label>${label}<input type="number" min="0" step="any" id="m${i}"></label>`).join('')
}

function renderWeek() {
  const weekday = new Date(n + 'T12:00:00').getDay()
  const monday = shift(n, -((weekday + 6) % 7))
  $('weekRange').textContent = shortDate(monday) + ' – ' + shortDate(shift(monday, 6))
  $('weekTitle').textContent = today() >= monday && today() <= shift(monday, 6) ? 'This week' : 'Selected week'
  const focusedDate = document.activeElement?.dataset.date
  const days = Array.from({ length: 7 }, (_, index) => {
    const day = shift(monday, index)
    const button = document.createElement('button')
    button.type = 'button'
    button.dataset.date = day
    button.setAttribute('aria-pressed', String(day === n))
    const logged = Boolean(d.entries[day])
    button.setAttribute('aria-label', dateLabel(day, { dateStyle: 'full' }) + (logged ? ', logged' : ''))
    if (day === today()) button.setAttribute('aria-current', 'date')
    if (logged) button.classList.add('logged')
    const weekday = document.createElement('span')
    weekday.textContent = dateLabel(day, { weekday: 'short' })
    const number = document.createElement('strong')
    number.textContent = dateLabel(day, { day: 'numeric' })
    button.append(weekday, number)
    button.onclick = () => {
      if (day !== n) move(day)
    }
    return button
  })
  $('weekDays').replaceChildren(...days)
  if (focusedDate) days.find(button => button.dataset.date === focusedDate)?.focus()
  if (['today', 'journal'].includes(document.body.dataset.view)) renderDateContext()
}

function renderDateContext() {
  $('viewContext').textContent = dateLabel(n, { dateStyle: 'full' })
  $('viewTitle').textContent = document.body.dataset.view === 'journal'
    ? 'Daily journal' : n === today() ? 'Make today count.' : 'Daily routine'
}

function renderSummary(completed) {
  const percent = Math.round(100 * completed / h.length)
  $('dailyPercent').textContent = percent + '%'
  $('dailyRing').style.setProperty('--completion', percent + '%')
  $('score').textContent = completed + ' of ' + h.length + ' habits completed'
  $('habitCount').textContent = completed + '/' + h.length + ' done'
  const stats = [['statWalking', $('m1').value], ['statSleep', $('m2').value]]
  for (const [id, value] of stats) $(id).textContent = value === '' ? '—' : numberLabel.format(value)
}

function renderCalories() {
  const sums = f.map(meal => {
    const items = cal.filter(item => item.meal === meal)
    return total({ cal: items })
  })
  const dailyTotal = total({ cal })
  $('statCalories').textContent = dailyTotal === null ? '—' : numberLabel.format(Math.round(dailyTotal))
  $('calorieSummary').textContent = dailyTotal === null ? 'No calories logged' : numberLabel.format(Math.round(dailyTotal)) + ' kcal'
  $('calorieBars').replaceChildren(...sums.map((value, index) => {
    const row = document.createElement('div')
    row.className = 'meal-progress'
    const title = document.createElement('div')
    title.textContent = f[index]
    const amount = document.createElement('strong')
    amount.textContent = value === null ? '—' : numberLabel.format(Math.round(value)) + ' kcal'
    title.append(amount)
    const bar = document.createElement('div')
    bar.className = 'bar'
    bar.setAttribute('aria-hidden', 'true')
    const fill = document.createElement('span')
    fill.style.width = (dailyTotal > 0 ? (value ?? 0) / dailyTotal * 100 : 0) + '%'
    bar.append(fill)
    row.append(title, bar)
    return row
  }))
}

function initializeDashboard() {
  const views = { today: '', journal: '', insights: 'Insights', settings: 'Settings' }
  const nav = [...document.querySelectorAll('[data-view]')]
  const pages = [...document.querySelectorAll('[data-page]')]
  function showView(focus = false) {
    const hash = location.hash.slice(1)
    const view = Object.hasOwn(views, hash) ? hash : 'today'
    document.body.dataset.view = view
    pages.forEach(page => { page.hidden = page.dataset.page !== view })
    nav.forEach(button => {
      if (button.dataset.view === view) button.setAttribute('aria-current', 'page')
      else button.removeAttribute('aria-current')
    })
    if (views[view]) {
      $('viewTitle').textContent = views[view]
      $('viewContext').textContent = 'My Routine'
    } else renderDateContext()
    if (focus && !$('privateApp').hidden) {
      $('viewTitle').focus({ preventScroll: true })
      window.scrollTo(0, 0)
    }
  }
  nav.forEach(button => button.onclick = () => { location.hash = button.dataset.view })
  window.addEventListener('hashchange', () => showView(true))
  const themeButton = $('themeToggle')
  const darkMode = matchMedia('(prefers-color-scheme: dark)')
  let preference
  try { preference = localStorage.getItem('routine-theme') } catch {}
  function applyTheme() {
    const dark = preference ? preference === 'dark' : darkMode.matches
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
    document.querySelector('meta[name="theme-color"]').content = dark ? '#15241d' : '#174B37'
    themeButton.setAttribute('aria-pressed', String(dark))
  }
  darkMode.addEventListener('change', applyTheme)
  themeButton.onclick = () => {
    preference = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'
    try { localStorage.setItem('routine-theme', preference) } catch {}
    applyTheme()
  }
  applyTheme()
  showView()
}
