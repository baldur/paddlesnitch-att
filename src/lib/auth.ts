import type { AuthUser } from './types'
import { headers } from 'next/headers'

const DEV_USER: AuthUser = {
  id: 'dev-user-001',
  email: 'dev@local',
  displayName: 'Dev User',
}

// Returns the authenticated user from the request, or null.
// In dev (USE_DEV_AUTH=true): always returns DEV_USER.
// In prod: validates Cognito JWT from Authorization header.
export async function getAuthUser(): Promise<AuthUser | null> {
  if (process.env.USE_DEV_AUTH === 'true') {
    return DEV_USER
  }
  const hdrs = await headers()
  const authHeader = hdrs.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return null
  // TODO: verify Cognito JWT (add cognito-jwt-verifier when deploying to AWS)
  return null
}
