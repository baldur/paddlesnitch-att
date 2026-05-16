import type { TrackPoint } from './types'

export function parseGpx(xml: string): TrackPoint[] {
  // Use regex for minimal dependency footprint — GPX is regular enough for this
  const points: TrackPoint[] = []
  const trkptRe = /<trkpt\s+lat="([^"]+)"\s+lon="([^"]+)"[^>]*>([\s\S]*?)<\/trkpt>/g
  const timeRe = /<time>([^<]+)<\/time>/
  const hrRe = /<(?:gpxtpx|ns3):hr>(\d+)<\/(?:gpxtpx|ns3):hr>/
  const cadRe = /<(?:gpxtpx|ns3):cad>(\d+)<\/(?:gpxtpx|ns3):cad>/

  let m: RegExpExecArray | null
  while ((m = trkptRe.exec(xml)) !== null) {
    const lat = parseFloat(m[1])
    const lng = parseFloat(m[2])
    const inner = m[3]
    const timeMatch = timeRe.exec(inner)
    if (!timeMatch) continue
    const timestamp = new Date(timeMatch[1])
    if (isNaN(timestamp.getTime())) continue

    const hrMatch = hrRe.exec(inner)
    const cadMatch = cadRe.exec(inner)

    points.push({
      lat,
      lng,
      timestamp,
      hr: hrMatch ? parseInt(hrMatch[1]) : undefined,
      cadence: cadMatch ? parseInt(cadMatch[1]) : undefined,
    })
  }

  return points
}
