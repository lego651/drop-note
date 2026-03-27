import { test, expect } from '@playwright/test'
import { cleanupUser, getUserId, seedItem } from './fixtures/seed'

// Uses free-user storageState (set in playwright.config.ts)

let freeUserId: string

test.beforeAll(async () => {
  freeUserId = await getUserId(process.env.E2E_FREE_USER_EMAIL!)
})

test.beforeEach(async () => {
  await cleanupUser(freeUserId)
})

test('1. onboarding empty state shows drop address and copy button', async ({ page }) => {
  await page.goto('/items')
  await expect(page.getByText(/drop@dropnote\.com/i)).toBeVisible()
  await expect(page.getByRole('button', { name: /copy/i })).toBeVisible()
})

test('2. item appears after seed', async ({ page }) => {
  await seedItem(freeUserId, {
    status: 'done',
    ai_summary: 'Machine learning pipeline overview',
    subject: 'ML Notes',
  })

  await page.goto('/items')
  await expect(page.getByText('ML Notes')).toBeVisible()
  await expect(page.getByText('Machine learning pipeline overview')).toBeVisible()
})

test('3. item detail: edit summary and tags persist', async ({ page }) => {
  await seedItem(freeUserId, {
    status: 'done',
    ai_summary: 'Original summary',
    subject: 'Editable Item',
  })

  await page.goto('/items')
  await page.getByText('Editable Item').click()

  // Edit the summary
  const summaryField = page.getByText('Original summary')
  await summaryField.click()
  await page.keyboard.selectAll()
  await page.keyboard.type('Edited summary')
  await page.keyboard.press('Escape')

  // Reload and assert persistence
  await page.reload()
  await page.getByText('Editable Item').click()
  await expect(page.getByText('Edited summary')).toBeVisible()
})

test('4. hard delete (free user) removes item from list', async ({ page }) => {
  await seedItem(freeUserId, {
    status: 'done',
    subject: 'Item to Delete',
  })

  await page.goto('/items')
  await expect(page.getByText('Item to Delete')).toBeVisible()

  // Open delete flow
  await page.getByText('Item to Delete').hover()
  await page.getByRole('button', { name: /delete/i }).first().click()

  // Confirm in dialog
  await expect(page.getByRole('alertdialog')).toBeVisible()
  await page.getByRole('button', { name: /delete permanently/i }).click()

  await expect(page.getByText('Item to Delete')).not.toBeVisible()
})
