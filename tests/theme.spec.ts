import { expect, test } from '@playwright/test'

test('sets the saved or system theme before React runs', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.route('**/assets/*.js', route => route.abort())
  await page.goto('./')
  const root = page.locator('html')
  const themeColor = page.locator('meta[name="theme-color"]')
  await expect(root).toHaveAttribute('data-theme', 'dark')
  await expect(themeColor).toHaveAttribute('content', '#292b39')
  await page.evaluate(() => localStorage.setItem('routine-theme', 'light'))
  await page.reload()
  await expect(root).toHaveAttribute('data-theme', 'light')
  await expect(themeColor).toHaveAttribute('content', '#dfdce7')
})

test('keeps Opal text, interactive controls and chart marks legible', async ({ page }) => {
  await page.goto('./')
  for (const theme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: theme as 'light' | 'dark' })
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
    const icon = theme === 'light' ? 'violet' : 'rose'
    await expect(page.locator('.login-brand img')).toHaveAttribute(
      'src', `/habit48/brand/icons/icon-512-mr-${icon}-rounded-v2.png`,
    )
    const failures = await page.evaluate(() => {
      const css = getComputedStyle(document.documentElement)
      function luminance(token: string) {
        const hex = css.getPropertyValue(token).trim()
        if (!/^#[0-9a-f]{6}$/i.test(hex)) throw Error('Expected a solid colour for ' + token + ': ' + hex)
        const rgb = (hex.slice(1).match(/../g) ?? []).map(channel => parseInt(channel, 16) / 255)
          .map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4)
        return .2126 * rgb[0] + .7152 * rgb[1] + .0722 * rgb[2]
      }
      const pairs: [string, string, number][] = [
        ['--ink', '--surface', 4.5], ['--muted', '--surface', 4.5],
        ['--muted', '--soft', 4.5], ['--ink', '--surface-overlay', 4.5],
        ['--on-accent', '--accent', 4.5], ['--hero-text', '--hero', 4.5],
        ['--hero-accent', '--hero', 4.5], ['--hero-accent', '--hero-track', 3],
        ['--focus-ring', '--surface', 3], ['--control-border', '--soft', 3],
        ['--chart-primary', '--surface', 3], ['--progress-fill', '--progress-track', 3],
      ]
      for (const canvas of ['--canvas', '--canvas-blue', '--canvas-rose']) pairs.push(['--muted', canvas, 4.5])
      return pairs.flatMap(([foreground, background, minimum]) => {
        const levels = [luminance(foreground), luminance(background)].sort((a, b) => b - a)
        const ratio = (levels[0] + .05) / (levels[1] + .05)
        return ratio < minimum ? [foreground + ' on ' + background + ' is ' + ratio.toFixed(2) + ':1'] : []
      })
    })
    expect(failures, theme).toEqual([])
  }
})
