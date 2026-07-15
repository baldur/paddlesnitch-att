export type LatLng = [number, number] // always [lat, lng]

export type Line = [LatLng, LatLng] // start or finish line — exactly 2 points

// Heart rate is intentionally NOT captured (a sensitive biometric) — every
// parser strips it at parse time. Stroke rate (a.k.a. cadence) IS captured for
// paddlers (#143): parsers populate it when the source carries it, and
// processTrace averages it over the racing segment (ProcessedResult.avgStrokeRate).
// See docs/features/courses-and-entries.md.
export type TrackPoint = {
  lat: number
  lng: number
  timestamp: Date
  strokeRate?: number // strokes per minute at this point, when the source has it
}

export type Split = {
  distance: number       // metres from start
  elapsedSeconds: number // from start crossing
}

export type ProcessedResult = {
  startTimestamp: string  // ISO 8601
  finishTimestamp: string // ISO 8601
  totalElapsedSeconds: number
  splits: Split[]
  trackSegment?: LatLng[] // lat/lng points from start crossing to finish crossing
  // How many valid runs the upload contained (start→finish pairs passing
  // minValidSeconds). This result is the fastest of them; the rest are
  // discarded. Used to tell the athlete "best of N runs". Absent on pre-#77
  // entries — treat undefined as a single run.
  runCount?: number
  // Average stroke rate (SPM) over the racing segment, when the trace carried
  // per-point stroke rate. Undefined when the source had none. #143.
  avgStrokeRate?: number
}

// Canonical types (new courses):
//   point_to_point — two separate lines (start + finish)
//   loop           — one line, cross it twice (any direction)
//   gate           — one line, crossing direction matters (gateDirection on CourseMetadata)
// Legacy aliases (kept for existing data):
//   one_way → point_to_point  |  out_and_back → gate (no dir filter)
//   lap → same-direction loop  |  figure_eight → three crossings
export type CourseType =
  | 'point_to_point' | 'loop' | 'gate'
  | 'one_way' | 'out_and_back' | 'lap' | 'figure_eight' // legacy

// Weather + river-flow at an entry's finish time + course location (#106).
// Captured once, best-effort, then frozen onto the entry. Partial is valid
// (weather present, flow absent, or vice-versa). Owned by conditions.ts.
export type EntryConditions = {
  capturedAt: string          // ISO — when we fetched
  at: string                  // ISO — the instant the conditions describe (entry finish)
  weather?: {
    temperatureC?: number
    precipitationMm?: number
    windSpeedKmh?: number
    windDirectionDeg?: number
  }
  flow?: {
    stationId: string
    stationLabel?: string
    valueM3s?: number
    at?: string               // reading timestamp (nearest to `at`)
  }
}
