import type { TrackPoint } from './types'

// HR and cadence are intentionally NOT extracted, even when present in the
// source GPX. See docs/features/courses-and-entries.md.
export function parseGpx(xml: string): TrackPoint[] {
  const points: TrackPoint[] = []
  const trkptRe = /<trkpt\s+lat="([^"]+)"\s+lon="([^"]+)"[^>]*>([\s\S]*?)<\/trkpt>/g
  const timeRe = /<time>([^<]+)<\/time>/

  let m: RegExpExecArray | null
  while ((m = trkptRe.exec(xml)) !== null) {
    const lat = parseFloat(m[1])
    const lng = parseFloat(m[2])
    const inner = m[3]
    const timeMatch = timeRe.exec(inner)
    if (!timeMatch) continue
    const timestamp = new Date(timeMatch[1])
    if (isNaN(timestamp.getTime())) continue

    points.push({ lat, lng, timestamp })
  }

  return points
}
