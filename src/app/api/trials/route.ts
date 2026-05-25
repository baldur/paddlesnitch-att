import { NextRequest, NextResponse } from 'next/server'
import { nanoid } from 'nanoid'
import { getAuthUser } from '@/lib/auth'
import { getJson, putJson, listKeys } from '@/lib/storage'
import type { TrialMetadata, CourseMetadata } from '@/lib/types'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const courseId = searchParams.get('courseId')

  const keys = await listKeys('trials/')
  const metaKeys = keys.filter(
    k => k.endsWith('metadata.json') && !k.includes('/entries/')
  )
  const all = (
    await Promise.all(metaKeys.map(k => getJson<TrialMetadata>(k)))
  ).filter((t): t is TrialMetadata => t !== null)

  const result = courseId ? all.filter(t => t.courseId === courseId) : all
  return NextResponse.json(result)
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { courseId, name, date } = body
  if (!courseId || !name || !date) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const course = await getJson<CourseMetadata>(`courses/${courseId}/metadata.json`)
  if (!course) return NextResponse.json({ error: 'Course not found' }, { status: 404 })

  const id = nanoid()
  const trial: TrialMetadata = {
    id,
    courseId,
    name,
    date,
    status: 'open',
    adminUserId: user.id,
    createdAt: new Date().toISOString(),
  }
  await putJson(`trials/${id}/metadata.json`, trial)
  return NextResponse.json(trial, { status: 201 })
}
