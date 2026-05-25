import { NextRequest, NextResponse } from 'next/server'
import { verifyPassword } from '@/lib/users'
import { createSession, SESSION_COOKIE } from '@/lib/sessions'

export async function POST(req: NextRequest) {
  const { email, password } = await req.json()

  if (!email || !password) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const user = await verifyPassword(email, password)
  if (!user) {
    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
  }

  const token = await createSession(user.id)
  const res = NextResponse.json({
    id: user.id,
    email: user.email,
    displayName: user.displayName,
  })
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  })
  return res
}
