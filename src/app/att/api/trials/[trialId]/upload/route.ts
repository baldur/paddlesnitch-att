import { NextRequest, NextResponse } from 'next/server'
import { nanoid } from 'nanoid'
import { getAuthUser } from '@/lib/auth'
import { getJson, putJson, putObject } from '@/lib/storage'
import { parseTrace } from '@/lib/parse'
import { processTrace, diagnoseGates, type GateDiagnosis } from '@/lib/geo'
import { isBoatClass, validateCrew } from '@/lib/types'
import { dateDiscrepancy, utcDateString } from '@/lib/format'
import { rebuildLeaderboard } from '@/lib/leaderboard'
import { getActivityStreams, streamsToTrack } from '@/lib/strava'
import { getValidStravaTokens } from '@/lib/strava-storage'
import { canSubmitToTrial } from '@/lib/permissions'
import { getUserClubIds } from '@/lib/clubs'
import type { TrialMetadata, CourseMetadata, ProcessedResult, BoatClass, CrewMember, TrackPoint, LatLng } from '@/lib/types'

// Reduce a parsed track to [lat, lng] pairs for the diagnostic map we return
// when processing fails. Strava streams can be many thousands of points; ~1500
// is plenty to show the shape of the track, and keeps the 422 payload bounded.
// The final point is always included so the track's end is drawn accurately.
function trackToLatLngs(track: TrackPoint[], max = 1500): LatLng[] {
  const stride = Math.max(1, Math.ceil(track.length / max))
  const out: LatLng[] = []
  for (let i = 0; i < track.length; i += stride) out.push([track[i].lat, track[i].lng])
  const last = track[track.length - 1]
  if (last && (out.length === 0 || out[out.length - 1][0] !== last.lat || out[out.length - 1][1] !== last.lng)) {
    out.push([last.lat, last.lng])
  }
  return out
}

type StoredEntry = {
  entryId: string
  userId: string
  displayName: string
  submittedAt: string
  filename: string
  raceDate: string                 // ISO date (YYYY-MM-DD) — user-picked
  traceRecordedDate: string        // ISO date — derived from the first GPS point
  dateDiscrepancy: boolean         // true if raceDate and traceRecordedDate differ
  boatClass: BoatClass
  crew: CrewMember[]
  result: ProcessedResult
}

function resolveActivityUrl(url: string): string | null {
  const strava = url.match(/strava\.com\/activities\/(\d+)/)
  if (strava) return `https://www.strava.com/activities/${strava[1]}/export_gpx`
  if (/\.gpx(\?.*)?$/i.test(url)) return url
  return null
}

// Parses the `crew` form field (JSON string in multipart, array in JSON body)
// and normalises the seat values (incoming JSON may have seat: "1" instead of 1).
function parseCrewField(raw: unknown): CrewMember[] | { error: string } {
  let parsed: unknown = raw
  if (typeof raw === 'string') {
    try { parsed = JSON.parse(raw) } catch { return { error: 'crew is not valid JSON' } }
  }
  if (!Array.isArray(parsed)) return { error: 'crew must be an array' }
  const out: CrewMember[] = []
  for (const m of parsed) {
    if (!m || typeof m !== 'object') return { error: 'crew member must be an object' }
    const rec = m as { name?: unknown; seat?: unknown }
    if (typeof rec.name !== 'string') return { error: 'crew member name must be a string' }
    let seat: number | 'C'
    if (rec.seat === 'C' || rec.seat === 'c') seat = 'C'
    else if (typeof rec.seat === 'number' && Number.isInteger(rec.seat) && rec.seat > 0) seat = rec.seat
    else if (typeof rec.seat === 'string' && /^\d+$/.test(rec.seat)) seat = parseInt(rec.seat, 10)
    else return { error: 'crew member seat must be a positive integer or "C"' }
    out.push({ name: rec.name.trim(), seat })
  }
  return out
}

const GENERIC_NO_MATCH = 'Your activity did not cross the course start and finish lines. Make sure your GPS was recording when you passed through both.'

// Turn a gate diagnosis into a specific, actionable message. Falls back to the
// generic line when there's nothing useful to say.
function gateFailureMessage(d: GateDiagnosis): string {
  if (!d.blocking) return GENERIC_NO_MATCH
  const { gateNumber, reason } = d.blocking
  const progress = d.gatesPassed > 0 ? `You passed ${d.gatesPassed} of ${d.total} gates in order. ` : ''
  if (reason === 'wrong_direction') {
    return `${progress}Gate ${gateNumber} was crossed in the opposite direction to what the course requires. Either you passed it the wrong way, or gate ${gateNumber}'s direction is set incorrectly on the course.`
  }
  const where = d.gatesPassed > 0 ? ' after the previous gate' : ''
  return `${progress}Gate ${gateNumber} was not crossed${where}. Make sure your GPS was recording as you passed through every gate, in the right order and direction.`
}

