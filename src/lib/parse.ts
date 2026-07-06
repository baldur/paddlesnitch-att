import type { TrackPoint } from './types'
import { parseGpx } from './gpx'
import { parseFit } from './fit'
import { parseCsv } from './csv'
import { parseTcx } from './tcx'
import { readZip } from './unzip'

export type ParseResult =
  | { ok: true; track: TrackPoint[] }
  | { ok: false; reason: 'unknown_format' | 'parse_error' | 'empty' }

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
