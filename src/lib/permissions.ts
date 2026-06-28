// Centralised access checks. Keep all visibility / ownership logic in one
// file so the permission tests can target a small surface and a future
// auditor sees the whole matrix at a glance.
//
// Permissions matrix lives in docs/features/visibility-groups-tos.md; the
// names and tests in this file should mirror that doc.

import type { CourseMetadata, TrialMetadata, GroupMetadata, AuthUser } from './types'

// When checking group-scoped visibility, callers fetch the viewer's group
// membership once at the request boundary (see `getUserGroupIds` in
// src/lib/groups.ts) and pass it down to every check on that request.
// Undefined behaves like "viewer is in no groups."
type GroupIds = Set<string> | undefined

function inGroup(groupId: string | undefined, groupIds: GroupIds): boolean {
  return !!groupIds && !!groupId && groupIds.has(groupId)
}

// `viewer` is null for unauthenticated requests.
export function canViewCourse(
  course: CourseMetadata,
  viewer: AuthUser | null,
  viewerGroupIds?: GroupIds,
): boolean {
  if (course.visibility === 'public') return true
  if (!viewer) return false
  if (viewer.id === course.adminUserId) return true
  if (course.visibility === 'group') {
    return inGroup(course.visibleToGroupId, viewerGroupIds)
  }
  return false
}

export function canViewTrial(
  trial: TrialMetadata,
  viewer: AuthUser | null,
  viewerGroupIds?: GroupIds,
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
  if (trial.visibility === 'group') {
    return inGroup(trial.visibleToGroupId, viewerGroupIds)
  }
  return false
}

// Course / trial mutations stay owner-only even after groups ship. Groups
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
  viewerGroupIds?: GroupIds,
): boolean {
  if (!viewer) return false
  if (!canViewTrial(trial, viewer, viewerGroupIds)) return false
  if (trial.participation === 'open') return true
  if (viewer.id === trial.adminUserId) return true
  return trial.invitedUserIds.includes(viewer.id)
}

// Whether the resource should appear in a public listing for `viewer`.
// Matches canView semantics with the same group context.
export function isListedForViewer(
  resource:
    | (Pick<CourseMetadata, 'visibility' | 'adminUserId'> & { visibleToGroupId?: string })
    | (Pick<TrialMetadata, 'visibility' | 'adminUserId'> & { visibleToGroupId?: string }),
  viewer: AuthUser | null,
  viewerGroupIds?: GroupIds,
): boolean {
  if (resource.visibility === 'public') return true
  if (!viewer) return false
  if (viewer.id === resource.adminUserId) return true
  if (resource.visibility === 'group') {
    return inGroup(resource.visibleToGroupId, viewerGroupIds)
  }
  return false
}

// ---------------- Groups ----------------

// Owner can do everything; admins can manage members + invitations + (in
// phase 5) scope course/trial visibility; members can only see.
export function canManageGroup(group: GroupMetadata, viewer: AuthUser | null): boolean {
  if (!viewer) return false
  return viewer.id === group.ownerId || group.adminUserIds.includes(viewer.id)
}

// Only the owner can transfer ownership or delete the group outright.
export function canDeleteGroup(group: GroupMetadata, viewer: AuthUser | null): boolean {
  return !!viewer && viewer.id === group.ownerId
}

// Any member (incl. admins + owner) can see the group detail. Non-members
// can see the public name/description but not the membership list — that
// gating lives in the API route response shape rather than here.
export function canViewGroup(group: GroupMetadata, viewer: AuthUser | null): boolean {
  if (!viewer) return false
  return (
    viewer.id === group.ownerId ||
    group.adminUserIds.includes(viewer.id) ||
    group.memberUserIds.includes(viewer.id)
  )
}
