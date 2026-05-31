import type { TrackPoint } from './types'

function findCol(headers: string[], ...candidates: string[]): number {
  for (const c of candidates) {
    const norm = (s: string) => s.toLowerCase().replace(/[\s_-]/g, '')
    const idx = headers.findIndex(h => norm(h) === norm(c))
    if (idx !== -1) return idx
  }
  return -1
}

function parseTimestamp(val: string): Date | null {
  const s = val.trim()
  // Unix seconds
  if (/^\d{9,11}$/.test(s)) return new Date(parseInt(s) * 1000)
  // Unix milliseconds
  if (/^\d{12,14}$/.test(s)) return new Date(parseInt(s))
  // ISO 8601 or "YYYY-MM-DD HH:MM:SS"
  const d = new Date(s.includes('T') ? s : s.replace(' ', 'T'))
  return isNaN(d.getTime()) ? null : d
}

export function parseCsv(text: string): TrackPoint[] {
  const lines = text.trim().split(/\r?\n/)
  if (lines.length < 2) return []

  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''))

  const latI = findCol(headers, 'lat', 'latitude', 'positionlat')
  const lngI = findCol(headers, 'lon', 'lng', 'long', 'longitude', 'positionlong')
  const timeI = findCol(headers, 'time', 'timestamp', 'datetime', 'date')

  if (latI === -1 || lngI === -1 || timeI === -1) return []

  // HR / cadence columns are intentionally ignored — see types.ts.

  const points: TrackPoint[] = []

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    const cols = line.split(',').map(c => c.trim().replace(/^"|"$/g, ''))

    const lat = parseFloat(cols[latI] ?? '')
    const lng = parseFloat(cols[lngI] ?? '')
    const timestamp = parseTimestamp(cols[timeI] ?? '')

    if (!isFinite(lat) || !isFinite(lng) || !timestamp) continue
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) continue

    points.push({ lat, lng, timestamp })
  }

  return points
}
