import type { TrackPoint } from './types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FitRecord = Record<string, any>

export async function parseFit(buffer: ArrayBuffer): Promise<TrackPoint[]> {
  const { default: FitParser } = await import('fit-file-parser')
  return new Promise((resolve, reject) => {
    const parser = new FitParser({ force: true, speedUnit: 'km/h' })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    parser.parse(buffer, (err: string | undefined, data: any) => {
      if (err) return reject(new Error(err))
      // fit-file-parser already converts semicircles → degrees
      const records: FitRecord[] = data?.records ?? []
      const points: TrackPoint[] = []
      for (const r of records) {
        if (r.position_lat == null || r.position_long == null) continue
        const timestamp = r.timestamp instanceof Date ? r.timestamp : new Date(r.timestamp)
        if (isNaN(timestamp.getTime())) continue
        points.push({
          lat: r.position_lat,
          lng: r.position_long,
          timestamp,
          hr: r.heart_rate,
          cadence: r.cadence,
        })
      }
      resolve(points)
    })
  })
}
