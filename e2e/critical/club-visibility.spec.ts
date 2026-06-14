import { test, expect } from '@playwright/test'
import {
  signUpFlow,
  createClubViaApi,
  createCourseViaApi,
  signOut,
} from '../helpers'

// Critical path #4 of 5: a course scoped to a club is hidden from
// non-members.
//
// Permission-matrix coverage is in vitest (src/lib/permissions.test.ts
// + src/tests/clubs.test.ts) — this spec just confirms the gate
// actually plumbs through to the rendered Server Component. The
// failure mode we're guarding against is "permission helper says no
// but page still renders" (or the inverse).
//
// We test the unauthenticated case here. Wiring a second signed-in
// user would add the "non-member can't see" case too, but at the cost
// of double the runtime — happy to add it if a regression slips
// through this one.

test('a club-scoped course returns 404 to an unauthenticated visitor', async ({ page }) => {
  await signUpFlow(page, { displayName: 'Club Owner' })

  // Create the club, then a course scoped to it. The owner-creator is
  // automatically a member, so they CAN view it.
  const club = await createClubViaApi(page, { name: 'Owner Only Club' })
  const course = await createCourseViaApi(page, {
    name: 'Members Only Course',
    visibility: 'club',
    visibleToClubId: club.id,
  })

  // Sanity: the owner can see the detail page right now.
  await page.goto(`/att/courses/${course.id}`)
  await expect(page.getByRole('heading', { name: new RegExp(course.name.toUpperCase()) })).toBeVisible()

  // Now drop the session. The detail page should 404 — same response
  // as a missing course, so existence isn't leaked.
  await signOut(page)
  const res = await page.goto(`/att/courses/${course.id}`)
  expect(res?.status()).toBe(404)
})
