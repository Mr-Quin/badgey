import { test, expect } from '@playwright/test'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'
import { BadgePage } from '../pages/badge-page'

const fixture = fileURLToPath(new URL('../fixtures/clip.webm', import.meta.url))

test('uploads a video clip as an .avi file', async ({ page }) => {
  const badge = new BadgePage(page)
  await badge.goto()
  await badge.connect()

  await badge.pickImage(fixture)

  // Auto-detected as video: the clip UI appears.
  await expect(page.getByTestId('media-type')).toContainText('Video clip')
  await expect(page.getByTestId('video-timeline')).toBeVisible()
  await expect(page.getByTestId('fps-chip').first()).toBeVisible()
  await expect(page.getByTestId('frame-budget')).toBeVisible()

  // The round preview canvas paints real frame pixels (not an empty black canvas).
  await expect
    .poll(() =>
      page.evaluate(() => {
        const c = document.querySelector(
          'canvas[data-testid="image-preview"]',
        ) as HTMLCanvasElement | null
        const ctx = c?.getContext('2d')
        if (!c || !ctx) return false
        const { data } = ctx.getImageData(0, 0, c.width, c.height)
        for (let i = 0; i < data.length; i += 4) {
          if (data[i] > 8 || data[i + 1] > 8 || data[i + 2] > 8) return true
        }
        return false
      }),
    )
    .toBe(true)

  // The clip autoplays, so the playhead advances on its own.
  const scrubLeft = () =>
    page.evaluate(() => {
      const tab = document.querySelector('[title="Drag to set the playback position"]')
      return (tab as HTMLElement | null)?.style.left ?? ''
    })
  const before = await scrubLeft()
  await expect.poll(scrubLeft).not.toBe(before)

  await badge.upload()
  await badge.waitForUploadComplete()

  // The success screen shows a snapshot of the clip (not a blank disc).
  await expect(page.locator('[data-testid="upload-success"] img')).toBeVisible()

  // The badge gallery lists the new clip with an .avi extension.
  await expect
    .poll(async () => (await badge.fileNames()).some((n) => n.endsWith('.avi')))
    .toBe(true)

  // Recent shows the clip as a still snapshot with a video badge (not a broken video).
  const clipRow = page
    .getByTestId('history-item')
    .filter({ has: page.locator('.play') })
    .first()
  await expect(clipRow).toBeVisible()
  await expect(clipRow.locator('img')).toBeVisible()
})

test('an animated gif is treated as a video clip', async ({ page }) => {
  const badge = new BadgePage(page)
  await badge.goto()
  await badge.connect()

  await badge.pickImage(fileURLToPath(new URL('../fixtures/clip.gif', import.meta.url)))

  // Multi-frame gif auto-detects as a clip (not the still-image editor).
  await expect(page.getByTestId('media-type')).toContainText('Video clip')
  await expect(page.getByTestId('video-timeline')).toBeVisible()

  // The preview canvas paints the decoded gif frame.
  await expect
    .poll(() =>
      page.evaluate(() => {
        const c = document.querySelector(
          'canvas[data-testid="image-preview"]',
        ) as HTMLCanvasElement | null
        const ctx = c?.getContext('2d')
        if (!c || !ctx) return false
        const { data } = ctx.getImageData(0, 0, c.width, c.height)
        for (let i = 0; i < data.length; i += 4) {
          if (data[i] > 8 || data[i + 1] > 8 || data[i + 2] > 8) return true
        }
        return false
      }),
    )
    .toBe(true)

  await badge.upload()
  await badge.waitForUploadComplete()
  await expect
    .poll(async () => (await badge.fileNames()).some((n) => n.endsWith('.avi')))
    .toBe(true)
})

test('a pasted animated webp is treated as a video clip', async ({ page }) => {
  const badge = new BadgePage(page)
  await badge.goto()
  await badge.connect()

  const bytes = Array.from(
    readFileSync(fileURLToPath(new URL('../fixtures/clip.webp', import.meta.url))),
  )
  await page.evaluate((arr) => {
    const file = new File([new Uint8Array(arr)], 'clip.webp', { type: 'image/webp' })
    const dt = new DataTransfer()
    dt.items.add(file)
    const ev = new ClipboardEvent('paste', { bubbles: true, cancelable: true })
    Object.defineProperty(ev, 'clipboardData', { value: dt })
    window.dispatchEvent(ev)
  }, bytes)

  await expect(page.getByTestId('media-type')).toContainText('Video clip')
  await expect(page.getByTestId('video-timeline')).toBeVisible()
})
