import type { TrackPoint } from './types'

// NK SpeedCoach (GPS Pro / SpeedCoach GPS) CSV export. Unlike a plain per-row
// CSV, it's a multi-section report: "Session Information", summary tables, then
// a "Per-Stroke Data:" section whose rows carry GPS Lat./Lon., a relative
// "Elapsed Time" (HH:MM:SS.t), and "Stroke Rate" (SPM). Absolute time = the
// session "Start Time" + elapsed. This is THE paddling/rowing device, so it's
// worth a dedicated parser rather than steering everyone to its FIT export.
//
// HR is intentionally not captured. Stroke rate is (#143).

// Cheap signature test so the dispatcher can route .csv files here vs the
// generic per-row CSV parser.
export function looksLikeSpeedCoach(text: string): boolean {
  return text.includes('Per-Stroke Data') || /SpeedCoach/i.test(text.slice(0, 2000))
}

function splitCsvLine(line: string): string[] {
  return line.split(',').map(c => c.trim().replace(/^"|"$/g, ''))
}

// "MM/DD/YYYY HH:MM:SS" (device local time; no zone). We only use it as a base
// for adding the relative elapsed times, and elapsed diffs between crossings
// cancel the base entirely — so parsing as UTC is deterministic and safe for
// timing. Returns null if unrecognisable.
function parseStartTime(val: string): Date | null {
  const m = /(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})/.exec(val)
  if (!m) return null
  const [, mo, d, y, h, mi, s] = m
  const date = new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s))
  return isNaN(date.getTime()) ? null : date
}

// "HH:MM:SS.t" → seconds. Returns NaN when it isn't a clock value (e.g. the
// units row "(HH:MM:SS.tenths)"), which the caller uses to skip non-data rows.
function parseElapsedSeconds(val: string): number {
  const m = /^(\d+):(\d{2}):(\d{2}(?:\.\d+)?)$/.exec(val.trim())
  if (!m) return NaN
  return +m[1] * 3600 + +m[2] * 60 + parseFloat(m[3])
}

export function parseSpeedCoachCsv(text: string): TrackPoint[] {
  const lines = text.split(/\r?\n/)

  // 1. Session start time.
  let start: Date | null = null
  for (const line of lines) {
    const cells = splitCsvLine(line)
    const i = cells.findIndex(c => c.replace(/:$/, '') === 'Start Time')
    if (i !== -1 && cells[i + 1]) { start = parseStartTime(cells[i + 1]); if (start) break }
  }
  if (!start) return []

  // 2. Per-stroke header row: starts with "Interval" and carries the GPS columns.
  let headerIdx = -1
  let header: string[] = []
  for (let i = 0; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i])
    if (cells[0] === 'Interval' && cells.includes('GPS Lat.')) { headerIdx = i; header = cells; break }
  }
  if (headerIdx === -1) return []

  const col = (name: string) => header.indexOf(name)
  const elapsedI = col('Elapsed Time')
  const latI = col('GPS Lat.')
  const lngI = col('GPS Lon.')
  const rateI = col('Stroke Rate')
  if (elapsedI === -1 || latI === -1 || lngI === -1) return []

  // 3. Data rows (skip the units row via the elapsed-time shape check).
  const base = start.getTime()
  const points: TrackPoint[] = []
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i])
    const elapsed = parseElapsedSeconds(cells[elapsedI] ?? '')
    if (!isFinite(elapsed)) continue
    const lat = parseFloat(cells[latI] ?? '')
    const lng = parseFloat(cells[lngI] ?? '')
    if (!isFinite(lat) || !isFinite(lng)) continue
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) continue

    const strokeRate = rateI !== -1 ? parseFloat(cells[rateI] ?? '') : NaN
    points.push({
      lat,
      lng,
      timestamp: new Date(base + elapsed * 1000),
      ...(isFinite(strokeRate) ? { strokeRate } : {}),
    })
  }

  return points
}
