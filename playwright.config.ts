import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'html',
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
    extraHTTPHeaders: {
      'x-vercel-protection-bypass': process.env.VERCEL_AUTOMATION_BYPASS_SECRET ?? '',
    },
  },
  projects: [
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: 'free-user',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'e2e/fixtures/free-user.json',
      },
      dependencies: ['setup'],
    },
    {
      name: 'pro-user',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'e2e/fixtures/pro-user.json',
      },
      dependencies: ['setup'],
    },
    {
      name: 'admin',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'e2e/fixtures/admin.json',
      },
      dependencies: ['setup'],
    },
  ],
  webServer: process.env.BASE_URL
    ? undefined
    : {
        command: 'pnpm --filter @drop-note/web dev',
        url: 'http://localhost:3000',
        reuseExistingServer: !process.env.CI,
      },
})
