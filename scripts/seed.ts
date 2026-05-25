#!/usr/bin/env node
// Populate .local-data/ with realistic demo data.
// Run: pnpm seed   (or: npx tsx scripts/seed.ts)
// Wipes existing seed data before writing.

import fs from 'fs/promises'
import path from 'path'
import { createHmac } from 'crypto'
import { nanoid } from 'nanoid'
import { parseGpx } from '../src/lib/gpx'
import { processTrace, haversine } from '../src/lib/geo'
import type { CourseMetadata, TrialMetadata, LeaderboardEntry } from '../src/lib/types'

const ROOT = path.join(process.cwd(), '.local-data')

async function write(key: string, value: unknown) {
  const filePath = path.join(ROOT, key)
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, JSON.stringify(value, null, 2))
}

async function writeRaw(key: string, content: string) {
  const filePath = path.join(ROOT, key)
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, content, 'utf8')
}

function hashPassword(password: string): string {
  return createHmac('sha256', 'tt-local-auth').update(password).digest('hex')
}

// --- GPX track generation ---

function rnd(scale: number): number {
  return (Math.random() - 0.5) * 2 * scale
}

function gpxPoint(lat: number, lng: number, time: Date, hr?: number, cad?: number): string {
  const ext =
    hr !== undefined || cad !== undefined
      ? `<extensions><gpxtpx:TrackPointExtension>${hr !== undefined ? `<gpxtpx:hr>${hr}</gpxtpx:hr>` : ''}${cad !== undefined ? `<gpxtpx:cad>${cad}</gpxtpx:cad>` : ''}</gpxtpx:TrackPointExtension></extensions>`
      : ''
  return `<trkpt lat="${lat.toFixed(7)}" lon="${lng.toFixed(7)}"><time>${time.toISOString()}</time>${ext}</trkpt>`
}

interface TrackParams {
  startLine: [[number, number], [number, number]]
  finishLine: [[number, number], [number, number]]
  elapsedSeconds: number
  raceStart: Date
  baseHr?: number   // base HR at race start, rises ~20 bpm over the race
  baseCad?: number  // base cadence spm
}

