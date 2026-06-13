import { Page, expect } from '@playwright/test'
import { randomUUID } from 'crypto'

// Helpers shared across E2E specs. Keep the surface small — each helper
// should pay for itself by appearing in >1 test. The dial we're tuning
// is "individual specs read as a script of user actions".

export function freshEmail(prefix = 'e2e'): string {
  return `${prefix}-${randomUUID().slice(0, 8)}@example.com`
}

// Runs the full signup form including the ToS checkbox. Leaves the
// session signed in at /att. Tests that need a logged-in user but
// don't care about the signup flow itself call this in a beforeEach.
export async function signUpFlow(
  page: Page,
  opts: { email?: string; displayName?: string; password?: string } = {},
): Promise<{ email: string; displayName: string }> {
  const email = opts.email ?? freshEmail()
  const displayName = opts.displayName ?? 'E2E User'
  const password = opts.password ?? 'Password123'

  await page.goto('/att/auth')
  // The auth page renders three tab <button> elements (SIGN IN /
  // SIGN UP / EMAIL CODE) above whichever form is active. The form's
  // submit button reads "CREATE ACCOUNT", which keeps tab and submit
  // distinguishable. Pick the SIGN UP tab first.
  await page.getByRole('button', { name: 'SIGN UP', exact: true }).click()
  await page.locator('input[type="email"]').first().fill(email)
  await page.locator('input[autocomplete="name"]').fill(displayName)
  await page.locator('input[type="password"]').fill(password)
  await page.getByLabel(/I have read and agree/i).check()

  await page.getByRole('button', { name: 'CREATE ACCOUNT', exact: true }).click()
  await expect(page).toHaveURL('/att', { timeout: 10_000 })
  return { email, displayName }
}

// Same shape, for an already-existing account.
export async function signInFlow(
  page: Page,
  email: string,
  password = 'Password123',
): Promise<void> {
  await page.goto('/att/auth')
  // SIGN IN is the default tab; just fill and submit. The submit
  // button reads "SIGN IN" too, but the tab's "SIGN IN" button is
  // also visible — both are valid targets at this point because
  // clicking either lands you in the signed-in state once the form
  // is filled. Disambiguate by targeting type=submit.
  await page.locator('input[type="email"]').first().fill(email)
  await page.locator('input[type="password"]').fill(password)
  await page.locator('button[type="submit"]:has-text("SIGN IN")').click()
  await expect(page).toHaveURL(/\/att(?:$|\?|\/)/, { timeout: 10_000 })
}

