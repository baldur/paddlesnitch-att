import { NextRequest, NextResponse } from 'next/server'
import { nanoid } from 'nanoid'
import { getAuthUser } from '@/lib/auth'
import { getJson, putJson, listKeys } from '@/lib/storage'
import { isListedForViewer } from '@/lib/permissions'
import type { CourseMetadata, Visibility } from '@/lib/types'

function isVisibility(v: unknown): v is Visibility {
  return v === 'public' || v === 'private'
}

export async function GET() {
  const viewer = await getAuthUser()
  const keys = await listKeys('courses/')
  const metaKeys = keys.filter(k => k.endsWith('metadata.json'))
  const courses = (
    await Promise.all(metaKeys.map(k => getJson<CourseMetadata>(k)))
  ).filter((c): c is CourseMetadata => !!c)
  return NextResponse.json(courses.filter(c => isListedForViewer(c, viewer)))
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { name, sport, type = 'point_to_point', startLine, finishLine, distanceMetres, minValidSeconds, gateDirection, gates, visibility } = body
  const hasGates = type === 'gate' && Array.isArray(gates) && gates.length >= 2
  if (!name || !sport || (!startLine && !hasGates)) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }
  if ((type === 'point_to_point' || type === 'one_way') && !finishLine) {
    return NextResponse.json({ error: 'Point-to-point courses require a finish line' }, { status: 400 })
  }
  if (type === 'gate' && (!gates || gates.length < 2)) {
    return NextResponse.json({ error: 'Gate courses require at least 2 gates' }, { status: 400 })
  }

  // For gate courses derive startLine/finishLine/gateDirection from the gates array
  const resolvedStartLine = type === 'gate' && gates ? gates[0].line : startLine
  const resolvedFinishLine = type === 'gate' && gates ? gates[gates.length - 1].line : (type === 'loop' ? undefined : finishLine)
  const resolvedGateDirection = type === 'gate' && gates ? gates[0].direction : (gateDirection ?? undefined)

  const id = nanoid()
  const course: CourseMetadata = {
    id,
    name,
    sport,
    type,
    startLine: resolvedStartLine,
    finishLine: resolvedFinishLine,
    distanceMetres: Number(distanceMetres ?? 0),
    ...(minValidSeconds ? { minValidSeconds: Number(minValidSeconds) } : {}),
    ...(resolvedGateDirection != null ? { gateDirection: Number(resolvedGateDirection) as 1 | -1 } : {}),
    ...(type === 'gate' && gates ? { gates } : {}),
    adminUserId: user.id,
    // Default to public — unspecified or malformed values fall through to the
    // safer-for-discovery option. Owners explicitly opt into private.
    visibility: isVisibility(visibility) ? visibility : 'public',
    createdAt: new Date().toISOString(),
  }
  await putJson(`courses/${id}/metadata.json`, course)
  return NextResponse.json(course, { status: 201 })
}
