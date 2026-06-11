import { test, expect } from '@playwright/test'
import { BasePage } from '../pages/base-page'

test('app root is visible', async ({ page }) => {
  const app = new BasePage(page)
  await app.goto()
  await expect(app.testid('app-root')).toBeVisible()
})
