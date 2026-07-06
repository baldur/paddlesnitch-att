import type { TrackPoint } from './types'

// Heart rate is intentionally NOT extracted. Stroke rate (cadence) IS, for
// paddlers (#143): Garmin writes it as <gpxtpx:cad>, some tools as <cadence>
// or a namespaced <ns3:cad>. See docs/features/courses-and-entries.md.
export function parseGpx(xml: string): TrackPoint[] {
  const points: TrackPoint[] = []
  const trkptRe = /<trkpt\s+lat="([^"]+)"\s+lon="([^"]+)"[^>]*>([\s\S]*?)<\/trkpt>/g
  const timeRe = /<time>([^<]+)<\/time>/
  // Cadence regardless of namespace prefix: gpxtpx:cad, ns3:cad, cad, cadence.
  const cadRe = /<(?:\w+:)?cad(?:ence)?>([\d.]+)<\/(?:\w+:)?cad(?:ence)?>/

  let m: RegExpExecArray | null
  while ((m = trkptRe.exec(xml)) !== null) {
    const lat = parseFloat(m[1])
    const lng = parseFloat(m[2])
    const inner = m[3]
    const timeMatch = timeRe.exec(inner)
    if (!timeMatch) continue
    const timestamp = new Date(timeMatch[1])
    if (isNaN(timestamp.getTime())) continue

    const cadMatch = cadRe.exec(inner)
    const strokeRate = cadMatch ? parseFloat(cadMatch[1]) : NaN

    points.push({ lat, lng, timestamp, ...(isFinite(strokeRate) ? { strokeRate } : {}) })
  }

  return points
}