async function processBuffer(
  arrayBuffer: ArrayBuffer,
  filename: string,
  course: CourseMetadata,
  user: { id: string; displayName: string },
  trialId: string,
  boatClass: BoatClass,
  crew: CrewMember[],
  raceDate: string,
): Promise<NextResponse> {
  const parseResult = await parseTrace(filename, arrayBuffer)
  if (!parseResult.ok) {
    return NextResponse.json(
      { error: `Could not parse file: ${parseResult.reason}` },
      { status: 422 }
    )
  }
  return processTrack(parseResult.track, Buffer.from(arrayBuffer), filename, course, user, trialId, boatClass, crew, raceDate)
}

// Shared backend for file uploads, URL fetches, and Strava imports. Takes an
// already-parsed track plus the raw bytes we want to keep on disk for audit.
async function processTrack(
  track: TrackPoint[],
  rawBlob: Buffer,
  filename: string,
  course: CourseMetadata,
  user: { id: string; displayName: string },
  trialId: string,
  boatClass: BoatClass,
  crew: CrewMember[],
  raceDate: string,
): Promise<NextResponse> {
  const result = processTrace(track, course.startLine, course.finishLine, course.type, course.minValidSeconds ?? 0, course.gateDirection, course.gates)
  if (!result) {
    // For gate courses, work out HOW FAR the run got and what blocked the next
    // gate (wrong direction vs never crossed), so the error can be actionable
    // instead of a generic "didn't cross the lines". See issue #66.
    const gateAnalysis = course.type === 'gate' && course.gates && course.gates.length >= 2
      ? diagnoseGates(track, course.gates)
      : undefined
    const message = gateAnalysis ? gateFailureMessage(gateAnalysis) : GENERIC_NO_MATCH

    // Persist the FULL failing track + course geometry so a failure can be
    // reproduced and debugged offline — successful entries are saved, but a
    // trace that doesn't match leaves nothing behind otherwise. Best-effort:
    // a storage hiccup must not turn the user's 422 into a 500. See issue #66.
    try {
      const failureId = nanoid()
      await putJson(`trials/${trialId}/failed-uploads/${user.id}/${failureId}/diagnostic.json`, {
        failedAt: new Date().toISOString(),
        trialId,
        userId: user.id,
        displayName: user.displayName,
        filename,
        course,
        gateAnalysis,
        trackPointCount: track.length,
        track: track.map(p => ({ lat: p.lat, lng: p.lng, timestamp: p.timestamp.toISOString() })),
      })
    } catch (err) {
      console.error('[upload] could not persist failed-upload diagnostic:', err)
    }

    // Hand back the parsed track + course geometry (and gate analysis) so the
    // upload page can show a map of what we recorded against the lines and
    // highlight the blocking gate.
    return NextResponse.json(
      {
        error: message,
        diagnostic: { track: trackToLatLngs(track), course, gateAnalysis },
      },
      { status: 422 }
    )
  }

  // The trace's recorded date is the UTC date of the first track point.
  // If the user-picked race date differs from this, flag a discrepancy.
  const traceRecordedDate = utcDateString(track[0].timestamp)
  const discrepancy = dateDiscrepancy(raceDate, traceRecordedDate)

  const entryId = nanoid()
  const ext = filename.split('.').pop()?.toLowerCase() ?? 'bin'
  const basePath = `trials/${trialId}/entries/${user.id}/${entryId}`

  await putObject(`${basePath}/trace.${ext}`, rawBlob)

  const stored: StoredEntry = {
    entryId,
    userId: user.id,
    displayName: user.displayName,
    submittedAt: new Date().toISOString(),
    filename,
    raceDate,
    traceRecordedDate,
    dateDiscrepancy: discrepancy,
    boatClass,
    crew,
    result,
  }
  await putJson(`${basePath}/result.json`, stored)
  await rebuildLeaderboard(trialId)

  return NextResponse.json({ entryId, result, dateDiscrepancy: discrepancy }, { status: 201 })
}

