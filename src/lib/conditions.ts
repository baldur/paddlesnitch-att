// Captures weather + river-flow conditions at an instant + location, combining
// the two best-effort clients into a single EntryConditions snapshot. Both
// sources run in parallel and independently — a partial result (one source only)
// is valid; only if BOTH miss do we return null. Never throws. See #106.

import { getWeatherAt } from './weather'
import { getFlowAt } from './river-flow'
import type { EntryConditions } from './types'

type WeatherFn = typeof getWeatherAt
type FlowFn = typeof getFlowAt

export async function captureConditions(
  lat: number,
  lng: number,
  whenISO: string,
  deps: { weather?: WeatherFn; flow?: FlowFn } = {},
): Promise<EntryConditions | null> {
  const weatherFn = deps.weather ?? getWeatherAt
  const flowFn = deps.flow ?? getFlowAt

  const [weather, flow] = await Promise.all([
    weatherFn(lat, lng, whenISO).catch(() => null),
    flowFn(lat, lng, whenISO).catch(() => null),
  ])

  if (!weather && !flow) return null
  return {
    capturedAt: new Date().toISOString(),
    at: whenISO,
    ...(weather ? { weather } : {}),
    ...(flow ? { flow } : {}),
  }
}
