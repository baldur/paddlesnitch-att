import { NextResponse } from 'next/server'
import { getAuthUser } from '@paddlesnitch/core/auth'
import { getSession } from '@/lib/analysis-store'
import { buildRace } from '@/lib/similar'
import { generateRaceInsight, buildRaceInsight } from '@/lib/llm'
import type { AnalysisSession } from '@/lib/analysis-store'

// POST /analyse/api/analyse/similar/compare — body { sourceId, aIdx, bIdx, sessionIds[] }.
// Builds the race board for the chosen subset over the selected stretch. The
// source is always included as the reference racer. Own paddles only.
export async function POST(req: Request) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const sourceId = body?.sourceId
  const aIdx = Number(body?.aIdx), bIdx = Number(body?.bIdx)
  const sessionIds: unknown = body?.sessionIds
  if (typeof sourceId !== 'string' || !Number.isInteger(aIdx) || !Number.isInteger(bIdx) || !Array.isArray(sessionIds)) {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 })
  }

  const source = await getSession(user.id, sourceId)
  if (!source) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const picked = (await Promise.all(
    (sessionIds as unknown[])
      .filter((id): id is string => typeof id === 'string' && id !== sourceId)
      .map(id => getSession(user.id, id)),
  )).filter((s): s is AnalysisSession => !!s)

  const race = buildRace(source, picked, aIdx, bIdx)
  if ('reason' in race) return NextResponse.json(race, { status: 422 })

  // Coach narrative over the race — reasons about whether wind/flow explain the
  // differences. LLM when a backend is configured, deterministic template
  // otherwise (never blank). Only worth it with ≥2 efforts to compare.
  if (race.racers.length >= 2) {
    const llm = await generateRaceInsight(race)
    race.insight = llm?.text ?? buildRaceInsight(race)
    race.insightModel = llm?.model
  }
  return NextResponse.json({ race })
}
