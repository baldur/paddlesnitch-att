export type LatLng = [number, number] // always [lat, lng]

export type Line = [LatLng, LatLng] // start or finish line — exactly 2 points

export type TrackPoint = {
  lat: number
  lng: number
  timestamp: Date
  hr?: number      // heart rate bpm
  cadence?: number // stroke rate spm
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
  avgHeartRate?: number
  avgCadence?: number
  hrSeries?: { timestamp: string; bpm: number }[]
  cadenceSeries?: { timestamp: string; spm: number }[]
  trackSegment?: LatLng[] // lat/lng points from start crossing to finish crossing
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

export type CourseMetadata = {
  id: string
  name: string
  sport: 'kayak' | 'rowing' | 'both'
  type: CourseType
  startLine: Line
  finishLine?: Line   // only for point_to_point / one_way
  distanceMetres: number
  minValidSeconds?: number
  gateDirection?: 1 | -1  // legacy single-gate: derived from gates[0].direction
  gates?: Array<{ line: Line; direction: 1 | -1 }>  // gate type: ordered checkpoints
  adminUserId: string
  createdAt: string
}

export type TrialMetadata = {
  id: string
  courseId: string
  name: string
  date: string // ISO date
  status: 'open' | 'closed'
  adminUserId: string
  createdAt: string
}

export type LeaderboardEntry = {
  entryId: string
  userId: string
  displayName: string
  submittedAt: string
  totalElapsedSeconds: number
  splits: Split[]
  avgHeartRate?: number
  avgCadence?: number
}

export type AuthUser = {
  id: string
  email: string
  displayName: string
}
