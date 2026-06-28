import { NextRequest, NextResponse } from 'next/server'
import { nanoid } from 'nanoid'
import { getAuthUser } from '@/lib/auth'
import { getJson, putJson, listKeys } from '@/lib/storage'
import { canViewCourse, isListedForViewer } from '@/lib/permissions'
import { getGroup, groupRoleOf, getUserGroupIds } from '@/lib/groups'
import type { TrialMetadata, CourseMetadata, Visibility, Participation } from '@/lib/types'

function isVisibility(v: unknown): v is Visibility {
  return v === 'public' || v === 'private' || v === 'group'
}

function isParticipation(v: unknown): v is Participation {
  return v === 'open' || v === 'invitational'
}

async function userCanScopeToGroup(userId: string, groupId: string): Promise<boolean> {
  const group = await getGroup(groupId)
  if (!group) return false
  const role = groupRoleOf(group, userId)
  return role === 'owner' || role === 'admin'
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const courseId = searchParams.get('courseId')
  const viewer = await getAuthUser()
  const viewerGroupIds = viewer ? new Set(await getUserGroupIds(viewer.id)) : undefined

  const keys = await listKeys('trials/')
  const metaKeys = keys.filter(
    k => k.endsWith('metadata.json') && !k.includes('/entries/')
  )
  const all = (
    await Promise.all(metaKeys.map(k => getJson<TrialMetadata>(k)))
  ).filter((t): t is TrialMetadata => t !== null)

  const scoped = courseId ? all.filter(t => t.courseId === courseId) : all
  return NextResponse.json(scoped.filter(t => isListedForViewer(t, viewer, viewerGroupIds)))
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { courseId, name, date, visibility, visibleToGroupId, participation } = body
  if (!courseId || !name || !date) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const course = await getJson<CourseMetadata>(`courses/${courseId}/metadata.json`)
  const viewerGroupIds = new Set(await getUserGroupIds(user.id))
  if (!course || !canViewCourse(course, user, viewerGroupIds)) {
    // Hide existence of private courses from non-owners. A non-owner trying
    // to attach a trial to someone else's private course gets the same
    // "not found" they'd get if the course really didn't exist.
    return NextResponse.json({ error: 'Course not found' }, { status: 404 })
  }

  let resolvedVisibility: Visibility = isVisibility(visibility) ? visibility : 'public'
  let resolvedGroupId: string | undefined

  // Trial-on-group-course: must inherit group scope rather than allowing a
  // wider scope. A "public" trial on a group-only course would leak the
  // course's geometry to anyone with the link.
  if (course.visibility === 'group') {
    resolvedVisibility = 'group'
    resolvedGroupId = course.visibleToGroupId
  } else if (course.visibility === 'private') {
    resolvedVisibility = 'private'
    resolvedGroupId = undefined
  } else if (resolvedVisibility === 'group') {
    const requestedGroup = typeof visibleToGroupId === 'string' ? visibleToGroupId : undefined
    if (requestedGroup && await userCanScopeToGroup(user.id, requestedGroup)) {
      resolvedGroupId = requestedGroup
    } else {
      resolvedVisibility = 'private'
    }
  }

  const id = nanoid()
  const trial: TrialMetadata = {
    id,
    courseId,
    name,
    date,
    status: 'open',
    adminUserId: user.id,
    visibility: resolvedVisibility,
    ...(resolvedGroupId ? { visibleToGroupId: resolvedGroupId } : {}),
    participation: isParticipation(participation) ? participation : 'open',
    invitedUserIds: [],
    createdAt: new Date().toISOString(),
  }
  await putJson(`trials/${id}/metadata.json`, trial)
  return NextResponse.json(trial, { status: 201 })
}
