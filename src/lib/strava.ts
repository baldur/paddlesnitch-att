// Strava OAuth + read-only API wrapper. No SDK — fetch directly.
//
// Token storage is per-user (see putStravaTokens in storage.ts callers).
// The client_secret is sensitive; it lives in SSM Parameter Store in
// production and a local env var in dev, fetched lazily through getClientSecret().

import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm'
import type { StravaTokens, StravaActivitySummary, TrackPoint } from './types'

const STRAVA_BASE = 'https://www.strava.com'
const API_BASE = `${STRAVA_BASE}/api/v3`

// Refresh if the access token will expire within this many seconds. Strava
// access tokens live 6 h; refreshing slightly early is harmless and keeps us
// off the edge of "expired mid-request".
const REFRESH_LEEWAY_SEC = 120

// Sport types we'll surface in the picker. Strava has fifty-ish; we only care
// about ones a paddler or rower would use for a time trial. If you want to
// import something exotic (e.g. "Workout"), paste the URL on the URL tab.
const WATER_SPORT_TYPES = new Set([
  'Kayaking', 'Canoeing', 'Rowing', 'StandUpPaddling', 'VirtualRow',
])

let cachedSecret: string | undefined

async function getClientSecret(): Promise<string | undefined> {
  // Direct env override for local dev and tests.
  const direct = process.env.STRAVA_CLIENT_SECRET
  if (direct) return direct
  if (cachedSecret) return cachedSecret
  const paramName = process.env.STRAVA_CLIENT_SECRET_PARAM
  if (!paramName) return undefined
  try {
    const ssm = new SSMClient({ region: process.env.AWS_REGION ?? 'eu-west-1' })
    const res = await ssm.send(new GetParameterCommand({
      Name: paramName,
      WithDecryption: true,
    }))
    cachedSecret = res.Parameter?.Value
    return cachedSecret
  } catch (err) {
    console.error('[strava] could not fetch client secret from SSM:', err)
    return undefined
  }
}

function getClientId(): string | undefined {
  return process.env.STRAVA_CLIENT_ID
}

// Build the Strava authorize URL that the user is sent to. `state` is the
// CSRF token the caller has stored in a cookie; the callback verifies it.
export function authorizeUrl(state: string, redirectUri: string): string | null {
  const clientId = getClientId()
  if (!clientId) return null
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    approval_prompt: 'auto',
    scope: 'read,activity:read_all',
    state,
  })
  return `${STRAVA_BASE}/oauth/authorize?${params.toString()}`
}

type TokenResponse = {
  access_token: string
  refresh_token: string
  expires_at: number
  athlete?: { id: number; firstname?: string; lastname?: string }
}

// Exchange an authorization code for an initial token pair. Called once per
// connect; throws on any failure since there's nothing the caller can do
// other than show "connect failed, try again".
export async function exchangeCode(code: string): Promise<StravaTokens> {
  const clientId = getClientId()
  const clientSecret = await getClientSecret()
  if (!clientId || !clientSecret) throw new Error('strava_not_configured')

  const res = await fetch(`${STRAVA_BASE}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: 'authorization_code',
    }),
  })
  if (!res.ok) throw new Error(`strava_exchange_failed_${res.status}`)
  const body = (await res.json()) as TokenResponse
  const athlete = body.athlete
  const name = [athlete?.firstname, athlete?.lastname].filter(Boolean).join(' ').trim() || 'Strava athlete'
  return {
    athleteId: athlete?.id ?? 0,
    athleteName: name,
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    expiresAt: body.expires_at,
  }
}

// Refresh the access token if it's expired or about to expire. Returns the
// (possibly updated) tokens — caller is responsible for persisting them if
// `expiresAt` changed.
export async function refreshIfExpired(tokens: StravaTokens): Promise<StravaTokens> {
  const now = Math.floor(Date.now() / 1000)
  if (tokens.expiresAt - now > REFRESH_LEEWAY_SEC) return tokens

  const clientId = getClientId()
  const clientSecret = await getClientSecret()
  if (!clientId || !clientSecret) throw new Error('strava_not_configured')

  const res = await fetch(`${STRAVA_BASE}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      refresh_token: tokens.refreshToken,
    }),
  })
  if (!res.ok) throw new Error(`strava_refresh_failed_${res.status}`)
  const body = (await res.json()) as TokenResponse
  return {
    ...tokens,
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    expiresAt: body.expires_at,
  }
}

// Best-effort revoke. Strava 401s if the token is already invalid — we treat
// that as success since the goal (no usable token on either side) is met.
export async function revoke(accessToken: string): Promise<void> {
  try {
    await fetch(`${STRAVA_BASE}/oauth/deauthorize`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    })
  } catch (err) {
    console.warn('[strava] revoke failed (already invalid?):', err)
  }
}

type RawActivity = {
  id: number
  name: string
  sport_type?: string
  type?: string
  start_date: string
  distance: number          // metres
  moving_time: number       // seconds
}

// Most recent activities first. We page once (per_page=30) — the picker shows
// recent activities, not a full archive.
export async function listActivities(accessToken: string): Promise<StravaActivitySummary[]> {
  const res = await fetch(`${API_BASE}/athlete/activities?per_page=30`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error(`strava_list_failed_${res.status}`)
  const raw = (await res.json()) as RawActivity[]
  return raw
    .map((a): StravaActivitySummary => ({
      id: a.id,
      name: a.name,
      sportType: a.sport_type ?? a.type ?? '',
      startDate: a.start_date,
      distanceMetres: a.distance,
      movingSeconds: a.moving_time,
    }))
    // Drop activities Strava marked as a non-water sport so the picker isn't
    // 80% bike rides. The user can still import via URL if they want one.
    .filter(a => WATER_SPORT_TYPES.has(a.sportType))
}

type StreamSet = {
  latlng?: { data: [number, number][] }
  time?: { data: number[] }
}

// Pull lat/lng + time streams for one activity. Returns null if Strava sent
// nothing useful back (private activity without permission, no GPS, etc).
export async function getActivityStreams(accessToken: string, activityId: number): Promise<{
  latlng: [number, number][]
  time: number[]
  startDate: string
} | null> {
  const [streamsRes, summaryRes] = await Promise.all([
    fetch(`${API_BASE}/activities/${activityId}/streams?keys=latlng,time&key_by_type=true`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    }),
    fetch(`${API_BASE}/activities/${activityId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    }),
  ])
  if (!streamsRes.ok || !summaryRes.ok) return null
  const streams = (await streamsRes.json()) as StreamSet
  const summary = (await summaryRes.json()) as { start_date: string }
  if (!streams.latlng?.data?.length || !streams.time?.data?.length) return null
  return {
    latlng: streams.latlng.data,
    time: streams.time.data,
    startDate: summary.start_date,
  }
}

// Build a TrackPoint[] from the parallel Strava arrays. Strava's `time` is
// seconds-from-start; we add startDate to get absolute Date timestamps, matching
// what gpx.ts / fit.ts produce.
export function streamsToTrack(
  latlng: [number, number][],
  time: number[],
  startDate: string,
): TrackPoint[] {
  const start = new Date(startDate).getTime()
  const n = Math.min(latlng.length, time.length)
  const out: TrackPoint[] = new Array(n)
  for (let i = 0; i < n; i++) {
    out[i] = {
      lat: latlng[i][0],
      lng: latlng[i][1],
      timestamp: new Date(start + time[i] * 1000),
    }
  }
  return out
}
