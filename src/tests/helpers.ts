import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { nanoid } from 'nanoid'
import { createUser } from '@/lib/users'
import { createSession } from '@/lib/sessions'
import { putJson } from '@/lib/storage'
import type { CourseMetadata, TrialMetadata } from '@/lib/types'

export async function makeDataDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'att-test-'))
  process.env.DATA_DIR = dir
  process.env.USE_LOCAL_STORAGE = 'true'
  return dir
}

export async function cleanDataDir(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true })
  delete process.env.DATA_DIR
}

export async function makeUser(email = 'test@example.com') {
  const result = await createUser(email, 'Test User', 'Password123')
  if ('error' in result) throw new Error(result.error)
  return result
}

export async function makeSession(userId: string): Promise<string> {
  return createSession(userId)
}

export async function makeCourse(adminUserId: string): Promise<CourseMetadata> {
  const course: CourseMetadata = {
    id: nanoid(),
    name: 'Test Course',
    sport: 'both',
    type: 'one_way',
    adminUserId,
    // Track goes north along lng -0.9; start crosses at lat 51.525, finish at 51.575
    startLine: [[51.525, -0.91], [51.525, -0.89]],
    finishLine: [[51.575, -0.91], [51.575, -0.89]],
    distanceMetres: 556,
    createdAt: new Date().toISOString(),
  }
  await putJson(`courses/${course.id}/metadata.json`, course)
  return course
}

export async function makeTrial(
  courseId: string,
  adminUserId: string,
  status: 'open' | 'closed' = 'open',
): Promise<TrialMetadata> {
  const trial: TrialMetadata = {
    id: nanoid(),
    courseId,
    name: 'Test Trial',
    date: '2024-06-01',
    status,
    adminUserId,
    createdAt: new Date().toISOString(),
  }
  await putJson(`trials/${trial.id}/metadata.json`, trial)
  return trial
}

// Builds a GPX buffer from an array of [lat, lng, isoTime] tuples
export function makeGpxBuffer(points: Array<[number, number, string]>): ArrayBuffer {
  const trkpts = points
    .map(([lat, lng, time]) => `<trkpt lat="${lat}" lon="${lng}"><time>${time}</time></trkpt>`)
    .join('\n')
  const gpx = `<?xml version="1.0"?><gpx version="1.1"><trk><trkseg>${trkpts}</trkseg></trk></gpx>`
  return new TextEncoder().encode(gpx).buffer as ArrayBuffer
}

// 11 points going north from lat 51.50 → 51.60 along lng -0.9, 1 min apart.
// Crosses startLine (~51.525) between points 2→3, finishLine (~51.575) between 7→8.
export function makeTestTrack(): Array<[number, number, string]> {
  return Array.from({ length: 11 }, (_, i) => [
    parseFloat((51.50 + i * 0.01).toFixed(4)),
    -0.9,
    new Date(Date.UTC(2024, 5, 1, 10, i, 0)).toISOString(),
  ] as [number, number, string])
}
