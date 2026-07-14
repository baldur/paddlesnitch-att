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
        // HR intentionally not captured. Stroke rate (cadence) IS (#143): FIT
        // stores whole SPM in `cadence` plus a `fractional_cadence` remainder.
        const strokeRate = r.cadence != null
          ? r.cadence + (r.fractional_cadence ?? 0)
          : NaN
        points.push({
          lat: r.position_lat,
          lng: r.position_long,
          timestamp,
          ...(isFinite(strokeRate) ? { strokeRate } : {}),
        })
      }
      resolve(points)
    })
  })
}
