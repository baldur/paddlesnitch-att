import type { AuthUser } from './types'
import { cookies } from 'next/headers'
import { getSession, SESSION_COOKIE } from './sessions'
import { findUserById } from './users'

// Returns the authenticated user from the session cookie, or null.
// In prod: swap to Cognito JWT verification via Authorization header.
export async function getAuthUser(): Promise<AuthUser | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE)?.value
  if (!token) return null

  const session = await getSession(token)
  if (!session) return null

  const user = await findUserById(session.userId)
  if (!user) return null

  return { id: user.id, email: user.email, displayName: user.displayName }
}
