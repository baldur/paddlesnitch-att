import { test, expect } from '@playwright/test'
import { freshEmail, signUpFlow } from '../helpers'

// Critical path #1 of 5: a new user creates an account and lands on the
// authenticated home page. Covers:
//   - signup form submission with the ToS checkbox
//   - automatic sign-in (cookies set on signup response)
//   - redirect to /att and the page actually rendering
//
// This is the cheapest happy-path smoke test. If it breaks, almost
// nothing else works.

test('a new user can sign up and lands on /att with their session', async ({ page }) => {
  const email = freshEmail('signup-spec')

  await signUpFlow(page, { email, displayName: 'Signup Tester' })

  // We're on /att and the hero is visible. Anything tighter ties the
  // test to copy that changes often.
  await expect(page).toHaveURL('/att')
  await expect(page.getByRole('heading', { name: /Automated Time Trials/i })).toBeVisible()

  // Verify the session is actually authenticated. AuthNav shows
  // "SIGN OUT" when signed in (and "SIGN IN" when signed out). The
  // displayed user name comes from the ID token — cognito-local
  // doesn't include `name` in the JWT, so the UI falls back to
  // email-local-part. Asserting on SIGN OUT is the cheapest
  // unambiguous signal that we're authenticated.
  await expect(page.getByRole('button', { name: 'SIGN OUT' })).toBeVisible()
})

test('signup is blocked when the ToS checkbox is not ticked', async ({ page }) => {
  await page.goto('/att/auth')
  await page.getByRole('button', { name: 'SIGN UP', exact: true }).click()
  await page.locator('input[type="email"]').first().fill(freshEmail())
  await page.locator('input[autocomplete="name"]').fill('Unconsented')
  await page.locator('input[type="password"]').fill('Password123')
  // Deliberately skip the ToS checkbox.

  await page.getByRole('button', { name: 'CREATE ACCOUNT', exact: true }).click()
  // The "You must agree to the Terms of Service…" error banner appears.
  // Scope to the error styling so we don't double-match the checkbox
  // label which also mentions "Terms of Service".
  await expect(page.getByText('You must agree to the Terms of Service to create an account.')).toBeVisible()
  await expect(page).toHaveURL(/\/att\/auth/)
})
