import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { ownerUsername } from '../src/services/config'
import { journalBackend } from './supabase-fixture'
import type { Activity } from '../src/domain/activity'

test('records simulated GPS offline, saves once, syncs and opens the saved route', async ({ page, context, browser }, info) => {
  const backend = journalBackend()
  await backend.attach(context)
  const rows = new Map<string, { id: string; user_id: string; revision: number; activity: Activity }>()
  const attachCloud = (target: typeof context) => target.route('**/rest/v1/routine_activities?*', async route => {
    if (route.request().method() === 'POST') {
      const row = route.request().postDataJSON()
      if (rows.has(row.id)) { await route.fulfill({ json: [] }); return }
      rows.set(row.id, row)
      await route.fulfill({ json: [row] })
    } else if (route.request().method() === 'PATCH' || route.request().method() === 'DELETE') {
      const params = new URL(route.request().url()).searchParams
      const id = params.get('id')?.slice(3) ?? ''
      const row = rows.get(id)
      if (!row || params.get('revision') !== 'eq.' + row.revision) { await route.fulfill({ json: [] }); return }
      if (route.request().method() === 'DELETE') rows.delete(id)
      else rows.set(id, { ...row, ...route.request().postDataJSON() })
      await route.fulfill({ json: [rows.get(id) ?? row] })
    } else await route.fulfill({ json: [...rows.values()] })
  })
  await attachCloud(context)
  await page.addInitScript(() => {
    let emit: PositionCallback | undefined
    Object.defineProperty(navigator, 'geolocation', { value: {
      watchPosition(callback: PositionCallback) { emit = callback; return 1 },
      clearWatch() { emit = undefined },
    } })
    window.addEventListener('routine-test-fix', event => emit?.({
      timestamp: Date.now(),
      coords: { latitude: (event as CustomEvent<number>).detail, longitude: 10, accuracy: 3,
        altitude: null, altitudeAccuracy: null, heading: null, speed: null },
    } as GeolocationPosition))
  })
  await page.goto('./#activity')
  await page.locator('#splash').waitFor({ state: 'hidden' })
  await page.getByLabel('Email address').fill(ownerUsername)
  await page.getByLabel('Password', { exact: true }).fill('sample-password')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('heading', { name: 'Start activity' })).toBeVisible()
  await expect(page.getByText('Activity sync: Synced')).toBeVisible()
  const folder = process.env.ROUTINE_ACTIVITY_SCREENSHOTS
  if (folder) {
    await mkdir(folder, { recursive: true })
    await page.screenshot({ path: resolve(folder, 'activity-' + info.project.name + '-light.png'), fullPage: true })
    await page.getByRole('button', { name: 'Toggle dark theme' }).click()
    await page.screenshot({ path: resolve(folder, 'activity-' + info.project.name + '-dark.png'), fullPage: true })
  }
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller))
  await context.setOffline(true)
  await page.getByRole('button', { name: 'Start activity' }).click()
  await expect(page.getByText('Checking location')).toBeVisible()
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('routine-test-fix', { detail: 10 })))
  await expect(page.getByText('Accurate GPS signal')).toBeVisible()
  await expect(page.getByRole('region', { name: 'Recorded GPS route' })).toBeVisible()
  await page.waitForTimeout(2200)
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('routine-test-fix', { detail: 10.00008 })))
  await expect(page.getByText('0.01 km', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Pause activity' }).click()
  await expect(page.getByText('Paused', { exact: true })).toBeVisible()
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Today' }).click()
  await page.getByRole('link', { name: 'Resume Activity' }).click()
  await page.getByRole('button', { name: 'Resume activity' }).click()
  page.once('dialog', dialog => void dialog.accept())
  await page.getByRole('button', { name: 'Finish activity' }).click()
  await page.getByLabel('Activity title').fill('Simulated morning walk')
  await page.getByRole('button', { name: 'Save activity' }).click()
  await expect(page.getByText('Saved on this device')).toBeVisible()
  expect(rows.size).toBe(0)
  await context.setOffline(false)
  await expect.poll(() => rows.size).toBe(1)
  await expect(page.getByText('Activity sync: Synced')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Simulated morning walk' })).toBeVisible()
  const downloadEvent = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export GPX' }).click()
  expect((await downloadEvent).suggestedFilename()).toBe('my-routine-activity.gpx')
  const second = await browser.newContext()
  try {
    await backend.attach(second)
    await attachCloud(second)
    const device = await second.newPage()
    await device.goto(new URL('#activity', page.url()).href)
    await device.locator('#splash').waitFor({ state: 'hidden' })
    await device.getByLabel('Email address').fill(ownerUsername)
    await device.getByLabel('Password', { exact: true }).fill('sample-password')
    await device.getByRole('button', { name: 'Sign in' }).click()
    await device.getByRole('button', { name: 'History', exact: true }).click()
    await device.getByRole('button', { name: /Simulated morning walk/ }).click()
    await device.getByRole('button', { name: 'Edit activity' }).click()
    await device.getByLabel('Activity title').fill('Edited on second device')
    await device.getByRole('button', { name: 'Save edits' }).click()
    await expect.poll(() => [...rows.values()][0]?.activity.title).toBe('Edited on second device')
    await page.evaluate(() => window.dispatchEvent(new Event('focus')))
    await expect(page.getByRole('heading', { name: 'Edited on second device' })).toBeVisible()
    device.once('dialog', dialog => void dialog.accept())
    await device.getByRole('button', { name: 'Delete activity' }).click()
    await expect.poll(() => rows.size).toBe(0)
  } finally { await second.close() }
})
