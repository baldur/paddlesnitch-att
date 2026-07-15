// Per-user persistence for saved paddle analyses. Stored under
// analysis/{userId}/{id}/session.json (S3 in prod, .local-data in dev), private
// to the user. Small scale → list = read each session.json, like att entries.
import { getJson, putJson, listKeys, deleteObject } from '@paddlesnitch/core/storage'
import type { AnalysisResult } from './analysis'

export type AnalysisSource = {
  type: 'file' | 'strava'
  filename?: string
  stravaActivityId?: number
  sport?: string
}

export type AnalysisSession = {
  id: string
  userId: string
  createdAt: string          // when the analysis was run
  paddledAt: string          // the session's own start time (for diary ordering)
  source: AnalysisSource
  doubleStrokeRate: boolean
  note: string               // the paddler's diary text
  insight: string            // the (LLM or templated) narrative
  result: AnalysisResult     // full derived analysis, incl. downsampled map points
}

// Compact shape for the library list + the history digest fed back to the LLM.
export type SessionSummary = {
  id: string
  createdAt: string
  paddledAt: string
  source: AnalysisSource
  durationS: number
  distanceKm: number
  avgSR: number | null
  cruiseSpeed: number
  effortCount: number
  note: string
  insight: string
}

const key = (userId: string, id: string) => `analysis/${userId}/${id}/session.json`

export async function saveSession(s: AnalysisSession): Promise<void> {
  await putJson(key(s.userId, s.id), s)
}

export async function getSession(userId: string, id: string): Promise<AnalysisSession | null> {
  return getJson<AnalysisSession>(key(userId, id))
}

export async function deleteSession(userId: string, id: string): Promise<void> {
  await deleteObject(key(userId, id))
}

export async function updateSessionNote(userId: string, id: string, note: string): Promise<AnalysisSession | null> {
  const s = await getSession(userId, id)
  if (!s) return null
  s.note = note
  await saveSession(s)
  return s
}

function toSummary(s: AnalysisSession): SessionSummary {
  return {
    id: s.id, createdAt: s.createdAt, paddledAt: s.paddledAt, source: s.source,
    durationS: s.result.durationS, distanceKm: s.result.distanceKm,
    avgSR: s.result.avgSR, cruiseSpeed: s.result.cruiseSpeed,
    effortCount: s.result.surges.length, note: s.note, insight: s.insight,
  }
}

// All of a user's sessions as summaries, newest paddle first.
export async function listSessionSummaries(userId: string): Promise<SessionSummary[]> {
  const keys = (await listKeys(`analysis/${userId}/`)).filter(k => k.endsWith('session.json'))
  const sessions = (await Promise.all(keys.map(k => getJson<AnalysisSession>(k)))).filter((s): s is AnalysisSession => !!s)
  return sessions.map(toSummary).sort((a, b) => (b.paddledAt > a.paddledAt ? 1 : -1))
}
