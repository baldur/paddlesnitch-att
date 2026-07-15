import { NextRequest, NextResponse } from 'next/server'
import { parseTrace } from '@/lib/parse'
import { analyseTrack } from '@/lib/analysis'
import type { AnalysisResult } from '@/lib/analysis'
import { generateInsight } from '@/lib/llm'
import { getWeatherAt } from '@/lib/weather'
import { getFlowAt } from '@/lib/river-flow'

// Playable analysis endpoint: upload a trace, get the derived session analysis
// (segments, surges, stops, sets, conditions, templated insight). No auth /
// persistence yet — this is the local play slice before apps/analysis exists.
export async function POST(req: NextRequest) {
  const form = await req.formData()
  const file = form.get('file')
  if (!(file instanceof File)) return NextResponse.json({ error: 'No file provided.' }, { status: 400 })
  const doubleStrokeRate = form.get('doubleStrokeRate') === 'true'

  const parsed = await parseTrace(file.name, await file.arrayBuffer())
  if (!parsed.ok) {
    const msg: Record<string, string> = {
      kml_no_timing: 'KML has no timestamps — export GPX, FIT, or TCX instead.',
      unknown_format: 'Unsupported file type. Use GPX, FIT, TCX, CSV, or a Garmin .zip.',
      empty: 'No GPS track points found in that file.',
      parse_error: 'Could not read that file.',
    }
    return NextResponse.json({ error: msg[parsed.reason] ?? parsed.reason }, { status: 422 })
  }
  const track = parsed.track
  const mid = track[Math.floor(track.length / 2)]
  const when = track[0].timestamp.toISOString()

  // best-effort real conditions (never block the analysis)
  const [weather, flow] = await Promise.all([
    getWeatherAt(mid.lat, mid.lng, when).catch(() => null),
    getFlowAt(mid.lat, mid.lng, when).catch(() => null),
  ])
  const conditions = {
    windKmh: weather?.windSpeedKmh,
    windDir: weather?.windDirectionDeg,
    flowM3s: flow?.valueM3s,
    flowStation: flow?.stationLabel,
  }

  const result = analyseTrack(track, { doubleStrokeRate, conditions })
  // Narrate with the configured LLM (Ollama locally / Bedrock in prod). Optional
  // per-request model/backend overrides let you play with models while tuning.
  // Falls back to the deterministic templated insight if no backend / on failure.
  const model = typeof form.get('model') === 'string' ? (form.get('model') as string).trim() : ''
  const backend = typeof form.get('backend') === 'string' ? (form.get('backend') as string).trim() : ''
  const narrated = await generateInsight(result, { model: model || undefined, backend: backend || undefined })
  if (narrated) { result.insight = narrated; (result as AnalysisResult & { insightModel?: string }).insightModel = model || process.env.LLM_MODEL || '' }

  return NextResponse.json(result)
}
