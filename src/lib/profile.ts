// Paddler profile pages (#vanity-profiles). A profile aggregates one user's
// race results across every trial into vanity stats. Two hard rules:
//   1. Opt-in: a profile is private (owner-only) until the user makes it public.
//   2. A profile NEVER reveals a result the viewer couldn't already see — every
//      entry is filtered through canViewTrial, so a private/club result stays
//      hidden exactly as it is on the trial's own leaderboard.
//
// Phase 1 keys profiles by userId (/att/u/{userId}). Claimed vanity handles
// (/att/u/baldur) arrive in phase 2.

import { getJson, putJson, listKeys } from './storage'
import { canViewTrial } from './permissions'
import type { AuthUser, TrialMetadata, CourseMetadata, BoatClass } from './types'

export type ProfileSettings = {
  public: boolean
}

function settingsKey(userId: string): string {
  return `users/${userId}/profile.json`
}

// Profiles default to private — a user must explicitly opt in.
export async function getProfileSettings(userId: string): Promise<ProfileSettings> {
  const rec = await getJson<ProfileSettings>(settingsKey(userId))
  return { public: rec?.public ?? false }
}

export async function setProfilePublic(userId: string, isPublic: boolean): Promise<ProfileSettings> {
  const next: ProfileSettings = { public: isPublic }
  await putJson(settingsKey(userId), next)
  return next
}

export type ProfileRace = {
  trialId: string
  trialName: string
  courseId: string
  courseName: string
  distanceMetres: number
  raceDate: string
  totalElapsedSeconds: number
  boatClass: BoatClass
}

export type ProfileStats = {
  // Display name, taken from the user's most recent visible entry (entries
  // denormalise it). Null when the viewer can see no races.
  displayName: string | null
  totals: {
    races: number
    distanceMetres: number
    courses: number
    since: string | null // earliest raceDate of a visible race
  }
  // The single fastest race by speed (distance / time). Pace, km/h and m/s are
  // all monotonic in that ratio, so one race is "best" for all three.
  bestRace: ProfileRace | null
  personalBests: Array<{
    courseId: string
    courseName: string
    distanceMetres: number
    bestSeconds: number
    raceCount: number
  }>
  races: ProfileRace[] // full history, newest first
  boatClasses: Array<{ boatClass: BoatClass; count: number }>
}

type StoredEntry = {
  userId: string
  displayName: string
  submittedAt: string
  raceDate: string
  boatClass: BoatClass
  result: { totalElapsedSeconds: number }
}

// Aggregate the profile for `userId` as seen by `viewer`. Only entries on trials
// the viewer can see are counted. Caller resolves viewerClubIds once at the
// request boundary (as elsewhere in the codebase).
export async function buildProfileStats(
  userId: string,
  viewer: AuthUser | null,
  viewerClubIds: Set<string>,
): Promise<ProfileStats> {
  // The entry path embeds the userId, so we target the listing directly.
  const entryKeys = (await listKeys('trials/'))
    .filter(k => k.endsWith('result.json') && k.includes(`/entries/${userId}/`))

  const trialCache = new Map<string, TrialMetadata | null>()
  const courseCache = new Map<string, CourseMetadata | null>()
  const getTrial = async (id: string) => {
    if (!trialCache.has(id)) trialCache.set(id, await getJson<TrialMetadata>(`trials/${id}/metadata.json`))
    return trialCache.get(id)!
  }
  const getCourse = async (id: string) => {
    if (!courseCache.has(id)) courseCache.set(id, await getJson<CourseMetadata>(`courses/${id}/metadata.json`))
    return courseCache.get(id)!
  }

  const races: ProfileRace[] = []
  let latestEntryAt = ''
  let displayName: string | null = null

  for (const key of entryKeys) {
    const entry = await getJson<StoredEntry>(key)
    if (!entry) continue
    // trialId is the path segment after "trials/".
    const trialId = key.split('/')[1]
    const trial = await getTrial(trialId)
    if (!trial) continue
    // The whole point of the privacy guarantee: skip trials the viewer can't see.
    if (!canViewTrial(trial, viewer, viewerClubIds)) continue
    const course = await getCourse(trial.courseId)
    if (!course) continue

    // Display name from the most recently submitted visible entry.
    if (entry.submittedAt > latestEntryAt) {
      latestEntryAt = entry.submittedAt
      displayName = entry.displayName
    }

    races.push({
      trialId,
      trialName: trial.name,
      courseId: course.id,
      courseName: course.name,
      distanceMetres: course.distanceMetres,
      raceDate: entry.raceDate,
      totalElapsedSeconds: entry.result.totalElapsedSeconds,
      boatClass: entry.boatClass,
    })
  }

  races.sort((a, b) => b.raceDate.localeCompare(a.raceDate))

  // Personal best per course (lowest time), with a race count.
  const pbByCourse = new Map<string, { courseName: string; distanceMetres: number; bestSeconds: number; raceCount: number }>()
  for (const r of races) {
    const cur = pbByCourse.get(r.courseId)
    if (!cur) {
      pbByCourse.set(r.courseId, { courseName: r.courseName, distanceMetres: r.distanceMetres, bestSeconds: r.totalElapsedSeconds, raceCount: 1 })
    } else {
      cur.raceCount++
      if (r.totalElapsedSeconds < cur.bestSeconds) cur.bestSeconds = r.totalElapsedSeconds
    }
  }
  const personalBests = [...pbByCourse.entries()]
    .map(([courseId, v]) => ({ courseId, ...v }))
    .sort((a, b) => a.courseName.localeCompare(b.courseName))

  // Best race by speed (distance / time); guards against zero distance/time.
  let bestRace: ProfileRace | null = null
  let bestSpeed = -1
  for (const r of races) {
    if (r.distanceMetres <= 0 || r.totalElapsedSeconds <= 0) continue
    const speed = r.distanceMetres / r.totalElapsedSeconds
    if (speed > bestSpeed) { bestSpeed = speed; bestRace = r }
  }

  const boatCounts = new Map<BoatClass, number>()
  for (const r of races) boatCounts.set(r.boatClass, (boatCounts.get(r.boatClass) ?? 0) + 1)
  const boatClasses = [...boatCounts.entries()]
    .map(([boatClass, count]) => ({ boatClass, count }))
    .sort((a, b) => b.count - a.count)

  const since = races.length ? races.reduce((min, r) => (r.raceDate < min ? r.raceDate : min), races[0].raceDate) : null

  return {
    displayName,
    totals: {
      races: races.length,
      distanceMetres: personalBests.reduce((sum, pb) => sum + pb.distanceMetres * pb.raceCount, 0),
      courses: pbByCourse.size,
      since,
    },
    bestRace,
    personalBests,
    races,
    boatClasses,
  }
}
