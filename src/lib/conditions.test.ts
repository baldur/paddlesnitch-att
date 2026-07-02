import { describe, it, expect } from 'vitest'
import { captureConditions } from './conditions'
import type { WeatherReading } from './weather'
import type { FlowReading } from './river-flow'

const weather: WeatherReading = { temperatureC: 14, windSpeedKmh: 18 }
const flow: FlowReading = { stationId: 'm1', valueM3s: 23.4 }

const stubWeather = (r: WeatherReading | null) => async () => r
const stubFlow = (r: FlowReading | null) => async () => r

describe('captureConditions', () => {
  it('combines both sources into a snapshot', async () => {
    const c = await captureConditions(51.5, -0.9, '2026-07-01T08:00:00Z', {
      weather: stubWeather(weather), flow: stubFlow(flow),
    })
    expect(c?.at).toBe('2026-07-01T08:00:00Z')
    expect(c?.weather).toEqual(weather)
    expect(c?.flow).toEqual(flow)
    expect(c?.capturedAt).toBeTruthy()
  })

  it('returns a partial snapshot when one source misses', async () => {
    const c = await captureConditions(51.5, -0.9, '2026-07-01T08:00:00Z', {
      weather: stubWeather(weather), flow: stubFlow(null),
    })
    expect(c?.weather).toEqual(weather)
    expect(c?.flow).toBeUndefined()
  })

  it('returns null when both sources miss', async () => {
    const c = await captureConditions(51.5, -0.9, '2026-07-01T08:00:00Z', {
      weather: stubWeather(null), flow: stubFlow(null),
    })
    expect(c).toBeNull()
  })

  it('treats a throwing source as a miss (never throws)', async () => {
    const c = await captureConditions(51.5, -0.9, '2026-07-01T08:00:00Z', {
      weather: (async () => { throw new Error('boom') }) as never,
      flow: stubFlow(flow),
    })
    expect(c?.flow).toEqual(flow)
    expect(c?.weather).toBeUndefined()
  })
})
