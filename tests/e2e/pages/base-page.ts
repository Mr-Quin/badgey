import type { Page, Locator } from '@playwright/test'

export class BasePage {
  constructor(protected page: Page) {}
  testid(id: string): Locator {
    return this.page.getByTestId(id)
  }
  async goto() {
    await this.page.goto('/')
  }
}
