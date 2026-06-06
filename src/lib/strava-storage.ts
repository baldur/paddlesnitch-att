import { getJson, putJson, deleteObject } from './storage'
import { refreshIfExpired } from './strava'
import type { StravaTokens } from './types'

const keyFor = (userId: string) => `users/${userId}/strava.json`

export async function getStravaTokens(userId: string): Promise<StravaTokens | null> {
  return getJson<StravaTokens>(keyFor(userId))
}

export async function putStravaTokens(userId: string, tokens: StravaTokens): Promise<void> {
  await putJson(keyFor(userId), tokens)
}

export async function deleteStravaTokens(userId: string): Promise<void> {
  await deleteObject(keyFor(userId))
}

// Returns valid tokens (refreshed if needed) or null if the user isn't
// connected. Persists the refreshed token so subsequent calls don't need to
// hit Strava's oauth endpoint again.
export async function getValidStravaTokens(userId: string): Promise<StravaTokens | null> {
  const stored = await getStravaTokens(userId)
  if (!stored) return null
  const fresh = await refreshIfExpired(stored)
  if (fresh.accessToken !== stored.accessToken) {
    await putStravaTokens(userId, fresh)
  }
  return fresh
}
