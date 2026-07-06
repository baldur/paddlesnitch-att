import type { TrackPoint } from './types'
import { parseGpx } from './gpx'
import { parseFit } from './fit'
import { parseCsv } from './csv'
import { parseTcx } from './tcx'
import { readZip } from './unzip'

export type ParseResult =
  | { ok: true; track: TrackPoint[] }
  | { ok: false; reason: 'unknown_format' | 'parse_error' | 'empty' | 'kml_no_timing' }

const TRACE_EXTS = ['gpx', 'fit', 'csv', 'tcx']

export async function parseTrace(filename: string, data: ArrayBuffer): Promise<ParseResult> {
  const ext = filename.split('.').pop()?.toLowerCase()

  try {
    if (ext === 'gpx') {
      const text = new TextDecoder().decode(data)
      const track = parseGpx(text)
      return track.length > 0 ? { ok: true, track } : { ok: false, reason: 'empty' }
    }

    if (ext === 'fit') {
      const track = await parseFit(data)
      return track.length > 0 ? { ok: true, track } : { ok: false, reason: 'empty' }
    }

    if (ext === 'csv') {
      const text = new TextDecoder().decode(data)
      const track = parseCsv(text)
      return track.length > 0 ? { ok: true, track } : { ok: false, reason: 'empty' }
    }

    if (ext === 'tcx') {
      const text = new TextDecoder().decode(data)
      const track = parseTcx(text)
      return track.length > 0 ? { ok: true, track } : { ok: false, reason: 'empty' }
    }

    // KML is a geometry format: Strava/Google exports carry <coordinates> but no
    // per-point timestamps, so a race time can't be computed from one. Reject it
    // with a dedicated reason the upload surfaces as "export GPX/FIT/TCX instead"
    // rather than a confusing generic parse error. (Some tools DO emit a
    // <gx:Track> with <when> times, but the common exports don't — not worth the
    // false promise.)
    if (ext === 'kml') {
      return { ok: false, reason: 'kml_no_timing' }
    }

    // Fitness apps (e.g. Garmin Connect) export a single activity wrapped in a
    // zip. Unwrap it and parse the first supported trace file inside.
    if (ext === 'zip') {
      const entries = readZip(data)
      const inner = entries.find((e) => TRACE_EXTS.includes(e.filename.split('.').pop()?.toLowerCase() ?? ''))
      if (!inner) return { ok: false, reason: 'unknown_format' }
      return parseTrace(inner.filename, inner.data)
    }

    return { ok: false, reason: 'unknown_format' }
  } catch {
    return { ok: false, reason: 'parse_error' }
  }
}
