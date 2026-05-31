// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { makeDataDir, cleanDataDir, makeUser } from './helpers'

vi.mock('next/headers', () => ({ cookies: vi.fn() }))

import { GET as listCourses, POST as createCourse } from '@/app/att/api/courses/route'
import { GET as getCourse, PATCH as patchCourse } from '@/app/att/api/courses/[courseId]/route'
import { POST as createTrial } from '@/app/att/api/trials/route'
import { cookies } from 'next/headers'

let dataDir: string

beforeEach(async () => { dataDir = await makeDataDir() })
afterEach(async () => { await cleanDataDir(dataDir) })

function mockAuth(idToken: string | null) {
  vi.mocked(cookies).mockResolvedValue({
    get: (name: string) => name === 'tt_id' && idToken ? { name, value: idToken } : undefined,
  } as ReturnType<typeof cookies> extends Promise<infer T> ? T : never)
}

function jsonReq(url: string, method: string, body: unknown) {
  return new NextRequest(url, {
    method,
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

async function buildCourse(ownerIdToken: string, name = 'Test Course') {
  mockAuth(ownerIdToken)
  const res = await createCourse(jsonReq('http://x/att/api/courses', 'POST', {
    name,
    sport: 'kayak',
    type: 'point_to_point',
    startLine: [[51.5, -0.9], [51.5, -0.89]],
    finishLine: [[51.55, -0.9], [51.55, -0.89]],
    distanceMetres: 5000,
  }))
  return await res.json()
}

describe('Courses are a public catalogue', () => {
  it('GET /courses lists all courses without auth', async () => {
    const owner = await makeUser('Owner')
    await buildCourse(owner.idToken, 'A')
    await buildCourse(owner.idToken, 'B')

    mockAuth(null)
    const res = await listCourses()
    expect(res.status).toBe(200)
    const list = await res.json()
    expect(list).toHaveLength(2)
    expect(list.map((c: { name: string }) => c.name).sort()).toEqual(['A', 'B'])
  })

  it('GET /courses/[id] is readable without auth', async () => {
    const owner = await makeUser('Owner')
    const course = await buildCourse(owner.idToken)

    mockAuth(null)
    const res = await getCourse(new NextRequest('http://x'), { params: Promise.resolve({ courseId: course.id }) })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.name).toBe('Test Course')
  })

  it('any signed-in user can open a trial on someone else\'s course', async () => {
    const owner = await makeUser('Owner')
    const stranger = await makeUser('Stranger')
    const course = await buildCourse(owner.idToken)

    mockAuth(stranger.idToken)
    const res = await createTrial(jsonReq('http://x/att/api/trials', 'POST', {
      courseId: course.id,
      name: 'Stranger\'s Trial',
      date: '2026-05-01',
    }))
    expect(res.status).toBe(201)
    const trial = await res.json()
    expect(trial.adminUserId).toBe(stranger.id)
    expect(trial.courseId).toBe(course.id)
  })
})

describe('Course edits are owner-only', () => {
  it('owner can PATCH their course', async () => {
    const owner = await makeUser('Owner')
    const course = await buildCourse(owner.idToken)

    mockAuth(owner.idToken)
    const res = await patchCourse(jsonReq(`http://x/att/api/courses/${course.id}`, 'PATCH', { name: 'Renamed' }),
      { params: Promise.resolve({ courseId: course.id }) })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.name).toBe('Renamed')
  })

  it('non-owner cannot PATCH a course', async () => {
    const owner = await makeUser('Owner')
    const stranger = await makeUser('Stranger')
    const course = await buildCourse(owner.idToken)

    mockAuth(stranger.idToken)
    const res = await patchCourse(jsonReq(`http://x/att/api/courses/${course.id}`, 'PATCH', { name: 'Hijacked' }),
      { params: Promise.resolve({ courseId: course.id }) })
    expect(res.status).toBe(403)
  })

  it('unauthenticated PATCH is rejected', async () => {
    const owner = await makeUser('Owner')
    const course = await buildCourse(owner.idToken)

    mockAuth(null)
    const res = await patchCourse(jsonReq(`http://x/att/api/courses/${course.id}`, 'PATCH', { name: 'Anon' }),
      { params: Promise.resolve({ courseId: course.id }) })
    expect(res.status).toBe(401)
  })
})
