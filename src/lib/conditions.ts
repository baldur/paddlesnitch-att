// Weather + river flow conditions for an entry (issue #106).
//
// Two open-data sources, neither needs an API key:
//   - Weather: Open-Meteo forecast API (hourly, UTC). Free, no key.
//   - River flow: UK Environment Agency flood-monitoring API. Free, no key.
//
// We capture the conditions at each entry's FINISH time so the leaderboard can
// show what each athlete actually raced in — conditions at 8am and 3pm on the
// same trial differ. Capture is best-effort: a failure never breaks an upload
// or a page render, it just leaves `conditions` absent until a later read-time
// pass fills it in. See docs/features/weather-and-river-flow.md.
//
// The pure parsing/selection helpers are exported and unit-tested; the network
// wrappers are thin and exercised by manual smoke. captureConditions() no-ops
// under NODE_ENV=test so the upload/page tests stay network-free.

import { getJson, putJson, listKeys } from './storage'
import { haversine } from './geo'
import { utcDateString } from './format'
import { rebuildLeaderboard } from './leaderboard'
import type {
  LatLng, Line, EntryConditions, WeatherConditions, FlowConditions,
  ProcessedResult, BoatClass, CrewMember,
} from './types'

const OPEN_METEO = 'https://api.open-meteo.com/v1/forecast'
const EA_BASE = 'https://environment.data.gov.uk/flood-monitoring'
// How far (km) to look for a flow station near the course before giving up.
const STATION_SEARCH_KM = 25

// ---------------------------------------------------------------------------
// Pure helpers (unit-tested)
// ---------------------------------------------------------------------------

// Midpoint of a start/finish line — the lat/lng we query both APIs against.
export function midpoint(line: Line): LatLng {
  return [(line[0][0] + line[1][0]) / 2, (line[0][1] + line[1][1]) / 2]
}

// Parse an ISO-ish timestamp to epoch ms. Open-Meteo hourly times come back
// without a zone suffix (e.g. "2026-06-28T08:00") but are UTC because we ask
// for timezone=UTC; EA readings carry an explicit "Z". Treat a zone-less
// string as UTC so both compare correctly.
export function toMs(s: string): number {
  const hasZone = /[zZ]$|[+-]\d\d:?\d\d$/.test(s)
  return new Date(hasZone ? s : `${s}Z`).getTime()
}

export type FlowStation = {
  stationId: string
  label: string
  location: LatLng
  measureId: string
}

// Normalise the EA stations payload. `items` (and a station's `measures`) come
// back as a bare object when there's exactly one result, so coerce to arrays.
// Keeps only stations that expose a flow measure and a usable lat/long.
export function parseStations(json: unknown): FlowStation[] {
  const items = asArray((json as { items?: unknown })?.items)
  const out: FlowStation[] = []
  for (const raw of items) {
    const item = raw as Record<string, unknown>
    const lat = Number(item.lat)
    const lng = Number(item.long)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue
    const measures = asArray(item.measures)
    const flow = measures.find(m => (m as Record<string, unknown>).parameter === 'flow') as
      | Record<string, unknown>
      | undefined
    const measureId = flow?.['@id']
    if (typeof measureId !== 'string') continue
    out.push({
      stationId: String(item.stationReference ?? item.notation ?? ''),
      label: String(item.label ?? item.stationReference ?? 'Unknown station'),
      location: [lat, lng],
      measureId,
    })
  }
  return out
}

// Nearest flow station to a point by great-circle distance.
export function nearestStation(stations: FlowStation[], at: LatLng): FlowStation | null {
  let best: FlowStation | null = null
  let bestDist = Infinity
  for (const s of stations) {
    const d = haversine(at, s.location)
    if (d < bestDist) {
      bestDist = d
      best = s
    }
  }
  return best
}

export type FlowReading = { time: string; value: number }

// Normalise the EA readings payload into [{ time, value }].
export function parseReadings(json: unknown): FlowReading[] {
  const items = asArray((json as { items?: unknown })?.items)
  const out: FlowReading[] = []
  for (const raw of items) {
    const item = raw as Record<string, unknown>
    const value = Number(item.value)
    const time = item.dateTime
    if (typeof time === 'string' && Number.isFinite(value)) {
      out.push({ time, value })
    }
  }
  return out
}

// Reading whose timestamp is closest to the target time.
export function nearestReading(readings: FlowReading[], isoTime: string): FlowReading | null {
  const target = toMs(isoTime)
  let best: FlowReading | null = null
  let bestDelta = Infinity
  for (const r of readings) {
    const delta = Math.abs(toMs(r.time) - target)
    if (delta < bestDelta) {
      bestDelta = delta
      best = r
    }
  }
  return best
}

export type Hourly = {
  time: string[]
  temperature_2m: number[]
  wind_speed_10m: number[]
  wind_direction_10m: number[]
  precipitation: number[]
  weather_code: number[]
}

// Pull the hourly block out of an Open-Meteo response, or null if malformed.
export function parseHourly(json: unknown): Hourly | null {
  const h = (json as { hourly?: Hourly })?.hourly
  if (!h || !Array.isArray(h.time) || h.time.length === 0) return null
  return h
}

