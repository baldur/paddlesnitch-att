// Centralised access checks. Keep all visibility / ownership logic in one
// file so the permission tests can target a small surface and a future
// auditor sees the whole matrix at a glance.
//
// Permissions matrix lives in docs/features/visibility-clubs-tos.md; the
// names and tests in this file should mirror that doc.

import type { CourseMetadata, TrialMetadata, AuthUser } from './types'

// `viewer` is null for unauthenticated requests.
export function canViewCourse(course: CourseMetadata, viewer: AuthUser | null): boolean {
  if (course.visibility === 'public') return true
  // Private (phase 1): only the owner can see.
  return !!viewer && viewer.id === course.adminUserId
}

export function canViewTrial(trial: TrialMetadata, viewer: AuthUser | null): boolean {
  if (trial.visibility === 'public') return true
  return !!viewer && viewer.id === trial.adminUserId
}

// Course / trial mutations are owner-only at this phase. Club admin
// delegation lands in phase 4.
export function canManageCourse(course: CourseMetadata, viewer: AuthUser | null): boolean {
  return !!viewer && viewer.id === course.adminUserId
}

export function canManageTrial(trial: TrialMetadata, viewer: AuthUser | null): boolean {
  return !!viewer && viewer.id === trial.adminUserId
}

// Whether a logged-out viewer should see this course/trial appear in a
// public listing endpoint. Matches `canViewCourse` semantics — we don't
// have an additional "indexable" axis yet.
export function isListedForViewer(
  resource: { visibility: 'public' | 'private'; adminUserId: string },
  viewer: AuthUser | null,
): boolean {
  if (resource.visibility === 'public') return true
  return !!viewer && viewer.id === resource.adminUserId
}
