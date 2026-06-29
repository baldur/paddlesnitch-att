// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { makeDataDir, cleanDataDir, makeUser, makeCourse, makeTrial, plantEntry } from './helpers'
import { getJson, putJson, listKeys } from '@/lib/storage'
import {
  midpoint, toMs, parseStations, nearestStation, parseReadings, nearestReading,
  parseHourly, selectHour, captureConditions, enrichTrialConditions,
} from '@/lib/conditions'
import { weatherCodeLabel, compass8 } from '@/lib/format'
import type { LatLng, EntryConditions, LeaderboardEntry } from '@/lib/types'

describe('conditions — pure helpers', () => {
  it('midpoint averages the two line endpoints', () => {
    expect(midpoint([[51.5, -0.9], [51.5, -0.7]])).toEqual([51.5, -0.8])
  })

  it('toMs treats a zone-less Open-Meteo time as UTC, same as an explicit Z', () => {
    expect(toMs('2026-06-28T08:00')).toBe(toMs('2026-06-28T08:00:00Z'))
  })

  describe('parseStations', () => {
    it('extracts flow stations, coercing a single-object items payload to an array', () => {
      const json = {
        items: {
          '@id': 'http://x/stations/2200TH',
          label: 'Days Weir',
          stationReference: '2200TH',
          lat: 51.633,
          long: -1.18,
          measures: { '@id': 'http://x/measures/2200TH-flow', parameter: 'flow', unitName: 'm3/s' },
        },
      }
      expect(parseStations(json)).toEqual([
        { stationId: '2200TH', label: 'Days Weir', location: [51.633, -1.18], measureId: 'http://x/measures/2200TH-flow' },
      ])
    })

    it('skips stations with no flow measure or no coordinates', () => {
      const json = {
        items: [
          { stationReference: 'A', lat: 1, long: 2, measures: [{ '@id': 'm-level', parameter: 'level' }] },
          { stationReference: 'B', measures: [{ '@id': 'm-flow', parameter: 'flow' }] }, // no lat/long
        ],
      }
      expect(parseStations(json)).toEqual([])
    })
  })

  it('nearestStation picks the closest by great-circle distance', () => {
    const stations = parseStations({
      items: [
        { stationReference: 'far', lat: 52.0, long: -1.0, measures: [{ '@id': 'm1', parameter: 'flow' }] },
        { stationReference: 'near', lat: 51.51, long: -0.9, measures: [{ '@id': 'm2', parameter: 'flow' }] },
      ],
    })
    expect(nearestStation(stations, [51.5, -0.9])?.stationId).toBe('near')
    expect(nearestStation([], [51.5, -0.9])).toBeNull()
  })

  describe('readings', () => {
    const json = {
      items: [
        { dateTime: '2026-06-28T08:00:00Z', value: 10 },
        { dateTime: '2026-06-28T15:00:00Z', value: 25 },
      ],
    }
    it('parseReadings normalises to { time, value }', () => {
      expect(parseReadings(json)).toEqual([
        { time: '2026-06-28T08:00:00Z', value: 10 },
        { time: '2026-06-28T15:00:00Z', value: 25 },
      ])
    })
    it('nearestReading picks the reading closest to the target time', () => {
      expect(nearestReading(parseReadings(json), '2026-06-28T14:30:00Z')?.value).toBe(25)
      expect(nearestReading(parseReadings(json), '2026-06-28T07:30:00Z')?.value).toBe(10)
    })
  })

  describe('weather', () => {
    const hourly = {
      time: ['2026-06-28T07:00', '2026-06-28T08:00', '2026-06-28T15:00'],
      temperature_2m: [11, 12, 18],
      wind_speed_10m: [5, 6, 14],
      wind_direction_10m: [200, 210, 270],
      precipitation: [0, 0.2, 0],
      weather_code: [3, 61, 0],
    }
    it('parseHourly returns null on a malformed payload', () => {
      expect(parseHourly({})).toBeNull()
      expect(parseHourly({ hourly: { time: [] } })).toBeNull()
    })
    it('selectHour assembles the hour nearest the target time', () => {
      const w = selectHour(parseHourly({ hourly })!, '2026-06-28T08:10:00Z')
      expect(w).toEqual({
        time: '2026-06-28T08:00:00.000Z',
        temperatureC: 12,
        windSpeedKmh: 6,
        windDirectionDeg: 210,
        precipitationMm: 0.2,
        weatherCode: 61,
      })
    })
  })

  it('weatherCodeLabel maps WMO buckets and falls back to the code', () => {
    expect(weatherCodeLabel(0)).toBe('Clear')
    expect(weatherCodeLabel(61)).toBe('Rain')
    expect(weatherCodeLabel(95)).toBe('Thunderstorm')
    expect(weatherCodeLabel(200)).toBe('Code 200')
  })

  it('compass8 maps degrees to an 8-point compass', () => {
    expect(compass8(0)).toBe('N')
    expect(compass8(90)).toBe('E')
    expect(compass8(225)).toBe('SW')
    expect(compass8(360)).toBe('N')
  })

  it('captureConditions is a no-op under NODE_ENV=test (never hits the network)', async () => {
    expect(await captureConditions([51.5, -0.9], '2026-06-28T08:00:00Z')).toBeUndefined()
  })
})

