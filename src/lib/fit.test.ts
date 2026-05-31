import { describe, it, expect, vi } from 'vitest'
import { parseFit } from './fit'

// fit-file-parser already returns coordinates in degrees — parseFit must not
// multiply by SEMICIRCLES_TO_DEG (≈8.38e-8). This mock locks in that contract.
vi.mock('fit-file-parser', () => ({
  default: class FitParser {
    constructor(_opts: object) {}
    parse(_buf: ArrayBuffer, cb: (err: string | null, data: unknown) => void) {
      cb(null, {
        records: [
          {
            timestamp: new Date('2024-06-01T10:00:00Z'),
            position_lat: 51.5338,
            position_long: -0.9,
            heart_rate: 142,
            cadence: 28,
          },
          {
            timestamp: new Date('2024-06-01T10:01:00Z'),
            position_lat: 51.5383,
            position_long: -0.89,
            heart_rate: 145,
            cadence: 30,
          },
          {
            // no position — must be skipped
            timestamp: new Date('2024-06-01T10:02:00Z'),
            heart_rate: 150,
          },
        ],
      })
    }
  },
}))

describe('parseFit', () => {
  it('returns coordinates in degrees (regression: was multiplying by SEMICIRCLES_TO_DEG)', async () => {
    const track = await parseFit(new ArrayBuffer(0))
    expect(track[0].lat).toBeCloseTo(51.5338, 3)
    expect(track[0].lng).toBeCloseTo(-0.9, 3)
    // If the bug were reintroduced, lat would be ~4.3e-6 instead of ~51.5
  })

  it('discards heart rate and cadence even when present in the source file', async () => {
    // Privacy: HR/cadence are stripped at parse time, never enter the data model.
    const track = await parseFit(new ArrayBuffer(0))
    expect(track[0]).not.toHaveProperty('hr')
    expect(track[0]).not.toHaveProperty('cadence')
  })

  it('parses timestamps as Date objects', async () => {
    const track = await parseFit(new ArrayBuffer(0))
    expect(track[0].timestamp).toEqual(new Date('2024-06-01T10:00:00Z'))
  })

  it('skips records with no position', async () => {
    const track = await parseFit(new ArrayBuffer(0))
    expect(track).toHaveLength(2)
  })
})
