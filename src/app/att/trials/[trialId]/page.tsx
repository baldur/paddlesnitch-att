import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getJson } from '@/lib/storage'
import { getAuthUser } from '@/lib/auth'
import { canViewTrial } from '@/lib/permissions'
import { getUserClubIds } from '@/lib/clubs'
import { getPublicProfileLinks } from '@/lib/profile'
import LeaderboardTable from '@/components/leaderboard/LeaderboardTable'
import CourseMapClient from '@/components/map/CourseMapClient'
import AppHeader from '@/components/AppHeader'
import type { TrialMetadata, CourseMetadata, LeaderboardEntry, ProcessedResult } from '@/lib/types'

type StoredEntry = { result: ProcessedResult }

export default async function TrialPage({
  params,
}: {
  params: Promise<{ trialId: string }>
}) {
  const { trialId } = await params
  const trial = await getJson<TrialMetadata>(`trials/${trialId}/metadata.json`)
  if (!trial) notFound()
  // Hide existence of private trials. Anyone who can't view gets the same
  // 404 as a missing trial — no leakage of "this trial exists but you can't
  // see it" through differing copy.
  const viewer = await getAuthUser()
  const viewerClubIds = viewer ? new Set(await getUserClubIds(viewer.id)) : undefined
  if (!canViewTrial(trial, viewer, viewerClubIds)) notFound()

  const [course, leaderboard] = await Promise.all([
    getJson<CourseMetadata>(`courses/${trial.courseId}/metadata.json`),
    getJson<LeaderboardEntry[]>(`trials/${trialId}/leaderboard.json`),
  ])

  const winner = leaderboard?.[0]
  const winnerEntry = winner
    ? await getJson<StoredEntry>(`trials/${trialId}/entries/${winner.userId}/${winner.entryId}/result.json`)
    : null
  const winnerTrack = winnerEntry?.result.trackSegment

  // Link each athlete's name to their profile — but only for paddlers whose
  // profile is public (opt-in), so private profiles never become dead links.
  const profileLinks = Object.fromEntries(
    await getPublicProfileLinks((leaderboard ?? []).map(e => e.userId)),
  )

  return (
    <main className="flex-1 flex flex-col">
      <AppHeader
        breadcrumb={
          <>
            <Link href="/att" className="tt-nav-link text-sm shrink-0">
              ← HOME
            </Link>
            <span className="text-[#64748b] shrink-0">/</span>
            <span className="text-[#0f172a] text-sm truncate">{trial.name.toUpperCase()}</span>
          </>
        }
      >
        {trial.status === 'open' && (
          <a
            href={`/att/trials/${trialId}/upload`}
            className="text-xs bg-[#0369a1] text-white font-bold px-4 py-1.5 tracking-widest hover:bg-[#0284c7] transition-colors"
          >
            UPLOAD TRACE
          </a>
        )}
      </AppHeader>

      <section className="border-b border-[#e2e8f0] px-4 py-8 bg-[#f8fafc]">
        <p className="text-[#64748b] text-xs tracking-[0.2em] uppercase mb-1">
          {course?.name ?? ''}
        </p>
        <h1 className="text-3xl md:text-4xl font-bold text-[#0f172a] tracking-widest mb-1">
          {trial.name.toUpperCase()}
        </h1>
        <div className="flex items-center gap-4 text-xs text-[#64748b]">
          <span>{trial.date}</span>
          {course && (
            <span>
              {course.sport.toUpperCase()} · {course.distanceMetres.toLocaleString()} M
            </span>
          )}
          <span
            className={`px-2 py-0.5 border ${
              trial.status === 'open'
                ? 'border-[#15803d] text-[#15803d]'
                : 'border-[#64748b] text-[#64748b]'
            }`}
          >
            {trial.status.toUpperCase()}
          </span>
        </div>
      </section>

      <div className="flex-1 px-4 py-8 max-w-3xl mx-auto w-full space-y-8">
        {course && (
          <section>
            <h2 className="text-xs text-[#64748b] tracking-[0.2em] uppercase mb-3">Course</h2>
            <CourseMapClient course={course} track={winnerTrack} />
            <div className="flex gap-4 mt-2 text-xs text-[#64748b]">
              <span className="flex items-center gap-1">
                <span className="inline-block w-3 h-0.5 bg-[#15803d]" />
                {course.finishLine ? 'Start' : 'Crossing line'}
              </span>
              {course.finishLine && (
                <span className="flex items-center gap-1">
                  <span className="inline-block w-3 h-0.5 bg-[#b91c1c]" />
                  Finish
                </span>
              )}
              {winnerTrack && (
                <span className="flex items-center gap-1">
                  <span className="inline-block w-3 h-0.5 bg-[#0369a1]" />
                  Leader&apos;s track
                </span>
              )}
            </div>
          </section>
        )}

        <section>
          <h2 className="text-xs text-[#64748b] tracking-[0.2em] uppercase mb-4">
            Leaderboard
          </h2>
          <LeaderboardTable
            entries={leaderboard ?? []}
            uploadHref={trial.status === 'open' ? `/att/trials/${trialId}/upload` : undefined}
            profileLinks={profileLinks}
          />
        </section>
      </div>
    </main>
  )
}
