// UK Environment Agency flood-monitoring client (open data, no API key). Finds
// the nearest river-flow station to a point and reads the flow (m³/s) nearest a
// given instant. Best-effort: any error / empty / malformed response yields
// null, never throws — capture must not break an upload or a render (#106).

import { haversine } from './geo'
import type { LatLng } from './types'

export type FlowReading = {
  stationId: string
  stationLabel?: string
  valueM3s?: number
  at?: string
}

type Fetch = typeof fetch
const EA = 'https://environment.data.gov.uk/flood-monitoring'

function utcDate(when: Date): string {
  return when.toISOString().slice(0, 10)
}

export function flowStationsUrl(lat: number, lng: number, distKm = 15): string {
  return `${EA}/id/stations?parameter=flow&lat=${lat.toFixed(4)}&long=${lng.toFixed(4)}&dist=${distKm}`
}

export function flowReadingsUrl(measureId: string, when: Date): string {
  // A single day's 15-min readings; we pick the one nearest `when`.
  return `${measureId}/readings?_sorted&date=${utcDate(when)}`
}

// The flow measure id + label of the station nearest (lat,lng). Pure over the
// EA `stations` items so it can be unit-tested. A station's `measures` may be a
// single object or an array; we keep the one whose parameter is `flow`.
export function pickNearestFlowStation(
  items: unknown,
  lat: number,
  lng: number,
): { measureId: string; label?: string } | null {
  if (!Array.isArray(items)) return null
  const here: LatLng = [lat, lng]
  let best: { measureId: string; label?: string; dist: number } | null = null
  for (const raw of items) {
    const s = raw as Record<string, unknown>
    const sLat = Number(s.lat)
    const sLng = Number(s.long)
    const measures = Array.isArray(s.measures) ? s.measures : s.measures ? [s.measures] : []
    const flow = measures
      .map(m => m as Record<string, unknown>)
      .find(m => m.parameter === 'flow' && typeof m['@id'] === 'string')
    if (!flow) continue
    const measureId = flow['@id'] as string
    // Distance is only meaningful with station coords; without them, still keep
    // the station as a last resort (dist = Infinity loses to any located one).
    const dist = Number.isFinite(sLat) && Number.isFinite(sLng)
      ? haversine(here, [sLat, sLng])
      : Infinity
    if (!best || dist < best.dist) {
      best = { measureId, label: typeof s.label === 'string' ? s.label : undefined, dist }
    }
  }
  return best ? { measureId: best.measureId, label: best.label } : null
}

// The reading value nearest `when`. Pure over EA `readings` items.
export function pickNearestReading(items: unknown, when: Date): { value: number; at: string } | null {
  if (!Array.isArray(items)) return null
  const target = when.getTime()
  let best: { value: number; at: string; delta: number } | null = null
  for (const raw of items) {
    const r = raw as Record<string, unknown>
    const value = Number(r.value)
    const at = typeof r.dateTime === 'string' ? r.dateTime : undefined
    if (!Number.isFinite(value) || !at) continue
    const t = Date.parse(at)
    if (Number.isNaN(t)) continue
    const delta = Math.abs(t - target)
    if (!best || delta < best.delta) best = { value, at, delta }
  }
  return best ? { value: best.value, at: best.at } : null
}

export async function getFlowAt(
  lat: number,
  lng: number,
  whenISO: string,
  fetchImpl: Fetch = fetch,
): Promise<FlowReading | null> {
  const when = new Date(whenISO)
  if (Number.isNaN(when.getTime())) return null
  try {
    const sRes = await fetchImpl(flowStationsUrl(lat, lng))
    if (!sRes.ok) return null
    const station = pickNearestFlowStation((await sRes.json())?.items, lat, lng)
    if (!station) return null

    const rRes = await fetchImpl(flowReadingsUrl(station.measureId, when))
    if (!rRes.ok) {
      return { stationId: station.measureId, stationLabel: station.label }
    }
    const reading = pickNearestReading((await rRes.json())?.items, when)
    return {
      stationId: station.measureId,
      stationLabel: station.label,
      ...(reading ? { valueM3s: reading.value, at: reading.at } : {}),
    }
  } catch {
    return null
  }
}
