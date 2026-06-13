import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { getJson, putJson } from '@/lib/storage'
import { canViewCourse, canManageCourse } from '@/lib/permissions'
import { getClub, clubRoleOf, getUserClubIds } from '@/lib/clubs'
import type { CourseMetadata, Visibility } from '@/lib/types'

type Params = { params: Promise<{ courseId: string }> }

function isVisibility(v: unknown): v is Visibility {
  return v === 'public' || v === 'private' || v === 'club'
}

async function userCanScopeToClub(userId: string, clubId: string): Promise<boolean> {
  const club = await getClub(clubId)
  if (!club) return false
  const role = clubRoleOf(club, userId)
  return role === 'owner' || role === 'admin'
}

export async function GET(_: NextRequest, { params }: Params) {
  const { courseId } = await params
  const course = await getJson<CourseMetadata>(`courses/${courseId}/metadata.json`)
  // Single 404 for both missing and not-allowed so we don't leak existence
  // of private resources.
  if (!course) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const viewer = await getAuthUser()
  const viewerClubIds = viewer ? new Set(await getUserClubIds(viewer.id)) : undefined
  if (!canViewCourse(course, viewer, viewerClubIds)) {
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
  // Whitelist mutable fields rather than spreading body, so a client can't
  // sneak in adminUserId / id overrides via a PATCH.
  const next: CourseMetadata = { ...course }
  if (typeof body.name === 'string') next.name = body.name
  if (isVisibility(body.visibility)) {
    next.visibility = body.visibility
    // Club scope needs a valid club id and the owner must be authorised
    // to scope into it. Otherwise drop back to private — never silently
    // upgrade or carry a stale clubId.
    if (body.visibility === 'club') {
      const clubId = typeof body.visibleToClubId === 'string' ? body.visibleToClubId : course.visibleToClubId
      if (clubId && await userCanScopeToClub(user.id, clubId)) {
        next.visibleToClubId = clubId
      } else {
        next.visibility = 'private'
        delete next.visibleToClubId
      }
    } else {
      delete next.visibleToClubId
    }
  }
  // (Geometry edits get the modify-creates-copy treatment in phase 3.)
  await putJson(`courses/${courseId}/metadata.json`, next)
  return NextResponse.json(next)
}
