import { test, expect } from '@playwright/test'
import { getUserId } from './fixtures/seed'

// Tests in this file use multiple storageStates — each test declares which project it needs
// via test.use(). The default project for this spec is 'admin'.

test('1. non-admin is redirected away from /admin', async ({ browser }) => {
  // Use free-user storage state (not admin)
  const ctx = await browser.newContext({
    storageState: 'e2e/fixtures/free-user.json',
  })
  const page = await ctx.newPage()

  await page.goto('/admin')
  await expect(page).not.toHaveURL(/\/admin/)
  await ctx.close()
})

test('2. admin user list is visible to admin', async ({ page }) => {
  await page.goto('/admin')
  await expect(page.getByRole('table')).toBeVisible()
  // At least the test users should appear
  await expect(page.getByText(process.env.E2E_FREE_USER_EMAIL!)).toBeVisible()
})

test('3. block list management: add and remove entry', async ({ page }) => {
  await page.goto('/admin/blocks')

  // Add a block list entry
  await page.getByRole('textbox', { name: /email/i }).fill('spam@example.com')
  await page.getByRole('button', { name: /add/i }).click()

  // Assert entry appears
  await expect(page.getByText('spam@example.com')).toBeVisible()
  await expect(page.getByText('email')).toBeVisible()

  // Remove it
  await page.getByRole('button', { name: /remove/i }).last().click()
  await expect(page.getByText('spam@example.com')).not.toBeVisible()
})

test('4. invite code generation creates new code', async ({ page }) => {
  await page.goto('/admin/invite-codes')

  const before = await page.getByRole('row').count()
  await page.getByRole('button', { name: /generate/i }).click()
  await expect(page.getByRole('row')).toHaveCount(before + 1)
})

test('5. stats page renders without errors', async ({ page }) => {
  const consoleErrors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text())
  })

  await page.goto('/admin')
  await expect(page.getByText(/total users/i)).toBeVisible()
  expect(consoleErrors).toHaveLength(0)
})
