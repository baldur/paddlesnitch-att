import Link from 'next/link'
import { getJson } from '@/lib/storage'
import LeaderboardTable from '@/components/leaderboard/LeaderboardTable'
import CourseMapClient from '@/components/map/CourseMapClient'
import AuthNav from '@/components/AuthNav'
import type { TrialMetadata, CourseMetadata, LeaderboardEntry } from '@/lib/types'

export default async function TrialPage({
  params,
}: {
  params: Promise<{ trialId: string }>
}) {
  const { trialId } = await params
  const trial = await getJson<TrialMetadata>(`trials/${trialId}/metadata.json`)
  if (!trial) {
    return (
      <main className="flex-1 flex items-center justify-center text-[#64748b] text-sm">
        Trial not found.
      </main>
    )
  }

  const [course, leaderboard] = await Promise.all([
    getJson<CourseMetadata>(`courses/${trial.courseId}/metadata.json`),
    getJson<LeaderboardEntry[]>(`trials/${trialId}/leaderboard.json`),
  ])

  return (
    <main className="flex-1 flex flex-col">
      <header className="border-b border-[#e2e8f0] px-4 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <Link href="/att" className="text-[#64748b] hover:text-[#0369a1] text-sm transition-colors shrink-0">
            ← HOME
          </Link>
          <span className="text-[#64748b] shrink-0">/</span>
          <span className="text-[#0f172a] text-sm truncate">{trial.name.toUpperCase()}</span>
        </div>
        <nav className="flex gap-3 text-sm text-[#64748b] items-center shrink-0">
          <AuthNav />
          {trial.status === 'open' && (
            <a
              href={`/att/trials/${trialId}/upload`}
              className="text-xs bg-[#0369a1] text-white font-bold px-4 py-1.5 tracking-widest hover:bg-[#0284c7] transition-colors"
            >
              UPLOAD TRACE
            </a>
          )}
        </nav>
      </header>

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
            <CourseMapClient course={course} />
            <div className="flex gap-4 mt-2 text-xs text-[#64748b]">
              <span className="flex items-center gap-1">
                <span className="inline-block w-3 h-0.5 bg-[#15803d]" />
                {course.type === 'loop' ? 'Crossing line' : 'Start'}
              </span>
              {course.type !== 'loop' && (
                <span className="flex items-center gap-1">
                  <span className="inline-block w-3 h-0.5 bg-[#b91c1c]" />
                  Finish
                </span>
              )}
            </div>
          </section>
        )}

        <section>
          <h2 className="text-xs text-[#64748b] tracking-[0.2em] uppercase mb-4">
            Leaderboard
          </h2>
          <LeaderboardTable entries={leaderboard ?? []} />
        </section>
      </div>
    </main>
  )
}
