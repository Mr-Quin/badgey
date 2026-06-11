import { test, expect } from '@playwright/test'
import { fileURLToPath } from 'node:url'
import { BadgePage } from '../pages/badge-page'

const fixture = fileURLToPath(new URL('../fixtures/sample.png', import.meta.url))

test('uploads an image and a new file row appears', async ({ page }) => {
  const badge = new BadgePage(page)
  await badge.goto()
  await badge.connect()

  const before = (await badge.fileNames()).length

  await badge.pickImage(fixture)
  expect(await badge.previewVisible()).toBe(true)

  await badge.upload()
  await badge.waitForUploadComplete()

  await expect.poll(async () => (await badge.fileNames()).length).toBeGreaterThan(before)
})
