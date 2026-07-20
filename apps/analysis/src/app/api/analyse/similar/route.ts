import { NextResponse } from 'next/server'
import { getAuthUser } from '@paddlesnitch/core/auth'
import { getSession, listSessions } from '@/lib/analysis-store'
import { findSimilar } from '@/lib/similar'

// POST /analyse/api/analyse/similar — body { sourceId, aIdx, bIdx }.
// Derives a start/finish gate from the two clicked points on the source paddle
// and races the user's OWN other paddles through it. Returns the matches
// (newest-first; source excluded). Private to the user.
export async function POST(req: Request) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const sourceId = body?.sourceId
  const aIdx = Number(body?.aIdx), bIdx = Number(body?.bIdx)
  if (typeof sourceId !== 'string' || !Number.isInteger(aIdx) || !Number.isInteger(bIdx)) {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 })
  }

  const source = await getSession(user.id, sourceId)
  if (!source) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const pts = source.result.points
  if (aIdx < 0 || bIdx < 0 || aIdx >= pts.length || bIdx >= pts.length) {
    return NextResponse.json({ error: 'Index out of range' }, { status: 400 })
  }

  const others = await listSessions(user.id)
  const result = findSimilar(source, others, aIdx, bIdx)
  if (!result.ok) return NextResponse.json(result, { status: 422 })
  return NextResponse.json(result)
}