describe('enrichTrialConditions — read-time fallback', () => {
  let dataDir: string
  beforeEach(async () => { dataDir = await makeDataDir() })
  afterEach(async () => { await cleanDataDir(dataDir) })

  const fakeConditions: EntryConditions = {
    capturedAt: '2026-06-28T20:00:00Z',
    location: [51.55, -0.9],
    weather: { time: '2026-06-28T10:00:00Z', temperatureC: 14, windSpeedKmh: 8, windDirectionDeg: 180, precipitationMm: 0, weatherCode: 1 },
    flow: { stationId: '2200TH', stationLabel: 'Days Weir', measureId: 'm-flow', flowM3s: 12.3, time: '2026-06-28T10:00:00Z' },
  }

  it('fills missing conditions, persists them, and carries them onto the leaderboard', async () => {
    const user = await makeUser()
    const course = await makeCourse(user.id)
    const trial = await makeTrial(course.id, user.id, 'open')
    await plantEntry(trial.id, user.id)

    let calledAt: LatLng | undefined
    const count = await enrichTrialConditions(trial.id, async (at) => { calledAt = at; return fakeConditions })

    expect(count).toBe(1)
    // The query point is the course start-line midpoint.
    expect(calledAt).toEqual(midpoint(course.startLine))

    const key = (await listKeys(`trials/${trial.id}/entries/`)).find(k => k.endsWith('result.json'))!
    const stored = await getJson<{ result: { conditions?: EntryConditions } }>(key)
    expect(stored?.result.conditions).toEqual(fakeConditions)

    const lb = await getJson<LeaderboardEntry[]>(`trials/${trial.id}/leaderboard.json`)
    expect(lb?.[0].conditions).toEqual(fakeConditions)
  })

  it('skips entries that already have conditions (no overwrite, returns 0)', async () => {
    const user = await makeUser()
    const course = await makeCourse(user.id)
    const trial = await makeTrial(course.id, user.id, 'open')
    await plantEntry(trial.id, user.id)

    // Pre-fill the planted entry with conditions.
    const key = (await listKeys(`trials/${trial.id}/entries/`)).find(k => k.endsWith('result.json'))!
    const stored = await getJson<{ result: { conditions?: EntryConditions } }>(key)
    stored!.result.conditions = fakeConditions
    await putJson(key, stored)

    let called = false
    const count = await enrichTrialConditions(trial.id, async () => { called = true; return fakeConditions })

    expect(count).toBe(0)
    expect(called).toBe(false)
  })
})
