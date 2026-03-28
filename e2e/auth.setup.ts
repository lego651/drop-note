import { test as setup } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

// Creates authenticated sessions for E2E test users via Supabase admin API.
// Saves storage state to e2e/fixtures/*.json for use as storageState in test projects.
//
// Required env vars:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY
//   E2E_FREE_USER_EMAIL, E2E_PRO_USER_EMAIL, E2E_ADMIN_USER_EMAIL, E2E_USER_PASSWORD
//   BASE_URL (optional, defaults to http://localhost:3000)

const SUPABASE_URL = process.env.SUPABASE_URL!
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY!

async function createSession(
  page: import('@playwright/test').Page,
  email: string,
  password: string,
  storagePath: string,
  isAdmin = false,
) {
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Create user if not already exists (idempotent)
  const { data: userData } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })

  let userId = userData?.user?.id

  if (!userId) {
    // User may already exist — look them up.
    // listUsers with explicit pagination to bound the scan; test user pool is expected to be small.
    const { data: existing } = await admin.auth.admin.listUsers({ perPage: 1000, page: 1 })
    const found = existing?.users?.find((u) => u.email === email)
    if (!found) throw new Error(`Could not create or find user: ${email}`)
    userId = found.id
    // Reset password in case it differs from expected
    await admin.auth.admin.updateUserById(userId, { password })
  }

  if (isAdmin) {
    await admin.from('users').update({ is_admin: true }).eq('id', userId)
  }

  // Sign in via password using the anon client to get a real session token
  const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data: sessionData, error: signInError } = await anonClient.auth.signInWithPassword({
    email,
    password,
  })
  if (signInError || !sessionData.session) {
    throw new Error(`Could not sign in as ${email}: ${signInError?.message ?? 'no session'}`)
  }

  // Inject session into browser localStorage.
  // NOTE: compute the storage key in Node.js context — process.env is not available inside page.evaluate()
  const supabaseProjectRef = new URL(SUPABASE_URL).hostname.split('.')[0]
  const storageKey = `sb-${supabaseProjectRef}-auth-token`

  const baseUrl = process.env.BASE_URL ?? 'http://localhost:3000'
  await page.goto(baseUrl)
  await page.evaluate(
    ({ key, session }) => {
      localStorage.setItem(key, JSON.stringify(session))
    },
    { key: storageKey, session: sessionData.session },
  )

  await page.goto(`${baseUrl}/items`)
  await page.waitForURL('**/items', { timeout: 15000 })
  await page.context().storageState({ path: storagePath })
}

setup('create test user sessions', async ({ page }) => {
  await createSession(
    page,
    process.env.E2E_FREE_USER_EMAIL!,
    process.env.E2E_USER_PASSWORD!,
    'e2e/fixtures/free-user.json',
  )

  await createSession(
    page,
    process.env.E2E_PRO_USER_EMAIL!,
    process.env.E2E_USER_PASSWORD!,
    'e2e/fixtures/pro-user.json',
  )

  await createSession(
    page,
    process.env.E2E_ADMIN_USER_EMAIL!,
    process.env.E2E_USER_PASSWORD!,
    'e2e/fixtures/admin.json',
    true, // set is_admin = true
  )
})
