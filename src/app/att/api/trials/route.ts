import { NextRequest, NextResponse } from 'next/server'
import { nanoid } from 'nanoid'
import { getAuthUser } from '@/lib/auth'
import { getJson, putJson, listKeys } from '@/lib/storage'
import { canViewCourse, isListedForViewer } from '@/lib/permissions'
import { getClub, clubRoleOf, getUserClubIds } from '@/lib/clubs'
import type { TrialMetadata, CourseMetadata, Visibility, Participation } from '@/lib/types'

function isVisibility(v: unknown): v is Visibility {
  return v === 'public' || v === 'private' || v === 'club'
}

function isParticipation(v: unknown): v is Participation {
  return v === 'open' || v === 'invitational'
}

async function userCanScopeToClub(userId: string, clubId: string): Promise<boolean> {
  const club = await getClub(clubId)
  if (!club) return false
  const role = clubRoleOf(club, userId)
  return role === 'owner' || role === 'admin'
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const courseId = searchParams.get('courseId')
  const viewer = await getAuthUser()
  const viewerClubIds = viewer ? new Set(await getUserClubIds(viewer.id)) : undefined

  const keys = await listKeys('trials/')
  const metaKeys = keys.filter(
    k => k.endsWith('metadata.json') && !k.includes('/entries/')
  )
  const all = (
    await Promise.all(metaKeys.map(k => getJson<TrialMetadata>(k)))
  ).filter((t): t is TrialMetadata => t !== null)

  const scoped = courseId ? all.filter(t => t.courseId === courseId) : all
  return NextResponse.json(scoped.filter(t => isListedForViewer(t, viewer, viewerClubIds)))
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { courseId, name, date, visibility, visibleToClubId, participation } = body
  if (!courseId || !name || !date) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const course = await getJson<CourseMetadata>(`courses/${courseId}/metadata.json`)
  const viewerClubIds = new Set(await getUserClubIds(user.id))
  if (!course || !canViewCourse(course, user, viewerClubIds)) {
    // Hide existence of private courses from non-owners. A non-owner trying
    // to attach a trial to someone else's private course gets the same
    // "not found" they'd get if the course really didn't exist.
    return NextResponse.json({ error: 'Course not found' }, { status: 404 })
  }

  let resolvedVisibility: Visibility = isVisibility(visibility) ? visibility : 'public'
  let resolvedClubId: string | undefined

  // Trial-on-club-course: must inherit club scope rather than allowing a
  // wider scope. A "public" trial on a club-only course would leak the
  // course's geometry to anyone with the link.
  if (course.visibility === 'club') {
    resolvedVisibility = 'club'
    resolvedClubId = course.visibleToClubId
  } else if (course.visibility === 'private') {
    resolvedVisibility = 'private'
    resolvedClubId = undefined
  } else if (resolvedVisibility === 'club') {
    const requestedClub = typeof visibleToClubId === 'string' ? visibleToClubId : undefined
    if (requestedClub && await userCanScopeToClub(user.id, requestedClub)) {
      resolvedClubId = requestedClub
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
    ...(resolvedClubId ? { visibleToClubId: resolvedClubId } : {}),
    participation: isParticipation(participation) ? participation : 'open',
    invitedUserIds: [],
    createdAt: new Date().toISOString(),
  }
  await putJson(`trials/${id}/metadata.json`, trial)
  return NextResponse.json(trial, { status: 201 })
}
