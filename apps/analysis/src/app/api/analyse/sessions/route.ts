import { NextResponse } from 'next/server'
import { getAuthUser } from '@paddlesnitch/core/auth'
import { listSessionSummaries } from '@/lib/analysis-store'

// GET /analyse/api/analyse/sessions — the signed-in user's saved paddles (summaries,
// newest first). Private to the user.
export async function GET() {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json({ sessions: await listSessionSummaries(user.id) })
}
