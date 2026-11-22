import { devices, expect, test, type Page } from '@playwright/test'
import { shift, today } from '../src/domain/journal'
import { ownerUsername } from '../src/services/config'
import { journalBackend } from './supabase-fixture'

const nav = (page: Page, name: string) => page.getByRole('navigation').getByRole('link', { name, exact: true }).click()
async function login(page: Page) {
  await page.goto('./')
  await page.locator('#splash').waitFor({ state: 'hidden' })
  await page.getByLabel('Username').fill(ownerUsername)
  await page.getByLabel('Password', { exact: true }).fill('sample-password')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.locator('.sync-indicator [role="status"]')).toHaveText('Live')
}

test('removes ChatGPT attribution while keeping the workout link and other parameters', async ({ page, context }) => {
  await journalBackend().attach(context)
  await page.goto('./?utm_source=chatgpt.com&ref=shortcut#workout')
  await expect(page).toHaveURL(/\/habit48\/\?ref=shortcut#workout$/)
})

test('personal goals update from quick logs and monthly reflections survive reload', async ({ page, context }) => {
  await journalBackend().attach(context)
  await login(page)
  const goals = page.getByRole('region', { name: 'My Goals' })
  await goals.getByRole('button', { name: 'Create personal goal' }).click()
  await goals.getByLabel('Goal template').selectOption({ label: 'Weekly walking' })
  await goals.getByLabel('Target (min)', { exact: true }).fill('5')
  await goals.getByRole('button', { name: 'Save goal', exact: true }).click()
  await expect(goals.getByRole('heading', { name: 'Weekly walking' })).toBeVisible()
  await page.getByRole('button', { name: '+5 min', exact: true }).click()
  await expect(goals.getByRole('progressbar', { name: 'Weekly walking progress' })).toHaveAttribute('value', '100')
  await goals.getByRole('link', { name: 'Monthly Review' }).click()
  const review = page.getByRole('region', { name: 'Monthly Review' })
  await review.getByLabel('What went well?').fill('Walked at lunch')
  await review.getByRole('button', { name: 'Save reflection' }).click()
  await page.reload()
  await expect(review.getByLabel('What went well?')).toHaveValue('Walked at lunch')
  const [file] = await Promise.all([page.waitForEvent('download'), review.getByRole('button', { name: 'Export monthly Excel' }).click()])
  expect(file.suggestedFilename()).toMatch(/my-routine-\d{4}-\d{2}\.xlsx/)
  await page.getByRole('button', { name: 'Print or save monthly PDF' }).evaluate(button => {
    // Retain the portal output after the mocked print call returns.
    window.print = () => {
      const report = document.querySelector('#privateApp > .month-print')
      report?.parentElement?.append(report.cloneNode(true))
    }
    if (!(button instanceof HTMLButtonElement)) throw Error('Missing print control')
    button.click()
  })
  await page.emulateMedia({ media: 'print' })
  await expect(page.locator('#privateApp > .month-print')).toContainText('Walked at lunch')
  await expect(page.locator('#privateApp > .month-print')).toBeVisible()
  await page.emulateMedia({ media: 'screen' })
})

test('logs a custom habit and exports an opt-in calendar reminder', async ({ page, context }) => {
  await journalBackend().attach(context)
  await login(page)
  await nav(page, 'Settings')
  const habits = page.getByRole('region', { name: 'Custom habits' })
  await habits.getByRole('button', { name: 'Create habit' }).click()
  await habits.getByLabel('Name', { exact: true }).fill('Daily stretch')
  await habits.getByRole('button', { name: 'Save habit' }).click()
  await expect(habits.getByRole('heading', { name: 'Daily stretch' })).toBeVisible()
  const reminder = page.getByRole('group', { name: 'Water logging' })
  await reminder.getByLabel('Enabled').check()
  const [file] = await Promise.all([page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export 90 days to calendar' }).click()])
  expect(file.suggestedFilename()).toBe('my-routine-reminders.ics')
  await nav(page, 'Today')
  const checkbox = page.getByRole('checkbox', { name: 'Complete Daily stretch' })
  await checkbox.check()
  await page.reload()
  await expect(checkbox).toBeChecked()
})

test('quick logs, reviews, goals, schedules and planner sync between desktop and mobile', async ({ page, context, browser, baseURL }, info) => {
  test.skip(info.project.name !== 'desktop', 'This test creates an independent mobile browser context.')
  test.setTimeout(140000)
  const backend = journalBackend()
  const phoneContext = await browser.newContext({ ...devices['Pixel 7'], baseURL })
  try {
    await Promise.all([backend.attach(context), backend.attach(phoneContext)])
    const phone = await phoneContext.newPage()
    await login(page)
    await login(phone)
    const desktopQuick = page.getByRole('region', { name: 'Quick log' })
    const phoneQuick = phone.getByRole('region', { name: 'Quick log' })
    await Promise.all([
      desktopQuick.getByRole('button', { name: '+250 ml', exact: true }).evaluate(node => {
        const button = node as HTMLButtonElement
        button.click()
        button.click()
      }),
      phoneQuick.getByRole('button', { name: '+500 ml', exact: true }).click(),
    ])
    await expect(desktopQuick.getByRole('heading', { name: /Water.*0.75 L/ })).toBeVisible()
    await expect(phoneQuick.getByRole('heading', { name: /Water.*0.75 L/ })).toBeVisible()
    await phoneQuick.getByRole('button', { name: '+5 min', exact: true }).click()
    await expect(desktopQuick.getByRole('heading', { name: /Walking.*5 min/ })).toBeVisible()
    await phoneQuick.getByRole('button', { name: 'Undo last log' }).click()
    await expect(desktopQuick.getByRole('heading', { name: /Walking.*—/ })).toBeVisible()
    await desktopQuick.getByLabel('Quick meal').fill('2 idli')
    await desktopQuick.getByRole('button', { name: 'Log meal' }).click()
    await expect(phone.locator('.stat').filter({ hasText: 'Calories' })).toContainText('120')
    await desktopQuick.getByRole('button', { name: 'Complete habit' }).click()
    await expect(phone.getByRole('checkbox', { name: 'Avoid added sugar' })).toBeChecked()
    await Promise.all([nav(page, 'Review'), nav(phone, 'Review')])
    await expect(phone.getByRole('heading', { name: 'Weekly Review' })).toBeVisible()
    await expect(phone.getByText('0.8 L', { exact: true })).toBeVisible()
    await page.getByLabel('Small goal').fill('Walk at lunch twice')
    await page.getByRole('button', { name: 'Add goal' }).click()
    const goal = phone.getByRole('checkbox', { name: 'Walk at lunch twice' })
    await expect(goal).toBeVisible()
    await goal.check()
    await expect(page.getByRole('checkbox', { name: 'Walk at lunch twice' })).toBeChecked()
    await phone.getByRole('button', { name: 'Previous review week' }).click()
    await expect(phone.getByText('No data this week', { exact: true })).toHaveCount(4)
    expect(await phone.evaluate(() => document.documentElement.scrollWidth)).toBe(await phone.evaluate(() => window.innerWidth))

    await nav(page, 'Settings')
    const routine = page.getByRole('region', { name: 'Flexible routine' })
    await routine.getByLabel('Day mode').selectOption('rest')
    await routine.getByRole('button', { name: 'Save habit schedule' }).click()
    await nav(phone, 'Today')
    await expect(phone.getByText('No habits scheduled today.')).toBeVisible()
    await nav(page, 'Workout')
    const planner = page.getByRole('region', { name: 'Workout calendar' })
    await planner.getByLabel('Assign workout').selectOption('full')
    await planner.getByRole('button', { name: 'Save day plan' }).click()
    await expect(planner.getByText('Full Body Strength · Planned')).toBeVisible()
    await planner.getByLabel('Move workout to').fill(shift(today(), 1))
    await planner.getByRole('button', { name: 'Reschedule workout' }).click()
    await expect(planner.getByText(/Full Body Strength · Planned from/)).toBeVisible()
    await nav(phone, 'Workout')
    await expect(phone.getByRole('region', { name: 'Workout calendar' }).getByText(/Rescheduled to/)).toBeVisible()
  } finally { await phoneContext.close() }
})
