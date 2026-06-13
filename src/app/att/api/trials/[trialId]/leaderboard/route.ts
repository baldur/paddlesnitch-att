import { NextRequest, NextResponse } from 'next/server'
import { getJson } from '@/lib/storage'
import { getAuthUser } from '@/lib/auth'
import { canViewTrial } from '@/lib/permissions'
import { getUserClubIds } from '@/lib/clubs'
import type { LeaderboardEntry, TrialMetadata } from '@/lib/types'

export async function GET(
  _: NextRequest,
  { params }: { params: Promise<{ trialId: string }> }
) {
  const { trialId } = await params
  const trial = await getJson<TrialMetadata>(`trials/${trialId}/metadata.json`)
  if (!trial) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const viewer = await getAuthUser()
  const viewerClubIds = viewer ? new Set(await getUserClubIds(viewer.id)) : undefined
  if (!canViewTrial(trial, viewer, viewerClubIds)) {
    // Same not-found camouflage as the trial detail route: don't leak
    // existence of a private trial through its leaderboard endpoint.
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  const leaderboard = await getJson<LeaderboardEntry[]>(
    `trials/${trialId}/leaderboard.json`
  )
  return NextResponse.json(leaderboard ?? [])
}
