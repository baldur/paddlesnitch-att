// Captures weather + river-flow conditions at an instant + location, combining
// the two best-effort clients into a single EntryConditions snapshot. Both
// sources run in parallel and independently — a partial result (one source only)
// is valid; only if BOTH miss do we return null. Never throws. See #106.

import { getWeatherAt } from './weather'
import { getFlowAt } from './river-flow'
import type { EntryConditions } from './types'

type WeatherFn = typeof getWeatherAt
type FlowFn = typeof getFlowAt

// Hard ceiling on how long a conditions lookup may take. These are two
// third-party APIs (Open-Meteo, Environment Agency) with no timeout of their
// own, and conditions are a nice-to-have — a slow source must never stall the
// upload it's attached to. A source that misses this deadline yields null and
// the entry saves without it. (This was blocking uploads in E2E, which unlike
// the unit tests hits the live APIs; it would delay real uploads too.)
const CONDITIONS_TIMEOUT_MS = 4000

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout>
  const timeout = new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), ms) })
  return Promise.race([p.finally(() => clearTimeout(timer)), timeout])
}

export async function captureConditions(
  lat: number,
  lng: number,
  whenISO: string,
  deps: { weather?: WeatherFn; flow?: FlowFn; timeoutMs?: number } = {},
): Promise<EntryConditions | null> {
  const weatherFn = deps.weather ?? getWeatherAt
  const flowFn = deps.flow ?? getFlowAt
  const timeoutMs = deps.timeoutMs ?? CONDITIONS_TIMEOUT_MS

  const [weather, flow] = await Promise.all([
    withTimeout(weatherFn(lat, lng, whenISO).catch(() => null), timeoutMs),
    withTimeout(flowFn(lat, lng, whenISO).catch(() => null), timeoutMs),
  ])

  if (!weather && !flow) return null
  return {
    capturedAt: new Date().toISOString(),
    at: whenISO,
    ...(weather ? { weather } : {}),
    ...(flow ? { flow } : {}),
  }
}
