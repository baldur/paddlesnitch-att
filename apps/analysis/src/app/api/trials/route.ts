import { NextResponse } from 'next/server'
import { getAuthUser } from '@paddlesnitch/core/auth'
import { listUserTrialEntries } from '@/lib/trials'

// The signed-in user's own ATT time-trial submissions, offered as paddles to
// analyse (#159). Auth-gated: only ever your own entries.
export async function GET() {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 })
  const entries = await listUserTrialEntries(user.id)
  return NextResponse.json({ entries })
}
