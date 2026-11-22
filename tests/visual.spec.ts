import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { ownerUsername } from '../src/services/config'
import { journalBackend } from './supabase-fixture'
import { blankEntry, blankJournal, shift, today } from '../src/domain/journal'

test('visual audit of every route and supported viewport', async ({ page, context }, info) => {
  const output = process.env.ROUTINE_VISUAL_OUTPUT
  test.skip(!output || info.project.name !== 'desktop', 'Manual screenshot audit')
  test.setTimeout(360000)
  const folder = resolve(output!)
  await mkdir(folder, { recursive: true })
  const journal = blankJournal()
  for (let i = 0; i < 14; i++) {
    journal.entries[shift(today(), -i)] = {
      ...blankEntry(), h: Array.from({ length: 9 }, (_, index) => (i + index) % 3 !== 0),
      f: ['2 idli', 'Rice and dal', '', '', ''], m: [1.75, 25 + (i % 4) * 5, 7.5, 72, 0],
    }
  }
  await journalBackend(journal).attach(context)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('./')
  if (await page.locator('#splash').isVisible()) await page.screenshot({ path: resolve(folder, 'splash-390.png') })
  await page.locator('#splash').waitFor({ state: 'hidden' })
  await page.screenshot({ path: resolve(folder, 'login-390-light.png') })
  await page.emulateMedia({ colorScheme: 'dark' })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(page.locator('.login-brand img')).toHaveAttribute('src', /icon-512-mr-violet-v1\.png$/)
  await page.locator('.login-brand img').evaluate(image => (image as HTMLImageElement).decode())
  await page.screenshot({ path: resolve(folder, 'login-390-dark.png') })
  await page.emulateMedia({ colorScheme: 'light' })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await page.getByLabel('Email address').fill(ownerUsername)
  await page.getByLabel('Password', { exact: true }).fill('sample-password')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.locator('#privateApp')).toBeVisible()
  const routes = [
    ['today', 'Make today count.'], ['journal', 'Daily journal'], ['workout', 'Workout'],
    ['review', 'Weekly Review'], ['monthly', 'Monthly Review'], ['insights', 'Insights'], ['settings', 'Settings'],
  ]
  for (const theme of ['light', 'dark']) {
    if (theme === 'dark') await page.getByRole('button', { name: 'Toggle dark theme' }).click()
    for (const [width, height] of [[390, 844], [768, 1024], [1440, 1000]]) {
      await page.setViewportSize({ width, height })
      for (const [route, title] of routes) {
        await page.evaluate(hash => { location.hash = hash }, route)
        await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible()
        await expect(page.getByRole('status').filter({ hasText: /^Loading/ })).toHaveCount(0)
        await page.evaluate(() => window.scrollTo(0, 0))
        await page.screenshot({ path: resolve(folder, route + '-' + width + '-' + theme + '.png'), animations: 'disabled', fullPage: route === 'settings' })
      }
    }
  }
  await page.getByRole('button', { name: 'Create habit' }).click()
  await page.screenshot({ path: resolve(folder, 'habit-editor-1440-dark.png'), animations: 'disabled' })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: resolve(folder, 'habit-editor-390-dark.png'), animations: 'disabled' })
  const dialog = page.getByRole('dialog', { name: 'Create custom habit' })
  if (await dialog.isVisible()) {
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Create habit' })).toBeFocused()
  } else await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  if (process.env.ROUTINE_VERIFY_LAYOUT) for (const width of [320, 360, 375, 390, 430, 768, 1024, 1280, 1440, 1920]) {
    await page.setViewportSize({ width, height: width <= 430 ? 720 : width === 768 ? 430 : 900 })
    for (const [route, title] of routes) {
      await page.evaluate(hash => { location.hash = hash }, route)
      await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible()
      await expect(page.getByRole('status').filter({ hasText: /^Loading/ })).toHaveCount(0)
      const overflow = await page.evaluate(() => ({
        width: document.documentElement.scrollWidth,
        elements: [...document.querySelectorAll<HTMLElement>('.workspace *')]
          .filter(node => node.getBoundingClientRect().right > innerWidth + 1 && !node.closest('.studio-days,.chart'))
          .slice(0, 8).map(node => node.id || node.getAttribute('class') || node.tagName),
      }))
      expect.soft(overflow.width, route + ' at ' + width + ' · ' + overflow.elements.join(', ')).toBe(width)
    }
  }
})
