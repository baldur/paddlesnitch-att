import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { getJson, putJson } from '@/lib/storage'
import { canViewTrial, canManageTrial } from '@/lib/permissions'
import { getClub, clubRoleOf, getUserClubIds } from '@/lib/clubs'
import type { TrialMetadata, CourseMetadata, Visibility, Participation } from '@/lib/types'

type Params = { params: Promise<{ trialId: string }> }

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

export async function GET(_: NextRequest, { params }: Params) {
  const { trialId } = await params
  const trial = await getJson<TrialMetadata>(`trials/${trialId}/metadata.json`)
  if (!trial) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const viewer = await getAuthUser()
  const viewerClubIds = viewer ? new Set(await getUserClubIds(viewer.id)) : undefined
  if (!canViewTrial(trial, viewer, viewerClubIds)) {
    // Hide existence of private trials from non-owners.
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  return NextResponse.json(trial)
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { trialId } = await params
  const trial = await getJson<TrialMetadata>(`trials/${trialId}/metadata.json`)
  if (!trial) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Course admin used to be able to PATCH trials on their course. With
  // visibility we tighten this to trial-owner-only — the course owner can
  // still see and manage their own course; trials belong to their organiser.
  if (!canManageTrial(trial, user)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // A trial's visibility cannot exceed its parent course's. Private parent
  // → private trial; club parent → trial inherits the club; otherwise
  // the trial gets whatever the patch asked for (subject to club-scope
  // permission, see below).
  const course = await getJson<CourseMetadata>(`courses/${trial.courseId}/metadata.json`)

  const body = await req.json()
  const next: TrialMetadata = { ...trial }
  if (typeof body.name === 'string') next.name = body.name
  if (typeof body.date === 'string') next.date = body.date
  if (body.status === 'open' || body.status === 'closed') next.status = body.status
  if (isVisibility(body.visibility)) {
    // Phase 4 — clamp to the parent course's scope. A trial's visibility
    // can never be wider than its course; private course → private trial;
    // club course → trial inherits the club; otherwise the trial gets
    // whatever was asked for (still subject to club-scope permission).
    let requested: Visibility = body.visibility
    let requestedClubId = typeof body.visibleToClubId === 'string' ? body.visibleToClubId : next.visibleToClubId

    if (course?.visibility === 'private') {
      requested = 'private'
      requestedClubId = undefined
    } else if (course?.visibility === 'club') {
      requested = 'club'
      requestedClubId = course.visibleToClubId
    } else if (requested === 'club') {
      if (requestedClubId && !(await userCanScopeToClub(user.id, requestedClubId))) {
        requested = 'private'
        requestedClubId = undefined
      }
      if (!requestedClubId) {
        requested = 'private'
      }
    }

    // Phase 5 — make-public acknowledgement: a flip TO public (after
    // clamping) requires the owner to explicitly tick the
    // "I understand performance times will become public" box. Club /
    // private widening doesn't trigger this — only the public flip does.
    // The check uses the RESOLVED `requested` value so a request for
    // public that gets clamped to private (because the course is
    // private) doesn't force an unnecessary ack.
    const flippingToPublic = trial.visibility !== 'public' && requested === 'public'
    if (flippingToPublic && body.acknowledged !== true) {
      return NextResponse.json(
        {
          error: 'Making a trial public requires an explicit acknowledgement that participants’ performance times will become visible to anyone.',
          code: 'make_public_ack_required',
        },
        { status: 422 }
      )
    }

    next.visibility = requested
    if (requested === 'club' && requestedClubId) {
      next.visibleToClubId = requestedClubId
    } else {
      delete next.visibleToClubId
    }
  }
  if (isParticipation(body.participation)) {
    // Flipping from invitational to open keeps the invitee list intact —
    // it's just ignored. Flipping back doesn't surprise the owner.
    next.participation = body.participation
  }
  await putJson(`trials/${trialId}/metadata.json`, next)
  return NextResponse.json(next)
}