// Pick the hour closest to the target time and assemble a WeatherConditions.
export function selectHour(hourly: Hourly, isoTime: string): WeatherConditions | null {
  const target = toMs(isoTime)
  let bestIdx = -1
  let bestDelta = Infinity
  for (let i = 0; i < hourly.time.length; i++) {
    const delta = Math.abs(toMs(hourly.time[i]) - target)
    if (delta < bestDelta) {
      bestDelta = delta
      bestIdx = i
    }
  }
  if (bestIdx < 0) return null
  return {
    time: new Date(toMs(hourly.time[bestIdx])).toISOString(),
    temperatureC: num(hourly.temperature_2m?.[bestIdx]),
    windSpeedKmh: num(hourly.wind_speed_10m?.[bestIdx]),
    windDirectionDeg: num(hourly.wind_direction_10m?.[bestIdx]),
    precipitationMm: num(hourly.precipitation?.[bestIdx]),
    weatherCode: num(hourly.weather_code?.[bestIdx]),
  }
}

function asArray(v: unknown): unknown[] {
  if (Array.isArray(v)) return v
  if (v === undefined || v === null) return []
  return [v]
}

function num(v: unknown): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

// ---------------------------------------------------------------------------
// Network wrappers (best-effort; never throw)
// ---------------------------------------------------------------------------

async function fetchJson(url: string): Promise<unknown | null> {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'ATTS/1.0 (paddlesnitch.com)' } })
    if (!res.ok) return null
    return await res.json()
  } catch (err) {
    console.error('[conditions] fetch failed:', url, err)
    return null
  }
}

async function fetchWeather(at: LatLng, date: string, isoTime: string): Promise<WeatherConditions | null> {
  const url =
    `${OPEN_METEO}?latitude=${at[0]}&longitude=${at[1]}` +
    `&hourly=temperature_2m,precipitation,weather_code,wind_speed_10m,wind_direction_10m` +
    `&start_date=${date}&end_date=${date}&timezone=UTC`
  const json = await fetchJson(url)
  if (!json) return null
  const hourly = parseHourly(json)
  return hourly ? selectHour(hourly, isoTime) : null
}

async function fetchFlow(at: LatLng, date: string, isoTime: string): Promise<FlowConditions | null> {
  const stationsUrl =
    `${EA_BASE}/id/stations?parameter=flow&lat=${at[0]}&long=${at[1]}&dist=${STATION_SEARCH_KM}`
  const station = nearestStation(parseStations(await fetchJson(stationsUrl)), at)
  if (!station) return null
  const readingsUrl = `${station.measureId}/readings?date=${date}`
  const reading = nearestReading(parseReadings(await fetchJson(readingsUrl)), isoTime)
  if (!reading) return null
  return {
    stationId: station.stationId,
    stationLabel: station.label,
    measureId: station.measureId,
    flowM3s: reading.value,
    time: reading.time,
  }
}

// Capture weather + flow at a point and time. Returns undefined if BOTH fail
// (nothing worth storing); a partial result (one source) is kept. No-ops under
// NODE_ENV=test so route/page tests don't hit the network.
export async function captureConditions(
  at: LatLng,
  isoTime: string,
): Promise<EntryConditions | undefined> {
  if (process.env.NODE_ENV === 'test') return undefined
  const date = utcDateString(isoTime)
  const [weather, flow] = await Promise.all([
    fetchWeather(at, date, isoTime),
    fetchFlow(at, date, isoTime),
  ])
  if (!weather && !flow) return undefined
  return {
    capturedAt: new Date().toISOString(),
    location: at,
    ...(weather ? { weather } : {}),
    ...(flow ? { flow } : {}),
  }
}

// ---------------------------------------------------------------------------
// Read-time fallback
// ---------------------------------------------------------------------------

type StoredEntry = {
  entryId: string
  userId: string
  displayName: string
  submittedAt: string
  filename: string
  raceDate: string
  traceRecordedDate: string
  dateDiscrepancy: boolean
  boatClass: BoatClass
  crew: CrewMember[]
  result: ProcessedResult
}

// Fills in conditions for any entry on a trial that's missing them — the
// read-time fallback for uploads where the upload-time capture failed or
// predates this feature. Persists each filled entry back to its result.json
// and rebuilds the leaderboard if anything changed. Best-effort: errors are
// swallowed. `capture` and `locationFor` are injectable for tests.
//
// Returns the number of entries enriched.
export async function enrichTrialConditions(
  trialId: string,
  capture: (at: LatLng, isoTime: string) => Promise<EntryConditions | undefined> = captureConditions,
  locationFor?: (trialId: string) => Promise<LatLng | null>,
): Promise<number> {
  try {
    const at = locationFor ? await locationFor(trialId) : await trialLocation(trialId)
    if (!at) return 0
    const keys = (await listKeys(`trials/${trialId}/entries/`)).filter(k => k.endsWith('result.json'))
    let enriched = 0
    for (const key of keys) {
      const entry = await getJson<StoredEntry>(key)
      if (!entry || !entry.result || entry.result.conditions) continue
      const conditions = await capture(at, entry.result.finishTimestamp)
      if (!conditions) continue
      entry.result.conditions = conditions
      await putJson(key, entry)
      enriched++
    }
    if (enriched > 0) await rebuildLeaderboard(trialId)
    return enriched
  } catch (err) {
    console.error('[conditions] enrichTrialConditions failed:', trialId, err)
    return 0
  }
}

// Resolve a trial's query point: the midpoint of its course's start line.
async function trialLocation(trialId: string): Promise<LatLng | null> {
  const trial = await getJson<{ courseId: string }>(`trials/${trialId}/metadata.json`)
  if (!trial) return null
  const course = await getJson<{ startLine: Line }>(`courses/${trial.courseId}/metadata.json`)
  if (!course?.startLine) return null
  return midpoint(course.startLine)
}
