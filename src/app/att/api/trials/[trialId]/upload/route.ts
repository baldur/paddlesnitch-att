import { NextRequest, NextResponse } from 'next/server'
import { nanoid } from 'nanoid'
import { getAuthUser } from '@/lib/auth'
import { getJson, putJson, putObject, listKeys } from '@/lib/storage'
import { parseTrace } from '@/lib/parse'
import { processTrace } from '@/lib/geo'
import { isBoatClass } from '@/lib/types'
import type { TrialMetadata, CourseMetadata, LeaderboardEntry, ProcessedResult, BoatClass } from '@/lib/types'

type StoredEntry = {
  entryId: string
  userId: string
  displayName: string
  submittedAt: string
  filename: string
  boatClass: BoatClass
  result: ProcessedResult
}

async function rebuildLeaderboard(trialId: string): Promise<void> {
  const keys = await listKeys(`trials/${trialId}/entries/`)
  const resultKeys = keys.filter(k => k.endsWith('result.json'))
  const entries = (
    await Promise.all(resultKeys.map(k => getJson<StoredEntry>(k)))
  ).filter((e): e is StoredEntry => e !== null && e.result !== null)

  const leaderboard: LeaderboardEntry[] = entries
    .map(e => ({
      entryId: e.entryId,
      userId: e.userId,
      displayName: e.displayName,
      submittedAt: e.submittedAt,
      boatClass: e.boatClass,
      totalElapsedSeconds: e.result.totalElapsedSeconds,
      splits: e.result.splits,
    }))
    .sort((a, b) => a.totalElapsedSeconds - b.totalElapsedSeconds)

  await putJson(`trials/${trialId}/leaderboard.json`, leaderboard)
}

function resolveActivityUrl(url: string): string | null {
  const strava = url.match(/strava\.com\/activities\/(\d+)/)
  if (strava) return `https://www.strava.com/activities/${strava[1]}/export_gpx`
  if (/\.gpx(\?.*)?$/i.test(url)) return url
  return null
}

async function processBuffer(
  arrayBuffer: ArrayBuffer,
  filename: string,
  course: CourseMetadata,
  user: { id: string; displayName: string },
  trialId: string,
  boatClass: BoatClass,
): Promise<NextResponse> {
  const parseResult = await parseTrace(filename, arrayBuffer)

  if (!parseResult.ok) {
    return NextResponse.json(
      { error: `Could not parse file: ${parseResult.reason}` },
      { status: 422 }
    )
  }

  const result = processTrace(parseResult.track, course.startLine, course.finishLine, course.type, course.minValidSeconds ?? 0, course.gateDirection, course.gates)
  if (!result) {
    return NextResponse.json(
      { error: 'Your activity did not cross the course start and finish lines. Make sure your GPS was recording when you passed through both.' },
      { status: 422 }
    )
  }

  const entryId = nanoid()
  const ext = filename.split('.').pop()?.toLowerCase() ?? 'gpx'
  const basePath = `trials/${trialId}/entries/${user.id}/${entryId}`

  await putObject(`${basePath}/trace.${ext}`, Buffer.from(arrayBuffer))

  const stored: StoredEntry = {
    entryId,
    userId: user.id,
    displayName: user.displayName,
    submittedAt: new Date().toISOString(),
    filename,
    boatClass,
    result,
  }
  await putJson(`${basePath}/result.json`, stored)
  await rebuildLeaderboard(trialId)

  return NextResponse.json({ entryId, result }, { status: 201 })
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
  if (trial.status !== 'open')
    return NextResponse.json({ error: 'Trial is closed' }, { status: 400 })

  const course = await getJson<CourseMetadata>(`courses/${trial.courseId}/metadata.json`)
  if (!course) return NextResponse.json({ error: 'Course not found' }, { status: 404 })

  const contentType = req.headers.get('content-type') ?? ''

  if (contentType.includes('application/json')) {
    const body = await req.json()
    const { url, boatClass } = body
    if (!url) return NextResponse.json({ error: 'No URL provided' }, { status: 400 })
    if (!isBoatClass(boatClass)) {
      return NextResponse.json({ error: 'Boat class is required' }, { status: 400 })
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
    return processBuffer(arrayBuffer, 'activity.gpx', course, user, trialId, boatClass)
  }

  // File upload (multipart/form-data)
  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  const boatClassRaw = formData.get('boatClass')
  if (!isBoatClass(boatClassRaw)) {
    return NextResponse.json({ error: 'Boat class is required' }, { status: 400 })
  }

  const arrayBuffer = await file.arrayBuffer()
  return processBuffer(arrayBuffer, file.name, course, user, trialId, boatClassRaw)
}
