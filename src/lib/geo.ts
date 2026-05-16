import type { LatLng, Line, TrackPoint, Split, ProcessedResult } from './types'

const EARTH_RADIUS_M = 6371000

function toRad(deg: number): number {
  return (deg * Math.PI) / 180
}

export function haversine(a: LatLng, b: LatLng): number {
  const dLat = toRad(b[0] - a[0])
  const dLng = toRad(b[1] - a[1])
  const sinHalfLat = Math.sin(dLat / 2)
  const sinHalfLng = Math.sin(dLng / 2)
  const h =
    sinHalfLat * sinHalfLat +
    Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * sinHalfLng * sinHalfLng
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h))
}

// Returns t ∈ [0,1] along segment a→b where it intersects segment c→d, or null.
// Uses parametric form + 2D cross product. Degrees treated as flat coords (valid for short segments).
function segmentIntersectT(a: LatLng, b: LatLng, c: LatLng, d: LatLng): number | null {
  const rx = b[0] - a[0]
  const ry = b[1] - a[1]
  const sx = d[0] - c[0]
  const sy = d[1] - c[1]
  const rxs = rx * sy - ry * sx
  if (Math.abs(rxs) < 1e-12) return null // parallel or collinear
  const qpx = c[0] - a[0]
  const qpy = c[1] - a[1]
  const t = (qpx * sy - qpy * sx) / rxs
  const u = (qpx * ry - qpy * rx) / rxs
  if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return t
  return null
}

type Crossing = {
  timestamp: Date
  trackIndex: number // index of track[i] where crossing occurs between i and i+1
  t: number         // interpolation parameter along that segment
}

function findFirstCrossing(track: TrackPoint[], line: Line, startFromIndex = 0): Crossing | null {
  for (let i = startFromIndex; i < track.length - 1; i++) {
    const a: LatLng = [track[i].lat, track[i].lng]
    const b: LatLng = [track[i + 1].lat, track[i + 1].lng]
    const t = segmentIntersectT(a, b, line[0], line[1])
    if (t !== null) {
      const ms0 = track[i].timestamp.getTime()
      const ms1 = track[i + 1].timestamp.getTime()
      return {
        timestamp: new Date(ms0 + t * (ms1 - ms0)),
        trackIndex: i,
        t,
      }
    }
  }
  return null
}

function calculateSplits(
  track: TrackPoint[],
  startCrossing: Crossing,
  finishCrossing: Crossing,
  splitDistanceM = 500
): Split[] {
  const startMs = startCrossing.timestamp.getTime()
  const splits: Split[] = []
  let accumulated = 0
  let nextBoundary = splitDistanceM
  let prev: LatLng = [
    track[startCrossing.trackIndex].lat + startCrossing.t * (track[startCrossing.trackIndex + 1].lat - track[startCrossing.trackIndex].lat),
    track[startCrossing.trackIndex].lng + startCrossing.t * (track[startCrossing.trackIndex + 1].lng - track[startCrossing.trackIndex].lng),
  ]
  let prevMs =
    track[startCrossing.trackIndex].timestamp.getTime() +
    startCrossing.t *
      (track[startCrossing.trackIndex + 1].timestamp.getTime() - track[startCrossing.trackIndex].timestamp.getTime())

  for (let i = startCrossing.trackIndex + 1; i <= finishCrossing.trackIndex + 1; i++) {
    if (i >= track.length) break
    const curr: LatLng = [track[i].lat, track[i].lng]
    const currMs = track[i].timestamp.getTime()
    const segDist = haversine(prev, curr)

    while (accumulated + segDist >= nextBoundary) {
      const fraction = (nextBoundary - accumulated) / segDist
      const boundaryMs = prevMs + fraction * (currMs - prevMs)
      splits.push({
        distance: nextBoundary,
        elapsedSeconds: (boundaryMs - startMs) / 1000,
      })
      nextBoundary += splitDistanceM
    }

    accumulated += segDist
    prev = curr
    prevMs = currMs

    if (i === finishCrossing.trackIndex + 1) break
  }

  return splits
}

function avgOf(values: (number | undefined)[]): number | undefined {
  const defined = values.filter((v): v is number => v !== undefined)
  if (defined.length === 0) return undefined
  return defined.reduce((a, b) => a + b, 0) / defined.length
}

export function processTrace(
  track: TrackPoint[],
  startLine: Line,
  finishLine: Line
): ProcessedResult | null {
  if (track.length < 2) return null

  const startCrossing = findFirstCrossing(track, startLine)
  if (!startCrossing) return null

  const finishCrossing = findFirstCrossing(track, finishLine, startCrossing.trackIndex + 1)
  if (!finishCrossing) return null

  const startMs = startCrossing.timestamp.getTime()
  const finishMs = finishCrossing.timestamp.getTime()
  if (finishMs <= startMs) return null

  const splits = calculateSplits(track, startCrossing, finishCrossing)

  // Collect metrics from track points between crossings
  const segment = track.slice(startCrossing.trackIndex, finishCrossing.trackIndex + 2)
  const avgHeartRate = avgOf(segment.map(p => p.hr))
  const avgCadence = avgOf(segment.map(p => p.cadence))

  const hrSeries = segment
    .filter(p => p.hr !== undefined)
    .map(p => ({ timestamp: p.timestamp.toISOString(), bpm: p.hr! }))

  const cadenceSeries = segment
    .filter(p => p.cadence !== undefined)
    .map(p => ({ timestamp: p.timestamp.toISOString(), spm: p.cadence! }))

  return {
    startTimestamp: startCrossing.timestamp.toISOString(),
    finishTimestamp: finishCrossing.timestamp.toISOString(),
    totalElapsedSeconds: (finishMs - startMs) / 1000,
    splits,
    avgHeartRate,
    avgCadence,
    hrSeries: hrSeries.length > 0 ? hrSeries : undefined,
    cadenceSeries: cadenceSeries.length > 0 ? cadenceSeries : undefined,
  }
}

export function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${secs.toFixed(1).padStart(4, '0')}`
}
