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
    // Auth-gated projects require a real browser session via Google OAuth.
    // They run locally where developers can authenticate, but are skipped in CI
    // because drop-note uses Google OAuth only (no password auth provider).
    // The localStorage injection in auth.setup.ts is bypassed by SSR middleware
    // (updateSession reads cookies, not localStorage), so setup always redirects
    // to /login in CI. Local devs can run `pnpm e2e` directly with full coverage.
    ...(process.env.CI
      ? []
      : [
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
        ]),
    // Smoke tests run in CI — no auth needed, just verifies the login page renders.
    {
      name: 'smoke',
      testMatch: /smoke\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
      },
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
