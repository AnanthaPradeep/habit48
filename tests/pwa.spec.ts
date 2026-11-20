import { expect, test } from '@playwright/test'

test('serves and precaches versioned PWA icons with safe maskable artwork', async ({ page, baseURL }) => {
  await page.goto('./')
  await expect(page.getByRole('heading', { name: 'Welcome back.' })).toBeVisible()
  const manifestUrl = new URL('manifest.webmanifest', baseURL)
  const response = await page.request.get(manifestUrl.href)
  expect(response.ok()).toBe(true)
  const manifest = await response.json()
  expect(manifest).toMatchObject({ id: './', start_url: './', scope: './', display: 'standalone' })
  expect(manifest.icons).toEqual([
    { src: 'icons/my-routine-192-v2.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: 'icons/my-routine-512-v2.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: 'icons/my-routine-maskable-192-v2.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
    { src: 'icons/my-routine-maskable-512-v2.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ])
  const apple = page.locator('link[rel="apple-touch-icon"]')
  const favicon = page.locator('link[rel="icon"]')
  await expect(apple).toHaveAttribute('href', '/habit48/icons/apple-touch-icon-180-v2.png')
  await expect(apple).toHaveAttribute('sizes', '180x180')
  await expect(favicon).toHaveAttribute('href', '/habit48/icons/favicon-32-v2.png')
  await expect(favicon).toHaveAttribute('sizes', '32x32')

  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller))
  const icons = [...manifest.icons,
    { src: 'icons/apple-touch-icon-180-v2.png', sizes: '180x180', purpose: 'apple' },
    { src: 'icons/favicon-32-v2.png', sizes: '32x32', purpose: 'any' }] as { src: string; sizes: string; purpose: string }[]
  const checked = await page.evaluate(async ({ icons, manifestUrl }) => {
    const cache = (await caches.keys()).find(key => key.startsWith('habit48-react-'))
    if (!cache) throw Error('PWA cache was not created')
    const installed = await caches.open(cache)
    return Promise.all(icons.map(async ({ src, sizes, purpose }) => {
      const url = new URL(src, manifestUrl)
      const response = await installed.match(url.href)
      if (!response) throw Error(`Missing precache entry for ${src}`)
      const image = await createImageBitmap(await response.blob())
      const canvas = document.createElement('canvas')
      canvas.width = image.width
      canvas.height = image.height
      const context = canvas.getContext('2d')
      if (!context) throw Error('Canvas unavailable')
      context.drawImage(image, 0, 0)
      const { data } = context.getImageData(0, 0, image.width, image.height)
      let validMask = true
      if (purpose === 'maskable') {
        for (let y = 0; y < image.height; y++) {
          for (let x = 0; x < image.width; x++) {
            const offset = (y * image.width + x) * 4
            const outside = Math.hypot(x + .5 - image.width / 2, y + .5 - image.height / 2) > image.width * .4
            if (data[offset + 3] !== 255 || (outside && (data[offset] !== 5 || data[offset + 1] !== 43 || data[offset + 2] !== 32))) {
              validMask = false
            }
          }
        }
      }
      return { src, dimensions: image.width + 'x' + image.height, sizes, validMask,
        validAppleCorner: purpose !== 'apple' || data[3] === 255 }
    }))
  }, { icons, manifestUrl: manifestUrl.href })
  for (const icon of checked) {
    expect(icon.dimensions, icon.src).toBe(icon.sizes)
    expect(icon.validMask, icon.src).toBe(true)
    expect(icon.validAppleCorner, icon.src).toBe(true)
  }
})
