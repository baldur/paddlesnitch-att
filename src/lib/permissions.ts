// Centralised access checks. Keep all visibility / ownership logic in one
// file so the permission tests can target a small surface and a future
// auditor sees the whole matrix at a glance.
//
// Permissions matrix lives in docs/features/visibility-clubs-tos.md; the
// names and tests in this file should mirror that doc.

import type { CourseMetadata, TrialMetadata, ClubMetadata, AuthUser } from './types'

// When checking club-scoped visibility, callers fetch the viewer's club
// membership once at the request boundary (see `getUserClubIds` in
// src/lib/clubs.ts) and pass it down to every check on that request.
// Undefined behaves like "viewer is in no clubs."
type ClubIds = Set<string> | undefined

function inClub(clubId: string | undefined, clubIds: ClubIds): boolean {
  return !!clubIds && !!clubId && clubIds.has(clubId)
}

// `viewer` is null for unauthenticated requests.
export function canViewCourse(
  course: CourseMetadata,
  viewer: AuthUser | null,
  viewerClubIds?: ClubIds,
): boolean {
  if (course.visibility === 'public') return true
  if (!viewer) return false
  if (viewer.id === course.adminUserId) return true
  if (course.visibility === 'club') {
    return inClub(course.visibleToClubId, viewerClubIds)
  }
  return false
}

export function canViewTrial(
  trial: TrialMetadata,
  viewer: AuthUser | null,
  viewerClubIds?: ClubIds,
): boolean {
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
  if (trial.visibility === 'club') {
    return inClub(trial.visibleToClubId, viewerClubIds)
  }
  return false
}

// Course / trial mutations stay owner-only even after clubs ship. Clubs
// scope WHO CAN SEE the resource, not WHO OWNS it — that's intentional
// per the design doc (single-user course ownership).
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
export function canSubmitToTrial(
  trial: TrialMetadata,
  viewer: AuthUser | null,
  viewerClubIds?: ClubIds,
): boolean {
  if (!viewer) return false
  if (!canViewTrial(trial, viewer, viewerClubIds)) return false
  if (trial.participation === 'open') return true
  if (viewer.id === trial.adminUserId) return true
  return trial.invitedUserIds.includes(viewer.id)
}

// Whether the resource should appear in a public listing for `viewer`.
// Matches canView semantics with the same club context.
export function isListedForViewer(
  resource:
    | (Pick<CourseMetadata, 'visibility' | 'adminUserId'> & { visibleToClubId?: string })
    | (Pick<TrialMetadata, 'visibility' | 'adminUserId'> & { visibleToClubId?: string }),
  viewer: AuthUser | null,
  viewerClubIds?: ClubIds,
): boolean {
  if (resource.visibility === 'public') return true
  if (!viewer) return false
  if (viewer.id === resource.adminUserId) return true
  if (resource.visibility === 'club') {
    return inClub(resource.visibleToClubId, viewerClubIds)
  }
  return false
}

// ---------------- Clubs ----------------

// Owner can do everything; admins can manage members + invitations + (in
// phase 5) scope course/trial visibility; members can only see.
export function canManageClub(club: ClubMetadata, viewer: AuthUser | null): boolean {
  if (!viewer) return false
  return viewer.id === club.ownerId || club.adminUserIds.includes(viewer.id)
}

// Only the owner can transfer ownership or delete the club outright.
export function canDeleteClub(club: ClubMetadata, viewer: AuthUser | null): boolean {
  return !!viewer && viewer.id === club.ownerId
}

// Any member (incl. admins + owner) can see the club detail. Non-members
// can see the public name/description but not the membership list — that
// gating lives in the API route response shape rather than here.
export function canViewClub(club: ClubMetadata, viewer: AuthUser | null): boolean {
  if (!viewer) return false
  return (
    viewer.id === club.ownerId ||
    club.adminUserIds.includes(viewer.id) ||
    club.memberUserIds.includes(viewer.id)
  )
}
