// LLM insight adapter — ONE interface, backend chosen by env. The prompt +
// summary shaping below are shared, so tuning locally (Ollama) maps 1:1 to prod
// (Bedrock). Prod hard-pins Bedrock; local uses LLM_BACKEND (ollama|bedrock).
// If no backend is configured or a call fails, generateInsight returns null and
// the caller keeps the deterministic templated insight — nothing ever breaks.
//
// Parity tip: llama3.2 / llama3.3 / mistral exist on BOTH Ollama and Bedrock, so
// you can tune the SAME model locally and deploy it unchanged.
import type { AnalysisResult, Segment } from './analysis'
import { fmtDur, split500 } from './analysis'

const SYSTEM = [
  'You are an experienced kayak and rowing coach reviewing a paddler\'s GPS session.',
  'In 2–3 short sentences, tell them the single most interesting thing about the session plus one useful observation.',
  'Use ONLY the numbers provided — never invent data. Be specific and concrete, encouraging but honest.',
  'No preamble, no lists, no markdown headings — just the short paragraph.',
].join(' ')

// Compact, grounded fact sheet — the model narrates THIS, nothing else.
function buildPrompt(r: AnalysisResult): string {
  const L: string[] = []
  L.push(`Session: ${fmtDur(r.durationS)} min, ${r.distanceKm.toFixed(2)} km.`)
  // NB: r.avgSR is already the corrected value; we do NOT tell the model about
  // the SUP×2 normalisation — a small model misreads it as "the athlete doubled
  // their rate". Present the final numbers only.
  L.push(`Cruising pace ~${split500(r.cruiseSpeed)}/500${r.avgSR != null ? ` at ~${Math.round(r.avgSR)} spm` : ''}${r.avgDps != null ? `, ~${r.avgDps.toFixed(1)} m per stroke` : ''}.`)
  const c = r.conditions
  if (c?.windKmh != null || c?.flowM3s != null) {
    const bits: string[] = []
    if (c?.windKmh != null) bits.push(`wind ${Math.round(c.windKmh)} km/h`)
    if (c?.flowM3s != null) bits.push(`river flow ${c.flowM3s.toFixed(1)} m³/s${c.flowStation ? ` (${c.flowStation})` : ''}`)
    L.push(`Conditions: ${bits.join('; ')}.`)
  }
  if (r.stops.length) L.push(`Rests: ${r.stops.length} (${r.stops.map(s => `${fmtDur(s.fromT)} for ${Math.round(s.durS)}s`).join(', ')}).`)
  if (r.surges.length) {
    L.push(`Efforts (${r.surges.length}):`)
    r.surges.forEach((s: Segment, i) => {
      L.push(`  ${i + 1}) at ${fmtDur(s.fromT)}, ${fmtDur(s.durS)}, pace ${split500(s.avgSpeed)}/500${s.avgSR != null ? `, ${Math.round(s.avgSR)} spm${s.srCv != null ? ` (${s.srCv.toFixed(0)}% variation)` : ''}` : ''}${s.trend ? `, ${s.trend}` : ''}.`)
    })
  }
  const sets = r.sets.filter(s => s.count > 1)
  if (sets.length) L.push(`Sets detected: ${sets.map(s => `${s.count} × ~${fmtDur(s.avgDurS)} @ ${split500(s.avgSpeed)}/500`).join('; ')}.`)
  if (!r.surges.length) L.push('No distinct efforts — this was a steady paddle.')
  return L.join('\n')
}

interface Insighter { generate(system: string, user: string, model: string): Promise<string> }

class OllamaInsighter implements Insighter {
  async generate(system: string, user: string, model: string): Promise<string> {
    const base = process.env.OLLAMA_URL ?? 'http://localhost:11434'
    const res = await fetch(`${base}/api/chat`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
        stream: false, options: { temperature: 0.6 },
      }),
    })
    if (!res.ok) throw new Error(`ollama ${res.status}`)
    const d = await res.json()
    return (d?.message?.content ?? '').trim()
  }
}

class BedrockInsighter implements Insighter {
  async generate(system: string, user: string, model: string): Promise<string> {
    const { BedrockRuntimeClient, ConverseCommand } = await import('@aws-sdk/client-bedrock-runtime')
    const client = new BedrockRuntimeClient({ region: process.env.BEDROCK_REGION ?? 'eu-west-1' })
    const out = await client.send(new ConverseCommand({
      modelId: model,
      system: [{ text: system }],
      messages: [{ role: 'user', content: [{ text: user }] }],
      inferenceConfig: { maxTokens: 400, temperature: 0.6 },
    }))
    return (out.output?.message?.content?.map(b => ('text' in b ? b.text : '')).join('') ?? '').trim()
  }
}

function makeInsighter(backendOverride?: string): Insighter | null {
  // Prod ALWAYS uses Bedrock (never the Anthropic quota, never Ollama). Local
  // dev picks via LLM_BACKEND (or a per-request override for playing with
  // models); unset → null → deterministic template fallback.
  const backend = process.env.NODE_ENV === 'production' ? 'bedrock' : (backendOverride || process.env.LLM_BACKEND || '')
  if (backend === 'ollama') return new OllamaInsighter()
  if (backend === 'bedrock') return new BedrockInsighter()
  return null
}

// Returns the model-written insight, or null (→ caller keeps the template).
// opts.model / opts.backend let you swap models per request while tuning.
export async function generateInsight(result: AnalysisResult, opts: { model?: string; backend?: string } = {}): Promise<string | null> {
  const insighter = makeInsighter(opts.backend)
  if (!insighter) return null
  const model = opts.model || process.env.LLM_MODEL || 'llama3.2:3b'
  try {
    const text = await insighter.generate(SYSTEM, buildPrompt(result), model)
    return text || null
  } catch (err) {
    console.error('[llm] insight generation failed', err)
    return null
  }
}
