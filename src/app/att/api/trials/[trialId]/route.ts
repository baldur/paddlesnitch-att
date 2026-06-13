import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { getJson, putJson } from '@/lib/storage'
import { canViewTrial, canManageTrial } from '@/lib/permissions'
import type { TrialMetadata, CourseMetadata, Visibility, Participation } from '@/lib/types'

type Params = { params: Promise<{ trialId: string }> }

function isVisibility(v: unknown): v is Visibility {
  return v === 'public' || v === 'private'
}

function isParticipation(v: unknown): v is Participation {
  return v === 'open' || v === 'invitational'
}

export async function GET(_: NextRequest, { params }: Params) {
  const { trialId } = await params
  const trial = await getJson<TrialMetadata>(`trials/${trialId}/metadata.json`)
  if (!trial) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const viewer = await getAuthUser()
  if (!canViewTrial(trial, viewer)) {
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

  // A trial's visibility cannot exceed its parent course's. If the parent
  // course is private, the trial is forced private regardless of the patch.
  const course = await getJson<CourseMetadata>(`courses/${trial.courseId}/metadata.json`)

  const body = await req.json()
  const next: TrialMetadata = { ...trial }
  if (typeof body.name === 'string') next.name = body.name
  if (typeof body.date === 'string') next.date = body.date
  if (body.status === 'open' || body.status === 'closed') next.status = body.status
  if (isVisibility(body.visibility)) {
    // Make-public acknowledgement: flipping FROM private TO public requires
    // the owner to explicitly tick the "I understand performance times will
    // become public" box. The server enforces this; the UI surfaces it.
    // Phase 5 of docs/features/visibility-clubs-tos.md.
    const flippingToPublic = trial.visibility !== 'public' && body.visibility === 'public'
    if (flippingToPublic && body.acknowledged !== true) {
      return NextResponse.json(
        {
          error: 'Making a trial public requires an explicit acknowledgement that participants’ performance times will become visible to anyone.',
          code: 'make_public_ack_required',
        },
        { status: 422 }
      )
    }
    next.visibility = course?.visibility === 'private' ? 'private' : body.visibility
  }
  if (isParticipation(body.participation)) {
    // Flipping from invitational to open keeps the invitee list intact —
    // it's just ignored. Flipping back doesn't surprise the owner.
    next.participation = body.participation
  }
  await putJson(`trials/${trialId}/metadata.json`, next)
  return NextResponse.json(next)
}
