import { NextRequest, NextResponse } from 'next/server'
import { forgotPassword } from '@/lib/cognito'

// Triggers Cognito to email a 6-digit reset code. We deliberately return the
// same 200 response regardless of whether the email exists in the pool —
// don't leak account-existence to unauthenticated callers.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const email = typeof body?.email === 'string' ? body.email.toLowerCase().trim() : ''
  if (!email) {
    return NextResponse.json({ error: 'Email is required' }, { status: 400 })
  }
  // Fire-and-forget at the API surface. Internal errors are swallowed for the
  // existence-leak reason above; the underlying call still logs to CloudWatch.
  await forgotPassword(email)
  return NextResponse.json({ ok: true })
}