// raceDate must be YYYY-MM-DD. Returns the normalised string or null if invalid.
function normaliseRaceDate(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null
  const d = new Date(`${raw}T00:00:00Z`)
  if (isNaN(d.getTime())) return null
  return raw
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ trialId: string }> }
) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { trialId } = await params
  const trial = await getJson<TrialMetadata>(`trials/${trialId}/metadata.json`)
  if (!trial) return NextResponse.json({ error: 'Trial not found' }, { status: 404 })
  // Submission gate: combines visibility AND participation. A 404 covers
  // both "can't see" and "can see but not invited" so the route doesn't
  // distinguish — invitational trials don't leak their guest list through
  // a 403 vs 404 split.
  const viewerClubIds = new Set(await getUserClubIds(user.id))
  if (!canSubmitToTrial(trial, user, viewerClubIds)) {
    return NextResponse.json({ error: 'Trial not found' }, { status: 404 })
  }
  if (trial.status !== 'open')
    return NextResponse.json({ error: 'Trial is closed' }, { status: 400 })

  const course = await getJson<CourseMetadata>(`courses/${trial.courseId}/metadata.json`)
  if (!course) return NextResponse.json({ error: 'Course not found' }, { status: 404 })

  const contentType = req.headers.get('content-type') ?? ''

  if (contentType.includes('application/json')) {
    const body = await req.json()
    const { url, stravaActivityId, boatClass, crew: rawCrew, raceDate: rawRaceDate } = body
    if (!url && !stravaActivityId) {
      return NextResponse.json({ error: 'No URL or Strava activity provided' }, { status: 400 })
    }
    if (!isBoatClass(boatClass)) {
      return NextResponse.json({ error: 'Boat class is required' }, { status: 400 })
    }
    const crew = parseCrewField(rawCrew)
    if ('error' in crew) return NextResponse.json({ error: crew.error }, { status: 400 })
    const crewError = validateCrew(boatClass, crew)
    if (crewError) return NextResponse.json({ error: crewError }, { status: 400 })
    const raceDate = normaliseRaceDate(rawRaceDate)
    if (!raceDate) return NextResponse.json({ error: 'Race date is required (YYYY-MM-DD)' }, { status: 400 })

    // Strava-import branch: fetch the user's stored tokens, refresh if needed,
    // pull the streams, hand them straight to processTrack.
    if (stravaActivityId) {
      const idNum = Number(stravaActivityId)
      if (!Number.isFinite(idNum) || idNum <= 0) {
        return NextResponse.json({ error: 'Invalid Strava activity ID' }, { status: 400 })
      }
      const tokens = await getValidStravaTokens(user.id)
      if (!tokens) {
        return NextResponse.json({ error: 'Strava is not connected for this account' }, { status: 409 })
      }
      const streams = await getActivityStreams(tokens.accessToken, idNum)
      if (!streams) {
        return NextResponse.json(
          { error: 'Could not load this Strava activity (no GPS data, or you do not have access).' },
          { status: 422 }
        )
      }
      const track = streamsToTrack(streams.latlng, streams.time, streams.startDate)
      // Persist a JSON snapshot of what we pulled so the entry has the same
      // shape as file/URL uploads (raw trace + result).
      const snapshot = Buffer.from(JSON.stringify({
        source: 'strava',
        activityId: idNum,
        athleteId: tokens.athleteId,
        startDate: streams.startDate,
        latlng: streams.latlng,
        time: streams.time,
      }))
      const filename = `strava-${idNum}.json`
      return processTrack(track, snapshot, filename, course, user, trialId, boatClass, crew, raceDate)
    }

    const resolvedUrl = resolveActivityUrl(url)
    if (!resolvedUrl) {
      return NextResponse.json(
        { error: 'Unsupported URL format. Provide a Strava activity URL or a direct .gpx link.' },
        { status: 422 }
      )
    }

    let fetchRes: Response
    try {
      fetchRes = await fetch(resolvedUrl, {
        headers: { 'User-Agent': 'ATTS/1.0 (paddlesnitch.com)' },
      })
    } catch {
      return NextResponse.json(
        { error: 'Could not fetch activity — make sure it is public' },
        { status: 422 }
      )
    }

    if (!fetchRes.ok) {
      return NextResponse.json(
        { error: 'Could not fetch activity — make sure it is public' },
        { status: 422 }
      )
    }

    const arrayBuffer = await fetchRes.arrayBuffer()
    return processBuffer(arrayBuffer, 'activity.gpx', course, user, trialId, boatClass, crew, raceDate)
  }

  // File upload (multipart/form-data)
  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  const boatClassRaw = formData.get('boatClass')
  if (!isBoatClass(boatClassRaw)) {
    return NextResponse.json({ error: 'Boat class is required' }, { status: 400 })
  }
  const crew = parseCrewField(formData.get('crew'))
  if ('error' in crew) return NextResponse.json({ error: crew.error }, { status: 400 })
  const crewError = validateCrew(boatClassRaw, crew)
  if (crewError) return NextResponse.json({ error: crewError }, { status: 400 })
  const raceDate = normaliseRaceDate(formData.get('raceDate'))
  if (!raceDate) return NextResponse.json({ error: 'Race date is required (YYYY-MM-DD)' }, { status: 400 })

  const arrayBuffer = await file.arrayBuffer()
  return processBuffer(arrayBuffer, file.name, course, user, trialId, boatClassRaw, crew, raceDate)
}
