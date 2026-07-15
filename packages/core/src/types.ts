// Platform identity + Strava plumbing types shared across apps.

export type AuthUser = {
  id: string
  email: string
  displayName: string
}

// Persisted per-user at users/{userId}/strava.json. Consumers should call
// getValidStravaTokens(), which refreshes if expiresAt is close, so the
// returned accessToken is safe to send to Strava immediately.
export type StravaTokens = {
  athleteId: number
  athleteName: string
  accessToken: string
  refreshToken: string
  // Unix seconds, matches Strava's expires_at field.
  expiresAt: number
}

// Trimmed slice of the Strava activity payload — only the fields the picker
// renders. Full Strava payload is huge; we don't store it.
export type StravaActivitySummary = {
  id: number
  name: string
  // sport_type on new activities, falling back to type. We normalise.
  sportType: string
  startDate: string             // ISO 8601, includes zone
  distanceMetres: number
  movingSeconds: number
}
