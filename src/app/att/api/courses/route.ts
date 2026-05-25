import { NextRequest, NextResponse } from 'next/server'
import { nanoid } from 'nanoid'
import { getAuthUser } from '@/lib/auth'
import { getJson, putJson, listKeys } from '@/lib/storage'
import type { CourseMetadata } from '@/lib/types'

export async function GET() {
  const keys = await listKeys('courses/')
  const metaKeys = keys.filter(k => k.endsWith('metadata.json'))
  const courses = (
    await Promise.all(metaKeys.map(k => getJson<CourseMetadata>(k)))
  ).filter(Boolean)
  return NextResponse.json(courses)
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { name, sport, type = 'one_way', startLine, finishLine, distanceMetres } = body
  if (!name || !sport || !startLine) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }
  if (type === 'one_way' && !finishLine) {
    return NextResponse.json({ error: 'One-way courses require a finish line' }, { status: 400 })
  }

  const id = nanoid()
  const course: CourseMetadata = {
    id,
    name,
    sport,
    type,
    startLine,
    finishLine: type === 'loop' ? undefined : finishLine,
    distanceMetres: Number(distanceMetres ?? 0),
    adminUserId: user.id,
    createdAt: new Date().toISOString(),
  }
  await putJson(`courses/${id}/metadata.json`, course)
  return NextResponse.json(course, { status: 201 })
}
