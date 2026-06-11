import { expect, type Locator } from '@playwright/test'
import { BasePage } from './base-page'

export class BadgePage extends BasePage {
  // The app gates the UI on `'bluetooth' in navigator`. Headless Chromium does
  // not expose Web Bluetooth, so for the fake-transport functional flow we stub
  // a minimal presence marker. The fake transport never touches it; it only
  // needs to exist so the support gate passes. The unsupported spec deliberately
  // does NOT call this (and deletes the marker) to exercise the notice.
  async goto() {
    await this.page.addInitScript(() => {
      if (!('bluetooth' in navigator)) {
        Object.defineProperty(navigator, 'bluetooth', {
          value: {},
          configurable: true,
        })
      }
    })
    await super.goto()
  }

  async connect() {
    await this.testid('connect-button').click()
    await expect(this.testid('connection-status')).toHaveText('connected')
  }

  async isConnected(): Promise<boolean> {
    return (await this.testid('connection-status').textContent())?.trim() === 'connected'
  }

  async freeSpaceText(): Promise<string> {
    return (await this.testid('free-space').textContent())?.trim() ?? ''
  }

  async pickImage(filePath: string) {
    await this.testid('image-input').setInputFiles(filePath)
  }

  previewImage(): Locator {
    return this.page.locator('img[data-testid="image-preview"]')
  }

  async previewVisible(): Promise<boolean> {
    return this.previewImage().isVisible()
  }

  async upload() {
    await this.testid('upload-button').click()
  }

  async waitForUploadComplete() {
    // On success the composer shows a celebratory "It's on your badge!" overlay
    // (testid `upload-success`). That terminal state is the reliable completion
    // signal in fake mode; the transient progress overlay clears just before it.
    await expect(this.testid('upload-success')).toBeVisible()
  }

  async fileNames(): Promise<string[]> {
    const rows = this.testid('file-row')
    // Short timeout: an empty list is a valid state (e.g. after deleting the
    // only file), so don't block for the full test timeout waiting for a row.
    await rows
      .first()
      .waitFor({ state: 'attached', timeout: 1000 })
      .catch(() => {})
    const count = await rows.count()
    const names: string[] = []
    for (let i = 0; i < count; i++) {
      const text = (await rows.nth(i).locator('.name').textContent())?.trim() ?? ''
      names.push(text)
    }
    return names
  }

  async deleteFile(name: string) {
    // Deletion is a two-step safe confirm: the ✕ button reveals an inline
    // Keep / Delete pair, and the second click commits.
    const row = this.testid('file-row').filter({ hasText: name })
    await row.getByTestId('file-delete').click()
    await row.getByTestId('file-delete-confirm').click()
  }

  async unsupportedVisible(): Promise<boolean> {
    return this.testid('unsupported-notice').isVisible()
  }
}
