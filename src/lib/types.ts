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

// Visibility scope. Phase 1 supports public / private only; phase 4 adds
// `club` (visibility tied to a club's members). The enum is forward-compatible.
export type Visibility = 'public' | 'private'

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
  visibility: Visibility
  createdAt: string
}

// `participation` controls WHO can submit a trace once they can view the
// trial. `open` is anyone who can view it; `invitational` requires the
// submitter to be in `invitedUserIds` (or be the owner).
export type Participation = 'open' | 'invitational'

export type TrialMetadata = {
  id: string
  courseId: string
  name: string
  date: string // ISO date
  status: 'open' | 'closed'
  adminUserId: string
  visibility: Visibility
  participation: Participation
  // Cognito subs of invited users. Empty (or absent) for `open` trials.
  invitedUserIds: string[]
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

// A seat in a boat. 1 = bow, N = stroke, 'C' = cox.
export type CrewMember = {
  name: string
  seat: number | 'C'
}

// Returns the full list of seat slots for a boat class. Used by both UI
// (to render the right number of rows) and validation (to check completeness).
export function expectedSeats(boatClass: BoatClass): Array<number | 'C'> {
  const info = BOAT_CLASS_INFO[boatClass]
  const seats: Array<number | 'C'> = Array.from({ length: info.crewSize }, (_, i) => i + 1)
  if (info.hasCox) seats.push('C')
  return seats
}

// Validates a crew list against a boat class. Returns null if valid, error string otherwise.
export function validateCrew(boatClass: BoatClass, crew: CrewMember[]): string | null {
  const expected = expectedSeats(boatClass)
  if (crew.length !== expected.length) {
    return `${boatClass} needs ${expected.length} crew member${expected.length === 1 ? '' : 's'}, got ${crew.length}`
  }
  const seatsSeen = new Set<number | 'C'>()
  for (const m of crew) {
    if (!m.name || !m.name.trim()) return 'All crew members need a name'
    if (!expected.includes(m.seat)) return `Seat ${m.seat} is not valid for ${boatClass}`
    if (seatsSeen.has(m.seat)) return `Seat ${m.seat} listed more than once`
    seatsSeen.add(m.seat)
  }
  return null
}

export type LeaderboardEntry = {
  entryId: string
  userId: string
  displayName: string
  submittedAt: string
  // raceDate is the date the user picked (YYYY-MM-DD, UTC).
  raceDate: string
  // dateDiscrepancy is true when raceDate disagrees with the date recorded in
  // the GPS trace itself — surfaced as a warning badge on the leaderboard so
  // viewers know there may be a wrong-file or wrong-date issue.
  dateDiscrepancy?: boolean
  boatClass: BoatClass
  crew: CrewMember[]
  totalElapsedSeconds: number
  splits: Split[]
}

export type AuthUser = {
  id: string
  email: string
  displayName: string
}

// Persisted per-user at users/{userId}/strava.json. Consumers should call
// getValidStravaTokens(), which refreshes if expiresAt is close, so the
// returned accessToken is safe to send to Strava immediately.
export type StravaTokens = {
  athleteId: number
  athleteName: string
  accessToken: string
  refreshToken: string
  // Unix seconds, matches Strava's expires_at field.
  expiresAt: number
}

// Trimmed slice of the Strava activity payload — only the fields the picker
// renders. Full Strava payload is huge; we don't store it.
export type StravaActivitySummary = {
  id: number
  name: string
  // sport_type on new activities, falling back to type. We normalise.
  sportType: string
  startDate: string             // ISO 8601, includes zone
  distanceMetres: number
  movingSeconds: number
}

// ---------------------------------------------------------------------------
// Terms of Service (phase 5)
// ---------------------------------------------------------------------------

// Bumped manually when legal/tos-{version}.md gets a material change.
// Signed-in users see a re-accept gate on their next request until they
// accept the new version.
export const CURRENT_TOS_VERSION = '001'

// Persisted per-user at users/{userId}/tos-consent.json. A user with no
// record at all has never accepted any ToS version (a pre-existing
// account from before phase 5 ships, for example).
export type TosConsent = {
  acceptances: Array<{ version: string; acceptedAt: string }>
}
