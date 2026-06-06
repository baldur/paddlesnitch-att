import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { revoke } from '@/lib/strava'
import { getStravaTokens, deleteStravaTokens } from '@/lib/strava-storage'

export async function POST() {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const tokens = await getStravaTokens(user.id)
  if (tokens) {
    // Revoke on Strava's side first; the user wants the relationship gone, and
    // a leftover access token outliving local storage is the worst case here.
    await revoke(tokens.accessToken)
  }
  await deleteStravaTokens(user.id)
  return NextResponse.json({ ok: true })
}
