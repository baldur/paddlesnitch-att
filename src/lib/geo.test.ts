import { describe, it, expect } from 'vitest'
import { haversine, processTrace, formatTime } from './geo'
import type { TrackPoint, Line } from './types'

// Helpers
function pt(lat: number, lng: number, ms: number, hr?: number, cadence?: number): TrackPoint {
  return { lat, lng, timestamp: new Date(ms), hr, cadence }
}

describe('haversine', () => {
  it('returns 0 for identical points', () => {
    expect(haversine([51.5, -0.1], [51.5, -0.1])).toBe(0)
  })

  it('returns ~111km for 1 degree of latitude', () => {
    const d = haversine([0, 0], [1, 0])
    expect(d).toBeCloseTo(111195, -2) // within ~100m
  })

  it('returns ~500m for known river segment', () => {
    // ~500m along the Thames near Henley
    const d = haversine([51.5338, -0.9], [51.5383, -0.9])
    expect(d).toBeGreaterThan(490)
    expect(d).toBeLessThan(510)
  })
})

describe('processTrace', () => {
  // A simple straight track going north, crossing start at lat=0.001, finish at lat=0.005
  // Start line: horizontal line at lat=0.001 from lng=-0.001 to lng=0.001
  // Finish line: horizontal line at lat=0.005 from lng=-0.001 to lng=0.001
  const startLine: Line = [[0.001, -0.001], [0.001, 0.001]]
  const finishLine: Line = [[0.005, -0.001], [0.005, 0.001]]

  const track: TrackPoint[] = [
    pt(0.000, 0, 0),
    pt(0.002, 0, 10_000),   // crosses start line between t=0 and t=10s
    pt(0.004, 0, 20_000),
    pt(0.006, 0, 30_000),   // crosses finish line between t=20 and t=30s
    pt(0.008, 0, 40_000),
  ]

  it('detects start and finish crossings', () => {
    const result = processTrace(track, startLine, finishLine)
    expect(result).not.toBeNull()
  })

  it('calculates elapsed time correctly', () => {
    const result = processTrace(track, startLine, finishLine)!
    // Start crossing at lat=0.001, which is 50% of the way from pt[0] to pt[1] → t=5000ms
    // Finish crossing at lat=0.005, which is 50% of the way from pt[2] to pt[3] → t=25000ms
    expect(result.totalElapsedSeconds).toBeCloseTo(20, 0)
  })

  it('returns null when track does not cross start line', () => {
    const noStartTrack = [pt(0.002, 0, 0), pt(0.004, 0, 10_000)]
    expect(processTrace(noStartTrack, startLine, finishLine)).toBeNull()
  })

  it('returns null when track crosses start but not finish', () => {
    const noFinishTrack = [pt(0.000, 0, 0), pt(0.003, 0, 15_000)]
    expect(processTrace(noFinishTrack, startLine, finishLine)).toBeNull()
  })

  it('returns null for track with fewer than 2 points', () => {
    expect(processTrace([pt(0, 0, 0)], startLine, finishLine)).toBeNull()
  })

  it('includes hr and cadence averages when present', () => {
    const trackWithMetrics: TrackPoint[] = [
      pt(0.000, 0, 0, 120, 30),
      pt(0.002, 0, 10_000, 140, 32),
      pt(0.004, 0, 20_000, 150, 34),
      pt(0.006, 0, 30_000, 130, 28),
      pt(0.008, 0, 40_000, 125, 29),
    ]
    const result = processTrace(trackWithMetrics, startLine, finishLine)!
    expect(result.avgHeartRate).toBeDefined()
    expect(result.avgCadence).toBeDefined()
  })
})

describe('formatTime', () => {
  it('formats whole minutes correctly', () => {
    expect(formatTime(60)).toBe('1:00.0')
  })

  it('formats seconds with decimal', () => {
    expect(formatTime(75.5)).toBe('1:15.5')
  })

  it('formats sub-minute time', () => {
    expect(formatTime(42.3)).toBe('0:42.3')
  })
})
