import { NextRequest, NextResponse } from 'next/server'
import { verifyMagicToken } from '@/lib/magic-tokens'
import { findUserByEmail } from '@/lib/users'
import { createSession, SESSION_COOKIE } from '@/lib/sessions'

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const token = searchParams.get('token') ?? ''
  const next = searchParams.get('next') ?? '/'

  if (!token) {
    return NextResponse.redirect(new URL('/auth?error=invalid_token', req.url))
  }

  const email = await verifyMagicToken(token)
  if (!email) {
    return NextResponse.redirect(new URL('/auth?error=invalid_token', req.url))
  }

  const user = await findUserByEmail(email)
  if (!user) {
    return NextResponse.redirect(new URL('/auth?error=invalid_token', req.url))
  }

  const sessionToken = await createSession(user.id)

  const redirectUrl = new URL(next.startsWith('/') ? next : '/', req.url)
  const response = NextResponse.redirect(redirectUrl)
  response.cookies.set(SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30, // 30 days
  })

  return response
}
