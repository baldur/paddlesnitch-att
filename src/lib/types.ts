export type LatLng = [number, number] // always [lat, lng]

export type Line = [LatLng, LatLng] // start or finish line — exactly 2 points

// HR / cadence intentionally NOT captured. They are stripped at parse time
// (gpx.ts, fit.ts, csv.ts) and never enter the data model. See
// docs/features/courses-and-entries.md.
export type TrackPoint = {
  lat: number
  lng: number
  timestamp: Date
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

// Boat classes. Captured per upload. Crew composition (seat numbers + names)
// is added in a later phase; Phase 1 stores only the class label.
export type KayakClass = 'K1' | 'K2' | 'K4'
export type SculClass  = '1X' | '2X' | '4X+' | '4X-'
export type SweepClass = '2-' | '4+' | '4-' | '8+'
export type BoatClass  = KayakClass | SculClass | SweepClass

export const BOAT_CLASSES: BoatClass[] = [
  'K1', 'K2', 'K4',
  '1X', '2X', '4X+', '4X-',
  '2-', '4+', '4-', '8+',
]

export const BOAT_CLASS_INFO: Record<BoatClass, {
  sport: 'kayak' | 'rowing'
  crewSize: number   // number of paddlers/rowers (does NOT include cox)
  hasCox: boolean
}> = {
  K1:   { sport: 'kayak',  crewSize: 1, hasCox: false },
  K2:   { sport: 'kayak',  crewSize: 2, hasCox: false },
  K4:   { sport: 'kayak',  crewSize: 4, hasCox: false },
  '1X': { sport: 'rowing', crewSize: 1, hasCox: false },
  '2X': { sport: 'rowing', crewSize: 2, hasCox: false },
  '4X+':{ sport: 'rowing', crewSize: 4, hasCox: true },
  '4X-':{ sport: 'rowing', crewSize: 4, hasCox: false },
  '2-': { sport: 'rowing', crewSize: 2, hasCox: false },
  '4+': { sport: 'rowing', crewSize: 4, hasCox: true },
  '4-': { sport: 'rowing', crewSize: 4, hasCox: false },
  '8+': { sport: 'rowing', crewSize: 8, hasCox: true },
}

export function isBoatClass(value: unknown): value is BoatClass {
  return typeof value === 'string' && (BOAT_CLASSES as string[]).includes(value)
}

export type LeaderboardEntry = {
  entryId: string
  userId: string
  displayName: string
  submittedAt: string
  boatClass: BoatClass
  totalElapsedSeconds: number
  splits: Split[]
}

export type AuthUser = {
  id: string
  email: string
  displayName: string
}
