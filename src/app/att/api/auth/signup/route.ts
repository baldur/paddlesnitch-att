import { NextRequest, NextResponse } from 'next/server'
import { signUp, signIn } from '@/lib/cognito'
import { setAuthCookies } from '@/lib/auth'
import { applyPendingInvitations } from '@/lib/pending-invitations'

export async function POST(req: NextRequest) {
  const { email, displayName, password } = await req.json()

  if (!email || !displayName || !password) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }
  if (password.length < 8) {
    return NextResponse.json(
      { error: 'Password must be at least 8 characters' },
      { status: 400 }
    )
  }

  const normalised = String(email).toLowerCase().trim()

  const created = await signUp(normalised, String(displayName).trim(), password)
  if ('error' in created) {
    if (created.error === 'email_exists') {
      return NextResponse.json({ error: 'Email already in use' }, { status: 409 })
    }
    if (created.error === 'invalid_password') {
      return NextResponse.json({
        error: 'Password must contain at least one uppercase letter, one lowercase letter, and one number',
      }, { status: 400 })
    }
    return NextResponse.json({ error: 'Sign-up failed' }, { status: 500 })
  }

  const tokens = await signIn(normalised, password)
  if ('error' in tokens) {
    return NextResponse.json({ error: 'Signed up but auto-login failed — please sign in.' }, { status: 500 })
  }

  // Pull in any club invitations queued for this email before signup. Done
  // before we return the cookie so the next request the user makes already
  // shows the clubs they were invited to.
  try {
    await applyPendingInvitations(normalised, created.sub)
  } catch (err) {
    // Don't fail the signup over a pending-invite hiccup — the user can
    // still be re-invited later. Log so we notice in CloudWatch.
    console.error('[signup] applyPendingInvitations failed', err)
  }

  const res = NextResponse.json(
    { id: created.sub, email: normalised, displayName: String(displayName).trim() },
    { status: 201 }
  )
  setAuthCookies(res.cookies, tokens.idToken, tokens.refreshToken)
  return res
}
