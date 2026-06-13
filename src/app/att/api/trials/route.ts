import { NextRequest, NextResponse } from 'next/server'
import { nanoid } from 'nanoid'
import { getAuthUser } from '@/lib/auth'
import { getJson, putJson, listKeys } from '@/lib/storage'
import { canViewCourse, isListedForViewer } from '@/lib/permissions'
import type { TrialMetadata, CourseMetadata, Visibility, Participation } from '@/lib/types'

function isVisibility(v: unknown): v is Visibility {
  return v === 'public' || v === 'private'
}

function isParticipation(v: unknown): v is Participation {
  return v === 'open' || v === 'invitational'
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const courseId = searchParams.get('courseId')
  const viewer = await getAuthUser()

  const keys = await listKeys('trials/')
  const metaKeys = keys.filter(
    k => k.endsWith('metadata.json') && !k.includes('/entries/')
  )
  const all = (
    await Promise.all(metaKeys.map(k => getJson<TrialMetadata>(k)))
  ).filter((t): t is TrialMetadata => t !== null)

  const scoped = courseId ? all.filter(t => t.courseId === courseId) : all
  return NextResponse.json(scoped.filter(t => isListedForViewer(t, viewer)))
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { courseId, name, date, visibility, participation } = body
  if (!courseId || !name || !date) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const course = await getJson<CourseMetadata>(`courses/${courseId}/metadata.json`)
  if (!course || !canViewCourse(course, user)) {
    // Hide existence of private courses from non-owners. A non-owner trying
    // to attach a trial to someone else's private course gets the same
    // "not found" they'd get if the course really didn't exist.
    return NextResponse.json({ error: 'Course not found' }, { status: 404 })
  }

  const resolvedVisibility: Visibility = isVisibility(visibility) ? visibility : 'public'
  // A public trial on a private course would leak the course's existence
  // (the trial's view exposes the course geometry). Clamp the trial to be
  // no broader than its parent course.
  const clampedVisibility: Visibility =
    course.visibility === 'private' ? 'private' : resolvedVisibility

  const id = nanoid()
  const trial: TrialMetadata = {
    id,
    courseId,
    name,
    date,
    status: 'open',
    adminUserId: user.id,
    visibility: clampedVisibility,
    participation: isParticipation(participation) ? participation : 'open',
    invitedUserIds: [],
    createdAt: new Date().toISOString(),
  }
  await putJson(`trials/${id}/metadata.json`, trial)
  return NextResponse.json(trial, { status: 201 })
}
