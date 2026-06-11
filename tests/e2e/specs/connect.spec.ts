import { test, expect } from '@playwright/test'
import { BadgePage } from '../pages/badge-page'

test('connects to the badge and shows free space', async ({ page }) => {
  const badge = new BadgePage(page)
  await badge.goto()
  await badge.connect()

  expect(await badge.isConnected()).toBe(true)
  await expect(badge.testid('free-space')).toBeVisible()
  expect(await badge.freeSpaceText()).not.toBe('')
})
