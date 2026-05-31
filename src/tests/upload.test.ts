// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import {
  makeDataDir, cleanDataDir, makeUser, makeCourse, makeTrial,
  makeGpxBuffer, makeTestTrack,
} from './helpers'

vi.mock('next/headers', () => ({ cookies: vi.fn() }))

import { POST as upload } from '@/app/att/api/trials/[trialId]/upload/route'
import { GET as leaderboard } from '@/app/att/api/trials/[trialId]/leaderboard/route'
import { cookies } from 'next/headers'

let dataDir: string

beforeEach(async () => { dataDir = await makeDataDir() })
afterEach(async () => { await cleanDataDir(dataDir) })

function mockAuth(idToken: string | null) {
  vi.mocked(cookies).mockResolvedValue({
    get: (name: string) => name === 'tt_id' && idToken ? { name, value: idToken } : undefined,
  } as ReturnType<typeof cookies> extends Promise<infer T> ? T : never)
}

function uploadReq(trialId: string, file: File) {
  const form = new FormData()
  form.append('file', file)
  return new NextRequest(`http://x/att/api/trials/${trialId}/upload`, {
    method: 'POST',
    body: form,
  })
}

describe('POST /att/api/trials/[trialId]/upload', () => {
  it('processes a GPX file and returns a result with elapsed time', async () => {
    const user = await makeUser()
    const course = await makeCourse(user.id)
    const trial = await makeTrial(course.id, user.id, 'open')
    mockAuth(user.idToken)

    const gpx = makeGpxBuffer(makeTestTrack())
    const file = new File([gpx], 'activity.gpx', { type: 'application/gpx+xml' })
    const res = await upload(uploadReq(trial.id, file), { params: Promise.resolve({ trialId: trial.id }) })

    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.result.totalElapsedSeconds).toBeGreaterThan(0)
    expect(body.entryId).toBeTruthy()
  })

  it('result appears on the leaderboard after upload', async () => {
    const user = await makeUser('Test User')
    const course = await makeCourse(user.id)
    const trial = await makeTrial(course.id, user.id, 'open')
    mockAuth(user.idToken)

    const gpx = makeGpxBuffer(makeTestTrack())
    await upload(uploadReq(trial.id, new File([gpx], 'run.gpx')), { params: Promise.resolve({ trialId: trial.id }) })

    const lb = await leaderboard(
      new NextRequest(`http://x/att/api/trials/${trial.id}/leaderboard`),
      { params: Promise.resolve({ trialId: trial.id }) },
    )
    expect(lb.status).toBe(200)
    const entries = await lb.json()
    expect(entries).toHaveLength(1)
    // cognito-local doesn't surface the name attribute in JWT claims,
    // so displayName falls back to the email-local-part in test environments.
    expect(entries[0].displayName).toBe(user.email.split('@')[0])
    expect(entries[0].totalElapsedSeconds).toBeGreaterThan(0)
  })

  it('returns 422 for an unknown file format', async () => {
    const user = await makeUser()
    const course = await makeCourse(user.id)
    const trial = await makeTrial(course.id, user.id, 'open')
    mockAuth(user.idToken)

    const file = new File(['not a gps file'], 'data.txt', { type: 'text/plain' })
    const res = await upload(uploadReq(trial.id, file), { params: Promise.resolve({ trialId: trial.id }) })
    expect(res.status).toBe(422)
  })

  it('returns 422 when track does not cross the course lines', async () => {
    const user = await makeUser()
    const course = await makeCourse(user.id)
    const trial = await makeTrial(course.id, user.id, 'open')
    mockAuth(user.idToken)

    const offCourse = makeGpxBuffer([[1.0, 0.0, '2024-06-01T10:00:00Z'], [1.1, 0.0, '2024-06-01T10:01:00Z']])
    const file = new File([offCourse], 'activity.gpx')
    const res = await upload(uploadReq(trial.id, file), { params: Promise.resolve({ trialId: trial.id }) })
    expect(res.status).toBe(422)
  })

  it('returns 400 when the trial is closed', async () => {
    const user = await makeUser()
    const course = await makeCourse(user.id)
    const trial = await makeTrial(course.id, user.id, 'closed')
    mockAuth(user.idToken)

    const gpx = makeGpxBuffer(makeTestTrack())
    const res = await upload(uploadReq(trial.id, new File([gpx], 'run.gpx')), { params: Promise.resolve({ trialId: trial.id }) })
    expect(res.status).toBe(400)
  })

  it('returns 401 when not authenticated', async () => {
    const user = await makeUser()
    const course = await makeCourse(user.id)
    const trial = await makeTrial(course.id, user.id, 'open')
    mockAuth(null)

    const gpx = makeGpxBuffer(makeTestTrack())
    const res = await upload(uploadReq(trial.id, new File([gpx], 'run.gpx')), { params: Promise.resolve({ trialId: trial.id }) })
    expect(res.status).toBe(401)
  })
})
