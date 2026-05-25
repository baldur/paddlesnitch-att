import { NextRequest, NextResponse } from 'next/server'
import { getJson } from '@/lib/storage'
import type { LeaderboardEntry } from '@/lib/types'

export async function GET(
  _: NextRequest,
  { params }: { params: Promise<{ trialId: string }> }
) {
  const { trialId } = await params
  const leaderboard = await getJson<LeaderboardEntry[]>(
    `trials/${trialId}/leaderboard.json`
  )
  return NextResponse.json(leaderboard ?? [])
}