function buildGpx(p: TrackParams): string {
  const smLat = (p.startLine[0][0] + p.startLine[1][0]) / 2
  const smLng = (p.startLine[0][1] + p.startLine[1][1]) / 2
  const fmLat = (p.finishLine[0][0] + p.finishLine[1][0]) / 2
  const fmLng = (p.finishLine[0][1] + p.finishLine[1][1]) / 2

  const latRate = (smLat - fmLat) / p.elapsedSeconds
  const lngRate = (smLng - fmLng) / p.elapsedSeconds
  const NOISE = 0.000009 // ~1 m

  const pts: string[] = []

  // 25 warm-up points upstream of start
  for (let i = 25; i >= 1; i--) {
    const lat = smLat + i * latRate + rnd(NOISE)
    const lng = smLng + i * lngRate + rnd(NOISE)
    pts.push(gpxPoint(lat, lng, new Date(p.raceStart.getTime() - i * 1000)))
  }

  // Race points (t = 0 … elapsedSeconds)
  for (let i = 0; i <= p.elapsedSeconds; i++) {
    const lat = smLat - i * latRate + rnd(NOISE)
    const lng = smLng - i * lngRate + rnd(NOISE)
    const t = new Date(p.raceStart.getTime() + i * 1000)
    const frac = i / p.elapsedSeconds
    const hr =
      p.baseHr !== undefined ? Math.round(p.baseHr + frac * 20 + rnd(4)) : undefined
    const cad =
      p.baseCad !== undefined ? Math.round(p.baseCad + rnd(2)) : undefined
    pts.push(gpxPoint(lat, lng, t, hr, cad))
  }

  // 15 cool-down points downstream of finish
  for (let i = 1; i <= 15; i++) {
    const lat = fmLat - i * latRate + rnd(NOISE)
    const lng = fmLng - i * lngRate + rnd(NOISE)
    pts.push(gpxPoint(lat, lng, new Date(p.raceStart.getTime() + (p.elapsedSeconds + i) * 1000)))
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="rrc-tt-seed" xmlns="http://www.topografix.com/GPX/1/1" xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1">
  <trk><trkseg>
${pts.map(p => '    ' + p).join('\n')}
  </trkseg></trk>
</gpx>`
}

// --- Data definitions ---

const PASSWORD = 'Password123'

const USERS = [
  { email: 'admin@rrc-tt.is',     displayName: 'Admin User',               isAdmin: true  },
  { email: 'sigridur@example.is', displayName: 'Sigríður Björnsdóttir',    isAdmin: false },
  { email: 'gunnar@example.is',   displayName: 'Gunnar Sigurðsson',        isAdmin: false },
  { email: 'helga@example.is',    displayName: 'Helga Kristjánsdóttir',    isAdmin: false },
  { email: 'arni@example.is',     displayName: 'Árni Magnússon',           isAdmin: false },
  { email: 'eva@example.is',      displayName: 'Eva Þórðardóttir',         isAdmin: false },
  { email: 'bjarni@example.is',   displayName: 'Bjarni Jónsson',           isAdmin: false },
  { email: 'ragnhild@example.is', displayName: 'Ragnhild Andersen',        isAdmin: false },
]

// Elliðaár 1000 m — river flows south, start line at top
const C1_START: [[number, number], [number, number]] = [[64.0850, -21.8350], [64.0850, -21.8310]]
const C1_FINISH: [[number, number], [number, number]] = [[64.0760, -21.8350], [64.0760, -21.8310]]

// Reykjavik Harbour 500 m — course runs west
const C2_START: [[number, number], [number, number]] = [[64.1525, -22.0100], [64.1515, -22.0100]]
const C2_FINISH: [[number, number], [number, number]] = [[64.1525, -22.0203], [64.1515, -22.0203]]

function midpoint(line: [[number, number], [number, number]]): [number, number] {
  return [(line[0][0] + line[1][0]) / 2, (line[0][1] + line[1][1]) / 2]
}

async function main() {
  console.log('🌱  Seeding .local-data/ …\n')

  // 1. Users
  const userMap: Record<string, { id: string; email: string; displayName: string }> = {}
  for (const u of USERS) {
    const id = nanoid()
    const stored = {
      id,
      email: u.email,
      displayName: u.displayName,
      passwordHash: hashPassword(PASSWORD),
      createdAt: new Date().toISOString(),
    }
    await write(`users/${id}.json`, stored)
    userMap[u.email] = { id, email: u.email, displayName: u.displayName }
    console.log(`  user  ${u.displayName} <${u.email}>`)
  }

  const admin = userMap['admin@rrc-tt.is']

  // 2. Courses
  const c1Id = nanoid()
  const c1: CourseMetadata = {
    id: c1Id,
    name: 'Elliðaár 1000m Sprint',
    sport: 'both',
    type: 'one_way',
    startLine: C1_START,
    finishLine: C1_FINISH,
    distanceMetres: Math.round(haversine(midpoint(C1_START), midpoint(C1_FINISH))),
    adminUserId: admin.id,
    createdAt: '2025-03-01T09:00:00.000Z',
  }
  await write(`courses/${c1Id}/metadata.json`, c1)
  console.log(`\n  course ${c1.name}  (${c1.distanceMetres} m)`)

  const c2Id = nanoid()
  const c2: CourseMetadata = {
    id: c2Id,
    name: 'Reykjavik Harbour 500m',
    sport: 'kayak',
    type: 'one_way',
    startLine: C2_START,
    finishLine: C2_FINISH,
    distanceMetres: Math.round(haversine(midpoint(C2_START), midpoint(C2_FINISH))),
    adminUserId: admin.id,
    createdAt: '2025-03-15T09:00:00.000Z',
  }
  await write(`courses/${c2Id}/metadata.json`, c2)
  console.log(`  course ${c2.name}  (${c2.distanceMetres} m)`)

  // 3. Trials
  const t1Id = nanoid()
  const trial1: TrialMetadata = {
    id: t1Id, courseId: c1Id,
    name: 'Spring Sprint 2025',
    date: '2025-04-12', status: 'closed',
    adminUserId: admin.id,
    createdAt: '2025-04-01T08:00:00.000Z',
  }
  await write(`trials/${t1Id}/metadata.json`, trial1)

  const t2Id = nanoid()
  const trial2: TrialMetadata = {
    id: t2Id, courseId: c1Id,
    name: 'Summer Championships 2025',
    date: '2025-07-19', status: 'closed',
    adminUserId: admin.id,
    createdAt: '2025-07-01T08:00:00.000Z',
  }
  await write(`trials/${t2Id}/metadata.json`, trial2)

  const t3Id = nanoid()
  const trial3: TrialMetadata = {
    id: t3Id, courseId: c2Id,
    name: 'Harbour Race 2025',
    date: '2025-06-07', status: 'open',
    adminUserId: admin.id,
    createdAt: '2025-05-20T08:00:00.000Z',
  }
  await write(`trials/${t3Id}/metadata.json`, trial3)

  console.log('\n  trials: Spring Sprint (closed), Summer Champs (closed), Harbour Race (open)')

  // 4. Entries

  type EntrySpec = {
    userEmail: string
    elapsedSeconds: number
    raceStart: Date
    baseHr: number
    baseCad: number
  }

  async function addEntry(
    trialId: string,
    startLine: [[number, number], [number, number]],
    finishLine: [[number, number], [number, number]],
    spec: EntrySpec
  ): Promise<LeaderboardEntry | null> {
    const user = userMap[spec.userEmail]
    const gpx = buildGpx({
      startLine, finishLine,
      elapsedSeconds: spec.elapsedSeconds,
      raceStart: spec.raceStart,
      baseHr: spec.baseHr,
      baseCad: spec.baseCad,
    })

    const track = parseGpx(gpx)
    const result = processTrace(track, startLine, finishLine)
    if (!result) {
      console.error(`  ❌  processTrace returned null for ${user.displayName}`)
      return null
    }

    const entryId = nanoid()
    const basePath = `trials/${trialId}/entries/${user.id}/${entryId}`
    await writeRaw(`${basePath}/trace.gpx`, gpx)

    const stored = {
      entryId, userId: user.id, displayName: user.displayName,
      submittedAt: new Date(spec.raceStart.getTime() + spec.elapsedSeconds * 1000 + 60_000).toISOString(),
      filename: 'trace.gpx',
      result,
    }
    await write(`${basePath}/result.json`, stored)

    return {
      entryId, userId: user.id, displayName: user.displayName,
      submittedAt: stored.submittedAt,
      totalElapsedSeconds: result.totalElapsedSeconds,
      splits: result.splits,
      avgHeartRate: result.avgHeartRate,
      avgCadence: result.avgCadence,
    }
  }

  async function buildLeaderboard(trialId: string, entries: LeaderboardEntry[]) {
    const sorted = [...entries].sort((a, b) => a.totalElapsedSeconds - b.totalElapsedSeconds)
    await write(`trials/${trialId}/leaderboard.json`, sorted)
  }

  // Trial 1 — Elliðaár Spring Sprint
  console.log('\n  entries: Spring Sprint 2025')
  const t1Base = new Date('2025-04-12T10:00:00.000Z')
  const t1Entries: LeaderboardEntry[] = []
  for (const [email, secs, hr, cad] of [
    ['sigridur@example.is', 285, 158, 30],
    ['gunnar@example.is',   291, 162, 28],
    ['helga@example.is',    298, 165, 27],
    ['arni@example.is',     307, 170, 26],
    ['eva@example.is',      315, 168, 27],
    ['bjarni@example.is',   324, 172, 25],
  ] as [string, number, number, number][]) {
    const e = await addEntry(t1Id, C1_START, C1_FINISH, {
      userEmail: email, elapsedSeconds: secs,
      raceStart: new Date(t1Base.getTime() + t1Entries.length * 5 * 60_000),
      baseHr: hr, baseCad: cad,
    })
    if (e) {
      t1Entries.push(e)
      console.log(`    ${userMap[email].displayName.padEnd(28)} ${(e.totalElapsedSeconds / 60).toFixed(2)} min`)
    }
  }
  await buildLeaderboard(t1Id, t1Entries)

  // Trial 2 — Elliðaár Summer Championships
  console.log('\n  entries: Summer Championships 2025')
  const t2Base = new Date('2025-07-19T09:30:00.000Z')
  const t2Entries: LeaderboardEntry[] = []
  for (const [email, secs, hr, cad] of [
    ['gunnar@example.is',   287, 160, 29],
    ['sigridur@example.is', 293, 156, 31],
    ['ragnhild@example.is', 301, 163, 28],
    ['helga@example.is',    311, 167, 27],
  ] as [string, number, number, number][]) {
    const e = await addEntry(t2Id, C1_START, C1_FINISH, {
      userEmail: email, elapsedSeconds: secs,
      raceStart: new Date(t2Base.getTime() + t2Entries.length * 5 * 60_000),
      baseHr: hr, baseCad: cad,
    })
    if (e) {
      t2Entries.push(e)
      console.log(`    ${userMap[email].displayName.padEnd(28)} ${(e.totalElapsedSeconds / 60).toFixed(2)} min`)
    }
  }
  await buildLeaderboard(t2Id, t2Entries)

  // Trial 3 — Harbour Race (open, kayak)
  console.log('\n  entries: Harbour Race 2025')
  const t3Base = new Date('2025-06-07T11:00:00.000Z')
  const t3Entries: LeaderboardEntry[] = []
  for (const [email, secs, hr, cad] of [
    ['sigridur@example.is', 142, 160, 62],
    ['eva@example.is',      148, 164, 60],
    ['gunnar@example.is',   155, 168, 58],
  ] as [string, number, number, number][]) {
    const e = await addEntry(t3Id, C2_START, C2_FINISH, {
      userEmail: email, elapsedSeconds: secs,
      raceStart: new Date(t3Base.getTime() + t3Entries.length * 4 * 60_000),
      baseHr: hr, baseCad: cad,
    })
    if (e) {
      t3Entries.push(e)
      console.log(`    ${userMap[email].displayName.padEnd(28)} ${(e.totalElapsedSeconds / 60).toFixed(2)} min`)
    }
  }
  await buildLeaderboard(t3Id, t3Entries)

  console.log(`
✅  Done. All users have password: ${PASSWORD}
    Log in at http://localhost:3000/auth
    Admin account: admin@rrc-tt.is
`)
}

main().catch(err => { console.error(err); process.exit(1) })
