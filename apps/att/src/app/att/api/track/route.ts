import { NextRequest, NextResponse } from 'next/server'
import { emitMetric, isMetricEvent } from '@/lib/metrics'

// Receives client-side analytics beacons (currently pageviews) and emits a
// CloudWatch EMF event. Unauthenticated by design — pageviews come from anyone.
// No PII is recorded: only the event name, the path, and a client-generated
// random session id (not tied to identity). Unknown events are dropped so
// arbitrary input can't create new metrics.
//
// Always returns 204 (No Content) — beacons are fire-and-forget; the client
// neither needs nor reads a body.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  if (!isMetricEvent(body?.event)) {
    return new NextResponse(null, { status: 204 })
  }

  const props: Record<string, string> = {}
  if (typeof body.path === 'string') props.path = body.path.slice(0, 200)
  if (typeof body.sid === 'string') props.sid = body.sid.slice(0, 64)

  emitMetric(body.event, props)
  return new NextResponse(null, { status: 204 })
}
