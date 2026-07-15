import { NextResponse } from 'next/server'
import { getAuthUser } from '@paddlesnitch/core/auth'

// Auth check for the analysis page: returns the signed-in user or 401.
export async function GET() {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json({ user })
}
