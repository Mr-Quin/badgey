import { test, expect } from '@playwright/test'
import { fileURLToPath } from 'node:url'
import { BadgePage } from '../pages/badge-page'

test('theme toggle switches and clears the data-theme attribute', async ({ page }) => {
  const badge = new BadgePage(page)
  await badge.goto()

  const html = page.locator('html')
  // Default preference is "system" → no explicit attribute (media query drives it).
  await expect(html).not.toHaveAttribute('data-theme', /.+/)

  await page.getByRole('button', { name: 'Dark' }).click()
  await expect(html).toHaveAttribute('data-theme', 'dark')

  await page.getByRole('button', { name: 'Light' }).click()
  await expect(html).toHaveAttribute('data-theme', 'light')

  await page.getByRole('button', { name: 'System' }).click()
  await expect(html).not.toHaveAttribute('data-theme', /.+/)
})

test('delete is a safe two-step confirm: Keep cancels', async ({ page }) => {
  const badge = new BadgePage(page)
  await badge.goto()
  await badge.connect()

  const row = badge.testid('file-row').filter({ hasText: 'f_1.jpg' })
  await row.getByTestId('file-delete').click()
  // Inline confirm appears; backing out with Keep leaves the file in place.
  await expect(row.getByTestId('file-delete-confirm')).toBeVisible()
  await row.getByRole('button', { name: 'Keep' }).click()
  await expect(row).toBeVisible()
  await expect(row.getByTestId('file-delete')).toBeVisible()
})

test('accepts an image pasted from the clipboard', async ({ page }) => {
  const badge = new BadgePage(page)
  await badge.goto()
  await badge.connect()

  // Synthesize a clipboard paste of a 1×1 PNG.
  await page.evaluate(() => {
    const b64 =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
    const bin = atob(b64)
    const arr = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
    const file = new File([arr], 'pasted.png', { type: 'image/png' })
    const dt = new DataTransfer()
    dt.items.add(file)
    window.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }),
    )
  })

  await expect(page.locator('img[data-testid="image-preview"]')).toBeVisible()
})

test('shows an upload size estimate after picking an image', async ({ page }) => {
  const badge = new BadgePage(page)
  await badge.goto()
  await badge.connect()
  await badge.pickImage(fileURLToPath(new URL('../fixtures/sample.png', import.meta.url)))
  await expect(badge.testid('size-estimate')).toContainText(/≈\s*\d+\s*KB/)
})

test('uploaded images appear in history and can be restored', async ({ page }) => {
  const badge = new BadgePage(page)
  await badge.goto()
  await badge.connect()
  await badge.pickImage(fileURLToPath(new URL('../fixtures/sample.png', import.meta.url)))
  await badge.upload()
  await badge.waitForUploadComplete()

  // The just-uploaded file is tied to history, so its row shows a real thumbnail
  // (the seeded f_1.jpg has no history match and stays a generic icon).
  await expect(page.locator('[data-testid="file-row"] img')).toHaveCount(1)

  await page.getByRole('button', { name: 'Done' }).click()

  const item = badge.testid('history-item').first()
  await expect(item).toBeVisible()
  await expect(item).toContainText('Uploaded')

  await item.getByTestId('history-restore').click()
  await expect(page.locator('img[data-testid="image-preview"]')).toBeVisible()
})

test('disconnect returns to the connect screen', async ({ page }) => {
  const badge = new BadgePage(page)
  await badge.goto()
  await badge.connect()

  await page.getByRole('button', { name: 'Disconnect' }).click()
  await expect(badge.testid('connection-status')).toHaveText('idle')
  await expect(badge.testid('connect-button')).toBeVisible()
})
