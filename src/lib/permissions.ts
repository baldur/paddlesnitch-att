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
  if (!viewer) return false
  if (viewer.id === trial.adminUserId) return true
  // A private invitational trial would be useless if invitees couldn't see
  // the leaderboard they're racing on. Widening view to invitees on private
  // trials matches the expectation that "you got invited" implies "you can
  // watch it run."
  if (trial.participation === 'invitational' && trial.invitedUserIds.includes(viewer.id)) {
    return true
  }
  return false
}

// Course / trial mutations are owner-only at this phase. Club admin
// delegation lands in phase 4.
export function canManageCourse(course: CourseMetadata, viewer: AuthUser | null): boolean {
  return !!viewer && viewer.id === course.adminUserId
}

export function canManageTrial(trial: TrialMetadata, viewer: AuthUser | null): boolean {
  return !!viewer && viewer.id === trial.adminUserId
}

// Can `viewer` submit a trace to this trial?
//   - You must be able to see the trial.
//   - Open participation: any viewer who can see it.
//   - Invitational: viewer must be in invitedUserIds (or be the owner).
// The trial-open/closed status is separately enforced inside the upload
// route — this helper deals purely with WHO is allowed, not WHEN.
export function canSubmitToTrial(trial: TrialMetadata, viewer: AuthUser | null): boolean {
  if (!viewer) return false
  if (!canViewTrial(trial, viewer)) return false
  if (trial.participation === 'open') return true
  if (viewer.id === trial.adminUserId) return true
  return trial.invitedUserIds.includes(viewer.id)
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
