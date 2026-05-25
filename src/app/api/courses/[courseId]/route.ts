import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { getJson, putJson } from '@/lib/storage'
import type { CourseMetadata } from '@/lib/types'

type Params = { params: Promise<{ courseId: string }> }

export async function GET(_: NextRequest, { params }: Params) {
  const { courseId } = await params
  const course = await getJson<CourseMetadata>(`courses/${courseId}/metadata.json`)
  if (!course) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(course)
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { courseId } = await params
  const course = await getJson<CourseMetadata>(`courses/${courseId}/metadata.json`)
  if (!course) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (course.adminUserId !== user.id)
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const updated = { ...course, ...body, id: course.id, adminUserId: course.adminUserId }
  await putJson(`courses/${courseId}/metadata.json`, updated)
  return NextResponse.json(updated)
}
