import { test, expect } from '@playwright/test'
import { BadgePage } from '../pages/badge-page'

test('shows unsupported notice when Web Bluetooth is absent', async ({ page }) => {
  await page.addInitScript(() => {
    // Simulate a browser without Web Bluetooth, regardless of transport mode.
    delete (navigator as unknown as { bluetooth?: unknown }).bluetooth
  })

  const badge = new BadgePage(page)
  // Navigate directly (not via BadgePage.goto, which stubs a bluetooth marker
  // for the fake-transport flow) so the support gate sees no Web Bluetooth.
  await page.goto('/')

  expect(await badge.unsupportedVisible()).toBe(true)
  await expect(badge.testid('connect-button')).toHaveCount(0)
})
