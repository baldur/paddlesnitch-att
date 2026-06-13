import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { randomBytes } from 'crypto'
import { exchangeCode, getAthleteProfile } from '@/lib/strava'
import {
  putStravaTokens,
  getUserIdByAthleteId,
  putAthleteIndex,
} from '@/lib/strava-storage'
import {
  findUserByEmail,
  adminCreateUserForStrava,
  customAuthSignIn,
  verifyIdToken,
} from '@/lib/cognito'
import { setAuthCookies } from '@/lib/auth'
import { canonicalBaseUrl } from '@/lib/url'

// Strava OAuth callback for the SIGN-IN flow. This is what runs after the
// user approves the authorize page from /att/api/auth/strava/init.
//
// On success: the user has a Cognito session and is bounced to ?next= (or
// /att). The Strava tokens are also persisted so activity import works
// without a second authorize round-trip.
//
// On failure: bounced back to /att/auth with an ?error= the page maps to a
// friendly message.
export async function GET(req: NextRequest) {
  const base = canonicalBaseUrl(req)
  const params = req.nextUrl.searchParams
  const code = params.get('code')
  const stateFromStrava = params.get('state')
  const errorFromStrava = params.get('error')

  const cookieStore = await cookies()
  const stateCookie = cookieStore.get('strava_signin_state')?.value
  const nextCookie = cookieStore.get('strava_signin_next')?.value ?? '/att'

  // Clear both transient cookies regardless of outcome — they're single-use.
  const clearCookies = (res: NextResponse) => {
    res.cookies.set('strava_signin_state', '', { path: '/', maxAge: 0 })
    res.cookies.set('strava_signin_next', '', { path: '/', maxAge: 0 })
    return res
  }
  const fail = (errKey: string) =>
    clearCookies(NextResponse.redirect(new URL(`/att/auth?error=${errKey}`, base)))

  if (errorFromStrava) return fail('strava_denied')
  if (!code || !stateFromStrava || !stateCookie || stateFromStrava !== stateCookie) {
    return fail('strava_state_mismatch')
  }

  // 1. Exchange the code for tokens + verify the athlete's identity.
  let tokens
  try {
    tokens = await exchangeCode(code)
  } catch (err) {
    console.error('[strava signin] exchange failed', err)
    return fail('strava_exchange_failed')
  }
  const profile = await getAthleteProfile(tokens.accessToken)
  if (!profile) return fail('strava_profile_failed')
  if (!profile.email) {
    // We requested profile:read_all but Strava sometimes returns no email
    // (e.g. user signed up with a phone number only). Without an email we
    // can't auto-link to an existing account or send password resets.
    return fail('strava_no_email')
  }

  // 2. Find or create the matching Cognito user.
  //    Priority:
  //      a) Existing athlete index entry  → use the linked Cognito user.
  //      b) Existing email account        → link the athlete to it.
  //      c) Otherwise                     → create a fresh Cognito user.
  let cognitoEmail: string
  const displayName = [profile.firstname, profile.lastname].filter(Boolean).join(' ').trim()
    || profile.email.split('@')[0]

  const linkedUserId = await getUserIdByAthleteId(profile.id)
  if (linkedUserId) {
    // We have a previous link but only stored the sub, not the email-as-username.
    // Look up the existing user by sub via the email we just got — same email
    // because the link was established under that email. If the user changed
    // their Strava email since linking, the linkedUserId still wins; we just
    // need the current Cognito username for the sign-in call.
    const existing = await findUserByEmail(profile.email)
    if (existing) {
      cognitoEmail = existing.email
    } else {
      // Edge case: the linked Cognito user no longer exists (deleted account?).
      // Drop the stale index and fall through to create a new one.
      console.warn(`[strava signin] athlete ${profile.id} linked to missing user ${linkedUserId}; relinking`)
      cognitoEmail = profile.email
      const created = await adminCreateUserForStrava(profile.email, displayName)
      if ('error' in created) return fail('strava_user_create_failed')
      await putAthleteIndex(profile.id, created.sub)
    }
  } else {
    const existing = await findUserByEmail(profile.email)
    if (existing) {
      cognitoEmail = existing.email
      await putAthleteIndex(profile.id, existing.sub)
    } else {
      const created = await adminCreateUserForStrava(profile.email, displayName)
      if ('error' in created) {
        console.error('[strava signin] adminCreateUser failed', created.error)
        return fail('strava_user_create_failed')
      }
      cognitoEmail = profile.email
      await putAthleteIndex(profile.id, created.sub)
      // Pull in any club invitations queued for this email before signup.
      try {
        const { applyPendingInvitations } = await import('@/lib/pending-invitations')
        await applyPendingInvitations(profile.email, created.sub)
      } catch (err) {
        console.error('[strava signin] applyPendingInvitations failed', err)
      }
    }
  }

  // 3. Sign the user in via Custom Auth, using a server-only one-time token.
  const presetToken = randomBytes(32).toString('hex')
  const signInResult = await customAuthSignIn(cognitoEmail, presetToken)
  if ('error' in signInResult) {
    console.error('[strava signin] customAuthSignIn failed', signInResult.error)
    return fail('strava_signin_failed')
  }

  // 4. Persist the Strava tokens against the actual signed-in user id (which
  //    is the Cognito sub, available from the ID token claims).
  const user = await verifyIdToken(signInResult.idToken)
  if (user) {
    await putStravaTokens(user.id, tokens)
  }

  // 5. Set the auth cookies and bounce to where the user was headed.
  const safeNext = nextCookie.startsWith('/') ? nextCookie : '/att'
  const res = NextResponse.redirect(new URL(safeNext, base))
  setAuthCookies(res.cookies, signInResult.idToken, signInResult.refreshToken)
  return clearCookies(res)
}
