import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  authorizeUrl,
  exchangeCode,
  refreshIfExpired,
  listActivities,
  getActivityStreams,
  streamsToTrack,
} from './strava'

const originalFetch = global.fetch
let fetchSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  process.env.STRAVA_CLIENT_ID = '12345'
  process.env.STRAVA_CLIENT_SECRET = 'secret123'
})
afterEach(() => {
  fetchSpy?.mockRestore()
  delete process.env.STRAVA_CLIENT_ID
  delete process.env.STRAVA_CLIENT_SECRET
})

function mockFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  fetchSpy = vi.spyOn(global, 'fetch').mockImplementation((async (input: unknown, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : (input as Request | URL).toString()
    return handler(url, init)
  }) as typeof fetch)
}

describe('authorizeUrl', () => {
  it('returns the authorize URL with required params and state', () => {
    const url = authorizeUrl('csrf-token', 'http://localhost:3000/att/api/strava/callback')!
    expect(url).toContain('https://www.strava.com/oauth/authorize')
    expect(url).toContain('client_id=12345')
    expect(url).toContain('response_type=code')
    expect(url).toContain('state=csrf-token')
    expect(url).toContain('scope=read%2Cactivity%3Aread_all')
    expect(url).toContain('redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Fatt%2Fapi%2Fstrava%2Fcallback')
  })

  it('returns null when the client id is not configured', () => {
    delete process.env.STRAVA_CLIENT_ID
    expect(authorizeUrl('s', 'http://x')).toBeNull()
  })
})

describe('exchangeCode', () => {
  it('posts to /oauth/token and shapes the response into StravaTokens', async () => {
    mockFetch(async (url, init) => {
      expect(url).toBe('https://www.strava.com/oauth/token')
      const body = JSON.parse(init!.body as string)
      expect(body.grant_type).toBe('authorization_code')
      expect(body.code).toBe('THE_CODE')
      expect(body.client_secret).toBe('secret123')
      return new Response(JSON.stringify({
        access_token: 'acc',
        refresh_token: 'ref',
        expires_at: 1_700_000_000,
        athlete: { id: 42, firstname: 'Alice', lastname: 'Adams' },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    })

    const tokens = await exchangeCode('THE_CODE')
    expect(tokens.accessToken).toBe('acc')
    expect(tokens.refreshToken).toBe('ref')
    expect(tokens.expiresAt).toBe(1_700_000_000)
    expect(tokens.athleteId).toBe(42)
    expect(tokens.athleteName).toBe('Alice Adams')
  })

  it('throws when Strava returns a non-2xx', async () => {
    mockFetch(async () => new Response('nope', { status: 400 }))
    await expect(exchangeCode('bad')).rejects.toThrow(/strava_exchange_failed_400/)
  })
})

describe('refreshIfExpired', () => {
  it('returns the same tokens unchanged when expiry is comfortably in the future', async () => {
    fetchSpy = vi.spyOn(global, 'fetch') // not called
    const future = Math.floor(Date.now() / 1000) + 3600
    const tokens = await refreshIfExpired({
      athleteId: 1, athleteName: 'A', accessToken: 'A', refreshToken: 'R', expiresAt: future,
    })
    expect(tokens.accessToken).toBe('A')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('refreshes when the access token is close to expiry', async () => {
    mockFetch(async () => new Response(JSON.stringify({
      access_token: 'fresh', refresh_token: 'newer', expires_at: 9_999_999_999,
    }), { status: 200 }))
    const past = Math.floor(Date.now() / 1000) - 60
    const tokens = await refreshIfExpired({
      athleteId: 1, athleteName: 'A', accessToken: 'old', refreshToken: 'oldRef', expiresAt: past,
    })
    expect(tokens.accessToken).toBe('fresh')
    expect(tokens.refreshToken).toBe('newer')
    expect(tokens.expiresAt).toBe(9_999_999_999)
  })
})

describe('listActivities', () => {
  it('filters out non-water-sport activities and normalises sport_type', async () => {
    mockFetch(async (url) => {
      expect(url).toContain('/athlete/activities')
      return new Response(JSON.stringify([
        { id: 1, name: 'River paddle', sport_type: 'Kayaking', start_date: '2026-01-01T08:00:00Z', distance: 6200, moving_time: 1800 },
        { id: 2, name: 'Commute', sport_type: 'Ride', start_date: '2026-01-02T07:00:00Z', distance: 12000, moving_time: 2400 },
        { id: 3, name: 'Crew row', sport_type: 'Rowing', start_date: '2026-01-03T18:00:00Z', distance: 8000, moving_time: 2000 },
        { id: 4, name: 'Old format', type: 'StandUpPaddling', start_date: '2026-01-04T18:00:00Z', distance: 3000, moving_time: 1500 },
      ]), { status: 200 })
    })

    const activities = await listActivities('access-token')
    expect(activities.map(a => a.id)).toEqual([1, 3, 4])
    expect(activities[2].sportType).toBe('StandUpPaddling')
  })

  it('throws on non-2xx', async () => {
    mockFetch(async () => new Response('rate limited', { status: 429 }))
    await expect(listActivities('t')).rejects.toThrow(/strava_list_failed_429/)
  })
})

describe('getActivityStreams', () => {
  it('returns null when either request fails', async () => {
    mockFetch(async (url) => {
      if (url.endsWith('/streams?keys=latlng,time&key_by_type=true')) {
        return new Response('private', { status: 403 })
      }
      return new Response(JSON.stringify({ start_date: '2026-01-01T00:00:00Z' }), { status: 200 })
    })
    expect(await getActivityStreams('t', 999)).toBeNull()
  })

  it('returns null when streams come back empty', async () => {
    mockFetch(async (url) => {
      if (url.includes('/streams')) {
        return new Response(JSON.stringify({ latlng: { data: [] }, time: { data: [] } }), { status: 200 })
      }
      return new Response(JSON.stringify({ start_date: '2026-01-01T00:00:00Z' }), { status: 200 })
    })
    expect(await getActivityStreams('t', 999)).toBeNull()
  })

  it('returns latlng + time + startDate on success', async () => {
    mockFetch(async (url) => {
      if (url.includes('/streams')) {
        return new Response(JSON.stringify({
          latlng: { data: [[51, -1], [51.001, -1.001]] },
          time: { data: [0, 60] },
        }), { status: 200 })
      }
      return new Response(JSON.stringify({ start_date: '2026-01-01T08:00:00Z' }), { status: 200 })
    })
    const out = await getActivityStreams('t', 1)
    expect(out).not.toBeNull()
    expect(out!.latlng).toHaveLength(2)
    expect(out!.time).toEqual([0, 60])
    expect(out!.startDate).toBe('2026-01-01T08:00:00Z')
  })
})

describe('streamsToTrack', () => {
  it('joins parallel arrays + start date into TrackPoints with absolute timestamps', () => {
    const track = streamsToTrack(
      [[51, -1], [51.001, -1.001]],
      [0, 60],
      '2026-01-01T08:00:00Z',
    )
    expect(track).toHaveLength(2)
    expect(track[0].lat).toBe(51)
    expect(track[0].timestamp.toISOString()).toBe('2026-01-01T08:00:00.000Z')
    expect(track[1].timestamp.toISOString()).toBe('2026-01-01T08:01:00.000Z')
  })

  it('truncates to the shorter of the two arrays', () => {
    const track = streamsToTrack([[1, 1], [2, 2], [3, 3]], [0, 10], '2026-01-01T00:00:00Z')
    expect(track).toHaveLength(2)
  })
})

// Reset fetch in case any test leaked
afterEach(() => { global.fetch = originalFetch })
