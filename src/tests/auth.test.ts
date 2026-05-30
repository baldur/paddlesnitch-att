// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { makeDataDir, cleanDataDir } from './helpers'

// Must be mocked before any import that pulls in next/headers
vi.mock('next/headers', () => ({ cookies: vi.fn() }))

import { POST as signup } from '@/app/att/api/auth/signup/route'
import { POST as login } from '@/app/att/api/auth/login/route'
import { POST as logout } from '@/app/att/api/auth/logout/route'
import { GET as me } from '@/app/att/api/auth/me/route'
import { cookies } from 'next/headers'

let dataDir: string

beforeEach(async () => { dataDir = await makeDataDir() })
afterEach(async () => { await cleanDataDir(dataDir) })

function jsonReq(url: string, body: unknown) {
  return new NextRequest(url, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

function mockCookie(token: string | null) {
  vi.mocked(cookies).mockResolvedValue({
    get: (name: string) => token && name === 'tt_session' ? { name, value: token } : undefined,
  } as ReturnType<typeof cookies> extends Promise<infer T> ? T : never)
}

describe('POST /att/api/auth/signup', () => {
  it('creates a user and returns a session cookie', async () => {
    const res = await signup(jsonReq('http://x/att/api/auth/signup', {
      email: 'alice@example.com',
      displayName: 'Alice',
      password: 'Password123',
    }))
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.email).toBe('alice@example.com')
    expect(body.displayName).toBe('Alice')
    expect(res.headers.get('set-cookie')).toContain('tt_session=')
  })

  it('rejects missing fields', async () => {
    const res = await signup(jsonReq('http://x/att/api/auth/signup', { email: 'a@b.com' }))
    expect(res.status).toBe(400)
  })

  it('rejects password shorter than 8 characters', async () => {
    const res = await signup(jsonReq('http://x/att/api/auth/signup', {
      email: 'a@b.com', displayName: 'A', password: 'short',
    }))
    expect(res.status).toBe(400)
  })

  it('rejects duplicate email with 409', async () => {
    const body = { email: 'dupe@example.com', displayName: 'D', password: 'Password123' }
    await signup(jsonReq('http://x/att/api/auth/signup', body))
    const res = await signup(jsonReq('http://x/att/api/auth/signup', body))
    expect(res.status).toBe(409)
  })
})

describe('POST /att/api/auth/login', () => {
  beforeEach(async () => {
    await signup(jsonReq('http://x/att/api/auth/signup', {
      email: 'bob@example.com', displayName: 'Bob', password: 'Password123',
    }))
  })

  it('returns session cookie on valid credentials', async () => {
    const res = await login(jsonReq('http://x/att/api/auth/login', {
      email: 'bob@example.com', password: 'Password123',
    }))
    expect(res.status).toBe(200)
    expect(res.headers.get('set-cookie')).toContain('tt_session=')
  })

  it('rejects wrong password with 401', async () => {
    const res = await login(jsonReq('http://x/att/api/auth/login', {
      email: 'bob@example.com', password: 'WrongPassword',
    }))
    expect(res.status).toBe(401)
  })

  it('rejects unknown email with 401', async () => {
    const res = await login(jsonReq('http://x/att/api/auth/login', {
      email: 'nobody@example.com', password: 'Password123',
    }))
    expect(res.status).toBe(401)
  })
})

describe('GET /att/api/auth/me', () => {
  it('returns user when session is valid', async () => {
    const signupRes = await signup(jsonReq('http://x/att/api/auth/signup', {
      email: 'carol@example.com', displayName: 'Carol', password: 'Password123',
    }))
    const cookie = signupRes.headers.get('set-cookie') ?? ''
    const token = cookie.match(/tt_session=([^;]+)/)?.[1] ?? ''

    mockCookie(token)
    const res = await me(new NextRequest('http://x/att/api/auth/me'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.email).toBe('carol@example.com')
  })

  it('returns 401 with no session', async () => {
    mockCookie(null)
    const res = await me(new NextRequest('http://x/att/api/auth/me'))
    expect(res.status).toBe(401)
  })
})

describe('POST /att/api/auth/logout', () => {
  it('clears the session cookie', async () => {
    const signupRes = await signup(jsonReq('http://x/att/api/auth/signup', {
      email: 'dan@example.com', displayName: 'Dan', password: 'Password123',
    }))
    const cookie = signupRes.headers.get('set-cookie') ?? ''
    const token = cookie.match(/tt_session=([^;]+)/)?.[1] ?? ''

    mockCookie(token)
    const res = await logout(new NextRequest('http://x/att/api/auth/logout', { method: 'POST' }))
    expect(res.status).toBe(200)
    // Cookie should be cleared (max-age=0 or expires in the past)
    expect(res.headers.get('set-cookie')).toMatch(/tt_session=;|tt_session=.*Max-Age=0/i)
  })
})
