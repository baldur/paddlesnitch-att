// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

import { POST as track } from '@/app/att/api/track/route'

afterEach(() => vi.restoreAllMocks())

function req(body: unknown) {
  return new NextRequest('http://x/att/api/track', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('POST /att/api/track', () => {
  it('emits an EMF line for an allowed event and returns 204', async () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const res = await track(req({ event: 'pageview', path: '/att', sid: 'abc' }))
    expect(res.status).toBe(204)
    expect(spy).toHaveBeenCalledTimes(1)
    const emf = JSON.parse(spy.mock.calls[0][0] as string)
    expect(emf.Event).toBe('pageview')
    expect(emf.path).toBe('/att')
  })

  it('drops an unknown event without emitting (no arbitrary metrics) but still 204s', async () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const res = await track(req({ event: 'definitely-not-allowed' }))
    expect(res.status).toBe(204)
    expect(spy).not.toHaveBeenCalled()
  })

  it('handles a malformed body gracefully', async () => {
    const bad = new NextRequest('http://x/att/api/track', { method: 'POST', body: 'not json' })
    const res = await track(bad)
    expect(res.status).toBe(204)
  })
})
