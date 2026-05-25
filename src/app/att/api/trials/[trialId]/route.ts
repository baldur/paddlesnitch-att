import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { getJson, putJson } from '@/lib/storage'
import type { TrialMetadata, CourseMetadata } from '@/lib/types'

type Params = { params: Promise<{ trialId: string }> }

export async function GET(_: NextRequest, { params }: Params) {
  const { trialId } = await params
  const trial = await getJson<TrialMetadata>(`trials/${trialId}/metadata.json`)
  if (!trial) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(trial)
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { trialId } = await params
  const trial = await getJson<TrialMetadata>(`trials/${trialId}/metadata.json`)
  if (!trial) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const course = await getJson<CourseMetadata>(`courses/${trial.courseId}/metadata.json`)
  const isTrialAdmin = trial.adminUserId === user.id
  const isCourseAdmin = course?.adminUserId === user.id
  if (!isTrialAdmin && !isCourseAdmin)
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const updated: TrialMetadata = {
    ...trial,
    ...body,
    id: trial.id,
    courseId: trial.courseId,
    createdAt: trial.createdAt,
  }
  await putJson(`trials/${trialId}/metadata.json`, updated)
  return NextResponse.json(updated)
}
