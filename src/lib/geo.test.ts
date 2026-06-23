import { describe, it, expect } from 'vitest'
import { haversine, processTrace, formatTime } from './geo'
import type { TrackPoint, Line } from './types'

// Helpers
function pt(lat: number, lng: number, ms: number): TrackPoint {
  return { lat, lng, timestamp: new Date(ms) }
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

  it('includes trackSegment with start and finish interpolated points', () => {
    const result = processTrace(track, startLine, finishLine)!
    expect(result.trackSegment).toBeDefined()
    expect(result.trackSegment!.length).toBeGreaterThanOrEqual(2)
    // First point should be near the start line (lat ≈ 0.001)
    expect(result.trackSegment![0][0]).toBeCloseTo(0.001, 3)
    // Last point should be near the finish line (lat ≈ 0.005)
    expect(result.trackSegment![result.trackSegment!.length - 1][0]).toBeCloseTo(0.005, 3)
  })

  it('does not expose hr or cadence on the result', () => {
    // Privacy: HR/cadence are stripped at parse time and the ProcessedResult
    // type itself has no HR/cadence fields. This is a belt-and-braces check
    // against regressions.
    const result = processTrace([
      pt(0.000, 0, 0),
      pt(0.002, 0, 10_000),
      pt(0.004, 0, 20_000),
      pt(0.006, 0, 30_000),
    ], startLine, finishLine)!
    expect(result).not.toHaveProperty('avgHeartRate')
    expect(result).not.toHaveProperty('avgCadence')
    expect(result).not.toHaveProperty('hrSeries')
    expect(result).not.toHaveProperty('cadenceSeries')
  })

  it('rescues a run that crossed the finish line before the start (#66)', () => {
    // The athlete went south: crossed the finish line (lat 0.005) first, then
    // the start line (lat 0.001), and stopped. There is no forward
    // start→finish segment, so the forward pass yields nothing. The fallback
    // retries with the lines' roles swapped (clock runs finish→start) and times
    // it: finish-crossing at 7.5s, start-crossing at 47.5s → 40s elapsed.
    const finishFirst = [
      pt(0.008, 0, 0),
      pt(0.004, 0, 10_000),  // crosses finish line (lat 0.005) at 7.5s
      pt(0.000, 0, 60_000),  // crosses start line  (lat 0.001) at 47.5s
    ]
    const result = processTrace(finishFirst, startLine, finishLine, 'point_to_point')
    expect(result).not.toBeNull()
    expect(result!.totalElapsedSeconds).toBeCloseTo(40, 1)
  })
})

describe('processTrace — loop and gate course types', () => {
  // Line at lat=0.002; segments go 0.000→0.004 or 0.004→0.000 at lng=0,
  // so every crossing hits the midpoint at t=0.5 for clean ms arithmetic.
  const line: Line = [[0.002, -0.001], [0.002, 0.001]]

  // Track: north crossing (5s), then south crossing (25s)
  // North crossing = rxsSign +1, south crossing = rxsSign -1
  const twoPassTrack: TrackPoint[] = [
    pt(0.000, 0, 0),
    pt(0.004, 0, 10_000),   // crosses north at t=0.5 → 5s   (+1)
    pt(0.004, 0, 10_000),
    pt(0.000, 0, 30_000),   // crosses south at t=0.5 → 20s  (-1)
    pt(0.000, 0, 40_000),
  ]

  it('loop: matches any two crossings regardless of direction', () => {
    const result = processTrace(twoPassTrack, line, undefined, 'loop')
    expect(result).not.toBeNull()
    expect(result!.totalElapsedSeconds).toBeCloseTo(15, 0)
  })

  it('gate with finishLine: start at gateDirection crossing, finish at separate line', () => {
    // startGate at lat=0.001, finishGate at lat=0.005; track crosses each on separate segments → 20s
    const startGate: Line = [[0.001, -0.001], [0.001, 0.001]]
    const finishGate: Line = [[0.005, -0.001], [0.005, 0.001]]
    const gateTrack: TrackPoint[] = [
      pt(0.000, 0, 0),
      pt(0.002, 0, 10_000), // seg 0: crosses startGate at t=0.5 → 5s  (+1 northbound)
      pt(0.004, 0, 20_000),
      pt(0.006, 0, 30_000), // seg 2: crosses finishGate at t=0.5 → 25s
    ]
    const result = processTrace(gateTrack, startGate, finishGate, 'gate', 0, 1)
    expect(result).not.toBeNull()
    expect(result!.totalElapsedSeconds).toBeCloseTo(20, 0)
  })

  it('gate with finishLine: ignores start crossings in the wrong direction', () => {
    const startGate: Line = [[0.001, -0.001], [0.001, 0.001]]
    const finishGate: Line = [[0.005, -0.001], [0.005, 0.001]]
    const gateTrack: TrackPoint[] = [
      pt(0.000, 0, 0),
      pt(0.002, 0, 10_000),
      pt(0.004, 0, 20_000),
      pt(0.006, 0, 30_000),
    ]
    // gateDirection=-1 requires southbound start; track only goes north → null
    expect(processTrace(gateTrack, startGate, finishGate, 'gate', 0, -1)).toBeNull()
  })

  it('gate without finishLine: expects opposite-direction re-crossing', () => {
    const result = processTrace(twoPassTrack, line, undefined, 'gate', 0, 1)
    expect(result).not.toBeNull()
    expect(result!.totalElapsedSeconds).toBeCloseTo(15, 0)
  })

  // Legacy types still work
  it('out_and_back (legacy): opposite-direction finish', () => {
    const result = processTrace(twoPassTrack, line, undefined, 'out_and_back')
    expect(result).not.toBeNull()
    expect(result!.totalElapsedSeconds).toBeCloseTo(15, 0)
  })

  const lapTrack: TrackPoint[] = [
    pt(0.000, 0, 0),
    pt(0.004, 0, 10_000),
    pt(0.004, 0.005, 20_000),
    pt(0.000, 0.005, 30_000),
    pt(0.000, 0, 40_000),
    pt(0.004, 0, 50_000),
  ]

  it('lap (legacy): same-direction finish', () => {
    const result = processTrace(lapTrack, line, undefined, 'lap')
    expect(result).not.toBeNull()
    expect(result!.totalElapsedSeconds).toBeCloseTo(40, 0)
  })
})

describe('processTrace — minValidSeconds', () => {
  const startLine: Line = [[0.001, -0.001], [0.001, 0.001]]
  const finishLine: Line = [[0.005, -0.001], [0.005, 0.001]]

  const track: TrackPoint[] = [
    pt(0.000, 0, 0),
    pt(0.002, 0, 10_000),
    pt(0.004, 0, 20_000),
    pt(0.006, 0, 30_000),
    pt(0.008, 0, 40_000),
  ]

  it('returns result when elapsed time meets minimum', () => {
    const result = processTrace(track, startLine, finishLine, 'point_to_point', 19)
    expect(result).not.toBeNull()
    expect(result!.totalElapsedSeconds).toBeCloseTo(20, 0)
  })

  it('returns null when elapsed time is below minimum', () => {
    expect(processTrace(track, startLine, finishLine, 'point_to_point', 21)).toBeNull()
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
