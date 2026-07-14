import { describe, it, expect } from 'vitest'
import { analyseTrack } from './analysis'
import type { TrackPoint } from './types'

// Build a synthetic northbound track: a rest, a cruise, a faster surge, a rest.
// Speed is set by the per-step latitude delta (1° lat ≈ 111 km).
function track(): TrackPoint[] {
  const pts: TrackPoint[] = []
  let lat = 51.5, t = 0
  const push = (mps: number, sr: number, secs: number) => {
    for (let i = 0; i < secs; i++) { lat += mps / 111_000; pts.push({ lat, lng: -0.9, timestamp: new Date(t * 1000), strokeRate: sr }); t++ }
  }
  push(0.2, 10, 20)   // rest / drifting
  push(3.0, 30, 90)   // cruise
  push(4.3, 40, 60)   // a clear surge
  push(0.2, 10, 20)   // rest
  return pts
}

describe('analyseTrack', () => {
  it('derives duration + distance and detects a surge and the rests', () => {
    const r = analyseTrack(track())
    expect(r.durationS).toBeGreaterThan(180)
    expect(r.distanceKm).toBeGreaterThan(0.3)
    expect(r.surges.length).toBeGreaterThanOrEqual(1)   // the 4.3 m/s block
    expect(r.stops.length).toBeGreaterThanOrEqual(1)     // the drifting blocks
    // the surge should be the fastest segment and carry a trend + stroke rate
    expect(r.surges[0].avgSpeed).toBeGreaterThan(r.cruiseSpeed)
    expect(r.surges[0].avgSR).toBeGreaterThan(0)
    expect(r.surges[0].trend).toBeTruthy()
  })

  it('doubles stroke rate + halves distance-per-stroke for SUP→kayak', () => {
    const base = analyseTrack(track())
    const dbl = analyseTrack(track(), { doubleStrokeRate: true })
    expect(dbl.strokeRateDoubled).toBe(true)
    expect(Math.round(dbl.avgSR!)).toBe(Math.round(base.avgSR! * 2))
    // dps = speed ÷ (sr/60), so doubling sr halves dps
    expect(dbl.avgDps!).toBeCloseTo(base.avgDps! / 2, 1)
  })

  it('always produces a non-empty insight string', () => {
    expect(analyseTrack(track()).insight.length).toBeGreaterThan(20)
  })
})
