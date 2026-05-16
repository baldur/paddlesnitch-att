import type { TrackPoint } from './types'
import { parseGpx } from './gpx'
import { parseFit } from './fit'

export type ParseResult =
  | { ok: true; track: TrackPoint[] }
  | { ok: false; reason: 'unknown_format' | 'parse_error' | 'empty' }

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

    // Unknown format — store raw, skip processing
    return { ok: false, reason: 'unknown_format' }
  } catch {
    return { ok: false, reason: 'parse_error' }
  }
}
