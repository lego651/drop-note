import { test as setup } from '@playwright/test'

// Generates e2e/fixtures/auth.json for use as storageState in authenticated tests.
// Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars.
// Run manually once before running authenticated e2e tests:
//   BASE_URL=http://localhost:3000 pnpm e2e --project=setup

setup('authenticate', async ({ page }) => {
  // TODO (Sprint 6): use Supabase admin API to create a test session
  // and save storageState to e2e/fixtures/auth.json.
  // For now this is a placeholder — authenticated tests are added in S113.
  await page.context().storageState({ path: 'e2e/fixtures/auth.json' })
})
