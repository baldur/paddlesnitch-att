// Open-Meteo weather client (free, no API key). Returns the hourly conditions
// nearest a given instant at a lat/lng. History older than ~5 days comes from
// the archive API; anything recent comes from the forecast API with `past_days`.
// Everything is best-effort: any error / empty / malformed response yields null,
// never throws — capture must not break an upload or a page render (#106).

export type WeatherReading = {
  temperatureC?: number
  precipitationMm?: number
  windSpeedKmh?: number
  windDirectionDeg?: number
}

type Fetch = typeof fetch

const HOURLY = 'temperature_2m,precipitation,wind_speed_10m,wind_direction_10m'
const DAY_MS = 24 * 60 * 60 * 1000

// UTC date (YYYY-MM-DD) of an instant.
function utcDate(when: Date): string {
  return when.toISOString().slice(0, 10)
}

// The archive API lags ~5 days; use it only for instants comfortably in the past.
export function weatherUrl(lat: number, lng: number, when: Date, now: Date = new Date()): string {
  const daysAgo = (now.getTime() - when.getTime()) / DAY_MS
  const common = `latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}&hourly=${HOURLY}&timezone=UTC&wind_speed_unit=kmh`
  if (daysAgo > 5) {
    const d = utcDate(when)
    return `https://archive-api.open-meteo.com/v1/archive?${common}&start_date=${d}&end_date=${d}`
  }
  // Recent/near-now: forecast API covering a small window either side.
  const pastDays = Math.min(7, Math.max(1, Math.ceil(daysAgo) + 1))
  return `https://api.open-meteo.com/v1/forecast?${common}&past_days=${pastDays}&forecast_days=2`
}

type HourlyBlock = {
  time?: unknown
  temperature_2m?: unknown
  precipitation?: unknown
  wind_speed_10m?: unknown
  wind_direction_10m?: unknown
}

function num(arr: unknown, i: number): number | undefined {
  if (!Array.isArray(arr)) return undefined
  const v = arr[i]
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined
}

// Index of the hourly sample nearest `when`. Open-Meteo returns local-to-UTC
// times like "2026-07-01T08:00" (no offset) — parse as UTC.
function nearestHourIndex(times: string[], when: Date): number {
  let best = -1
  let bestDelta = Infinity
  const target = when.getTime()
  for (let i = 0; i < times.length; i++) {
    const t = Date.parse(`${times[i]}Z`)
    if (Number.isNaN(t)) continue
    const delta = Math.abs(t - target)
    if (delta < bestDelta) { bestDelta = delta; best = i }
  }
  return best
}

export async function getWeatherAt(
  lat: number,
  lng: number,
  whenISO: string,
  fetchImpl: Fetch = fetch,
): Promise<WeatherReading | null> {
  const when = new Date(whenISO)
  if (Number.isNaN(when.getTime())) return null
  try {
    const res = await fetchImpl(weatherUrl(lat, lng, when))
    if (!res.ok) return null
    const data = await res.json()
    const hourly = (data?.hourly ?? {}) as HourlyBlock
    const times = Array.isArray(hourly.time) ? (hourly.time as string[]) : []
    if (times.length === 0) return null
    const i = nearestHourIndex(times, when)
    if (i < 0) return null
    const reading: WeatherReading = {
      temperatureC: num(hourly.temperature_2m, i),
      precipitationMm: num(hourly.precipitation, i),
      windSpeedKmh: num(hourly.wind_speed_10m, i),
      windDirectionDeg: num(hourly.wind_direction_10m, i),
    }
    // If literally nothing parsed, treat as a miss.
    return Object.values(reading).some(v => v !== undefined) ? reading : null
  } catch {
    return null
  }
}
