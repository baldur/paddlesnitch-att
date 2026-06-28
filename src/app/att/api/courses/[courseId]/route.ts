import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { getJson, putJson } from '@/lib/storage'
import { canViewCourse, canManageCourse } from '@/lib/permissions'
import { getGroup, groupRoleOf, getUserGroupIds } from '@/lib/groups'
import { courseHasEntries, geometryChanged, GEOMETRY_FIELDS } from '@/lib/course-entries'
import type { CourseMetadata, Visibility } from '@/lib/types'

type Params = { params: Promise<{ courseId: string }> }

function isVisibility(v: unknown): v is Visibility {
  return v === 'public' || v === 'private' || v === 'group'
}

function isSport(v: unknown): v is CourseMetadata['sport'] {
  return v === 'kayak' || v === 'rowing' || v === 'both'
}

async function userCanScopeToGroup(userId: string, groupId: string): Promise<boolean> {
  const group = await getGroup(groupId)
  if (!group) return false
  const role = groupRoleOf(group, userId)
  return role === 'owner' || role === 'admin'
}

// Applies the patch's visibility (+ visibleToGroupId) onto `next`. Pulled out
// so the in-place edit and the clone branch share the same group-scope guard:
// switching to `group` requires the editor to be owner/admin of the target
// group, otherwise we silently drop to `private` rather than carrying a
// stale groupId or upgrading on bad input.
async function applyVisibility(
  next: CourseMetadata,
  course: CourseMetadata,
  body: Record<string, unknown>,
  userId: string,
): Promise<void> {
  if (!isVisibility(body.visibility)) return
  next.visibility = body.visibility
  if (body.visibility === 'group') {
    const groupId = typeof body.visibleToGroupId === 'string'
      ? body.visibleToGroupId
      : course.visibleToGroupId
    if (groupId && await userCanScopeToGroup(userId, groupId)) {
      next.visibleToGroupId = groupId
    } else {
      next.visibility = 'private'
      delete next.visibleToGroupId
    }
  } else {
    delete next.visibleToGroupId
  }
}

export async function GET(_: NextRequest, { params }: Params) {
  const { courseId } = await params
  const course = await getJson<CourseMetadata>(`courses/${courseId}/metadata.json`)
  // Single 404 for both missing and not-allowed so we don't leak existence
  // of private resources.
  if (!course) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const viewer = await getAuthUser()
  const viewerGroupIds = viewer ? new Set(await getUserGroupIds(viewer.id)) : undefined
  if (!canViewCourse(course, viewer, viewerGroupIds)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  return NextResponse.json(course)
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { courseId } = await params
  const course = await getJson<CourseMetadata>(`courses/${courseId}/metadata.json`)
  if (!course) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!canManageCourse(course, user)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()

  // Once a trace has been submitted, a course's geometry is locked: historical
  // results are recorded against this geometry and changing it would silently
  // invalidate them. Reject geometry edits on a course-with-entries (name +
  // visibility are still fine — they don't affect any result). The proper
  // "clone + re-run all traces + recalculate" flow is tracked in #72.
  const wantsGeometryChange = geometryChanged(course as unknown as Record<string, unknown>, body)
  if (wantsGeometryChange && await courseHasEntries(course.id)) {
    return NextResponse.json(
      {
        error: 'This course already has submitted results, so its layout (lines, gates, type, distance) is locked. You can still edit the name and visibility.',
        code: 'course_has_entries',
      },
      { status: 409 },
    )
  }

  // Plain in-place edit. Whitelist mutable fields rather than spreading body
  // so a client can't sneak in adminUserId / id overrides via a PATCH.
  const next: CourseMetadata = { ...course }
  if (typeof body.name === 'string') next.name = body.name
  if (isSport(body.sport)) next.sport = body.sport
  await applyVisibility(next, course, body, user.id)
  // Geometry edits on a course WITHOUT entries are also allowed in place —
  // there's nothing to preserve. Whitelist-merge to keep PATCH safe.
  for (const field of GEOMETRY_FIELDS) {
    if (field in body) {
      (next as unknown as Record<string, unknown>)[field] = body[field]
    }
  }
  if ('gates' in body) next.gates = body.gates
  await putJson(`courses/${courseId}/metadata.json`, next)
  return NextResponse.json(next)
}
