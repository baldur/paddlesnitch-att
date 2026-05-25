import { NextRequest, NextResponse } from 'next/server'
import { createUser } from '@/lib/users'
import { createSession, SESSION_COOKIE } from '@/lib/sessions'

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

  const result = await createUser(email, displayName, password)
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: 409 })
  }

  const token = await createSession(result.id)
  const res = NextResponse.json(
    { id: result.id, email: result.email, displayName: result.displayName },
    { status: 201 }
  )
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  })
  return res
}
