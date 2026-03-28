import { test, expect } from '@playwright/test'

test('login page renders', async ({ page }) => {
  await page.goto('/login')
  await expect(page.getByRole('button', { name: /continue with google/i })).toBeVisible()
  await expect(page.getByText(/sign in/i)).toBeVisible()
})
