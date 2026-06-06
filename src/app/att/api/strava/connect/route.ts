import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { getAuthUser } from '@/lib/auth'
import { authorizeUrl } from '@/lib/strava'

// Kick off the OAuth dance: mint a CSRF state, set it as an httpOnly cookie,
// redirect to Strava's authorize page. The callback verifies the cookie matches
// the `state` Strava echoes back.
export async function GET(req: NextRequest) {
  const user = await getAuthUser()
  if (!user) return NextResponse.redirect(new URL('/att/auth?next=/att/account', req.url))

  const state = randomBytes(24).toString('hex')
  const redirectUri = new URL('/att/api/strava/callback', req.url).toString()
  const url = authorizeUrl(state, redirectUri)
  if (!url) {
    return NextResponse.redirect(new URL('/att/account?strava=not_configured', req.url))
  }

  const res = NextResponse.redirect(url)
  res.cookies.set('strava_state', state, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
    secure: process.env.NODE_ENV === 'production',
  })
  return res
}
