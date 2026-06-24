// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { makeDataDir, cleanDataDir, makeUser, makeCourse, makeTrial } from './helpers'
import { putJson } from '@/lib/storage'
import type { AuthUser, BoatClass } from '@/lib/types'

vi.mock('next/headers', () => ({ cookies: vi.fn() }))

import { getProfileSettings, setProfilePublic, buildProfileStats } from '@/lib/profile'

let dataDir: string
beforeEach(async () => { dataDir = await makeDataDir() })
afterEach(async () => { await cleanDataDir(dataDir) })

// Plant a result.json for `userId` on `trialId`, returning nothing. Mirrors the
// stored entry shape buildProfileStats reads.
async function plantResult(trialId: string, userId: string, opts: {
  displayName?: string
  raceDate: string
  boatClass?: BoatClass
  seconds: number
  submittedAt?: string
}) {
  const entryId = `${Math.random().toString(36).slice(2)}`
  await putJson(`trials/${trialId}/entries/${userId}/${entryId}/result.json`, {
    entryId, userId,
    displayName: opts.displayName ?? 'Pat Paddler',
    submittedAt: opts.submittedAt ?? new Date().toISOString(),
    filename: 'r.gpx',
    raceDate: opts.raceDate,
    traceRecordedDate: opts.raceDate,
    boatClass: opts.boatClass ?? 'K1',
    crew: [{ seat: 1, name: 'Pat' }],
    result: { startTimestamp: '', finishTimestamp: '', totalElapsedSeconds: opts.seconds, splits: [] },
  })
}

const asViewer = (u: { id: string; email: string; displayName: string }): AuthUser =>
  ({ id: u.id, email: u.email, displayName: u.displayName })

describe('profile settings', () => {
  it('defaults to private (opt-in)', async () => {
    const u = await makeUser()
    expect((await getProfileSettings(u.id)).public).toBe(false)
  })

  it('round-trips a public flag', async () => {
    const u = await makeUser()
    await setProfilePublic(u.id, true)
    expect((await getProfileSettings(u.id)).public).toBe(true)
    await setProfilePublic(u.id, false)
    expect((await getProfileSettings(u.id)).public).toBe(false)
  })
})

describe('buildProfileStats', () => {
  it('aggregates totals, PBs, best pace and boat classes across visible races', async () => {
    const owner = await makeUser('Owner')
    const courseA = await makeCourse(owner.id) // distanceMetres 556
    const trialA1 = await makeTrial(courseA.id, owner.id)
    const trialA2 = await makeTrial(courseA.id, owner.id)

    await plantResult(trialA1.id, owner.id, { displayName: 'Owner', raceDate: '2026-06-01', seconds: 120, boatClass: 'K1', submittedAt: '2026-06-01T10:00:00Z' })
    await plantResult(trialA2.id, owner.id, { displayName: 'Owner', raceDate: '2026-06-10', seconds: 100, boatClass: 'K2', submittedAt: '2026-06-10T10:00:00Z' }) // faster → PB

    const stats = await buildProfileStats(owner.id, asViewer(owner), new Set())
    expect(stats.displayName).toBe('Owner')
    expect(stats.totals.races).toBe(2)
    expect(stats.totals.courses).toBe(1)
    expect(stats.totals.since).toBe('2026-06-01')
    // PB is the faster of the two on course A.
    expect(stats.personalBests).toHaveLength(1)
    expect(stats.personalBests[0].bestSeconds).toBe(100)
    expect(stats.personalBests[0].raceCount).toBe(2)
    // Best race (highest speed) is the 100s one.
    expect(stats.bestRace?.totalElapsedSeconds).toBe(100)
    // Boat classes counted.
    expect(stats.boatClasses).toEqual(expect.arrayContaining([
      { boatClass: 'K1', count: 1 },
      { boatClass: 'K2', count: 1 },
    ]))
    // History newest first.
    expect(stats.races[0].raceDate).toBe('2026-06-10')
  })

  it('hides results from a private trial when the viewer cannot see it', async () => {
    const owner = await makeUser('Owner')
    const stranger = await makeUser('Stranger')
    const course = await makeCourse(owner.id)
    const publicTrial = await makeTrial(course.id, owner.id, 'open', { visibility: 'public' })
    const privateTrial = await makeTrial(course.id, owner.id, 'open', { visibility: 'private' })

    await plantResult(publicTrial.id, owner.id, { raceDate: '2026-06-01', seconds: 110 })
    await plantResult(privateTrial.id, owner.id, { raceDate: '2026-06-02', seconds: 90 }) // faster, but private

    // A stranger sees only the public race.
    const asStranger = await buildProfileStats(owner.id, asViewer(stranger), new Set())
    expect(asStranger.totals.races).toBe(1)
    expect(asStranger.bestRace?.totalElapsedSeconds).toBe(110)

    // The owner sees both, including the faster private one.
    const asOwner = await buildProfileStats(owner.id, asViewer(owner), new Set())
    expect(asOwner.totals.races).toBe(2)
    expect(asOwner.bestRace?.totalElapsedSeconds).toBe(90)
  })

  it('returns an empty profile for a user with no races', async () => {
    const u = await makeUser()
    const stats = await buildProfileStats(u.id, null, new Set())
    expect(stats.totals.races).toBe(0)
    expect(stats.displayName).toBeNull()
    expect(stats.bestRace).toBeNull()
    expect(stats.races).toEqual([])
  })
})
