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
}

export type CourseMetadata = {
  id: string
  name: string
  sport: 'kayak' | 'rowing' | 'both'
  type: 'one_way' | 'loop'
  startLine: Line
  finishLine?: Line
  distanceMetres: number
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
