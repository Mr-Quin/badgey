import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: 'tests/e2e/specs',
  use: {
    baseURL: 'http://localhost:5174',
  },
  webServer: {
    command: 'vite --mode fake --port 5174',
    url: 'http://localhost:5174/',
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
