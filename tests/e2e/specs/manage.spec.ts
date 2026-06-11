import { test, expect } from '@playwright/test'
import { BadgePage } from '../pages/badge-page'

test('deletes a file and free space increases', async ({ page }) => {
  const badge = new BadgePage(page)
  await badge.goto()
  await badge.connect()

  await expect(badge.testid('file-row').filter({ hasText: 'f_1.jpg' })).toBeVisible()
  const freeBefore = Number(await badge.freeSpaceText())
  const countBefore = (await badge.fileNames()).length

  await badge.deleteFile('f_1.jpg')

  await expect(badge.testid('file-row').filter({ hasText: 'f_1.jpg' })).toHaveCount(0)
  const countAfter = (await badge.fileNames()).length
  expect(countAfter).toBeLessThan(countBefore)

  const freeAfter = Number(await badge.freeSpaceText())
  expect(freeAfter).toBeGreaterThan(freeBefore)
})
