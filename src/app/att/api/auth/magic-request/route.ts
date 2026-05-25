import { NextRequest, NextResponse } from 'next/server'
import { findUserByEmail } from '@/lib/users'
import { createMagicToken } from '@/lib/magic-tokens'
import { sendEmail } from '@/lib/email'
import { nanoid } from 'nanoid'
import { putJson } from '@/lib/storage'
import type { StoredUser } from '@/lib/users'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { email } = body

  if (!email || typeof email !== 'string') {
    return NextResponse.json({ error: 'Email required' }, { status: 400 })
  }

  const normalised = email.toLowerCase().trim()

  // Find or create user
  let user = await findUserByEmail(normalised)
  if (!user) {
    // Create a passwordless user — displayName derived from email local part
    const displayName = normalised.split('@')[0]
    const newUser: StoredUser = {
      id: nanoid(),
      email: normalised,
      displayName,
      passwordHash: nanoid(64), // random — will never be used for login
      createdAt: new Date().toISOString(),
    }
    await putJson(`users/${newUser.id}.json`, newUser)
    user = newUser
  }

  const token = await createMagicToken(normalised)
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? `http://localhost:3000`
  const link = `${baseUrl}/att/api/auth/magic-verify?token=${token}`

  await sendEmail(
    normalised,
    'Your ATT sign-in link',
    `Click the link below to sign in to ATT (expires in 15 minutes):\n\n${link}\n\nIf you did not request this, you can ignore this email.`
  )

  // Always return 200 — don't reveal whether the email exists
  return NextResponse.json({ ok: true })
}
