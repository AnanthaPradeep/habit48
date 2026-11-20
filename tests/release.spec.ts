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
