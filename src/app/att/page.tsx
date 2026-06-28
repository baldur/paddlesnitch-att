import Link from 'next/link'
import { getJson, listKeys } from '@/lib/storage'
import { getAuthUser } from '@/lib/auth'
import { isListedForViewer } from '@/lib/permissions'
import { getUserClubIds } from '@/lib/clubs'
import AuthNav from '@/components/AuthNav'
import type { TrialMetadata, CourseMetadata, AuthUser } from '@/lib/types'

// Reads live trial state from storage on every request — never prerender.
// Without this, `next build` tries to fetch from S3 at build time and fails
// when AWS credentials / bucket aren't available in CI.
export const dynamic = 'force-dynamic'

async function getOpenTrials(viewer: AuthUser | null) {
  const viewerClubIds = viewer ? new Set(await getUserClubIds(viewer.id)) : undefined
  const keys = await listKeys('trials/')
  const metaKeys = keys.filter(
    k => k.endsWith('metadata.json') && !k.includes('/entries/')
  )
  const trials = (
    await Promise.all(metaKeys.map(k => getJson<TrialMetadata>(k)))
  ).filter((t): t is TrialMetadata => t !== null && t.status === 'open')
    .filter(t => isListedForViewer(t, viewer, viewerClubIds))
    // Order by event date (newest first), tie-broken by creation time — so the
    // list isn't in storage-key (nanoid) order. Matches the createdAt-desc
    // ordering the course-detail trial lists already use (#103). ISO date and
    // timestamp strings sort correctly lexicographically.
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))

  return Promise.all(
    trials.map(async trial => {
      const course = await getJson<CourseMetadata>(
        `courses/${trial.courseId}/metadata.json`
      )
      return { trial, course }
    })
  )
}

export default async function Home() {
  const viewer = await getAuthUser()
  const openTrials = await getOpenTrials(viewer)

  return (
    <main className="flex-1 flex flex-col">
      <header className="border-b border-[#e2e8f0] px-4 py-3 flex items-center justify-between">
        <div>
          <span className="text-[#0f172a] font-bold text-lg tracking-widest">ATT</span>
          <span className="text-[#64748b] text-xs tracking-widest ml-3 hidden sm:inline">paddlesnitch.com</span>
        </div>
        <nav className="flex gap-4 text-sm text-[#64748b] items-center">
          <Link href="/att/courses" className="tt-nav-link">
            COURSES
          </Link>
          <Link href="/att/clubs" className="tt-nav-link">
            CLUBS
          </Link>
          <Link href="/att/admin/trials/new" className="tt-nav-link">
            + NEW TRIAL
          </Link>
          <AuthNav />
        </nav>
      </header>

      <section className="border-b border-[#e2e8f0] px-4 py-12 text-center bg-[#f8fafc]">
        <p className="text-[#64748b] text-xs tracking-[0.3em] uppercase mb-3">
          GPS-verified river racing
        </p>
        <h1 className="text-4xl md:text-5xl font-bold text-[#0f172a] mb-2">
          Automated Time Trials
        </h1>
        <p className="text-[#64748b] text-sm">Upload your trace. See your splits.</p>
      </section>

      <section className="flex-1 px-4 py-8 max-w-3xl mx-auto w-full">
        <h2 className="text-xs text-[#64748b] tracking-[0.2em] uppercase mb-6">
          Open Time Trials
        </h2>
        {openTrials.length === 0 ? (
          <div className="border border-[#e2e8f0] p-8 text-center text-[#64748b] text-sm">
            No open trials yet.{' '}
            <Link href="/att/admin/trials/new" className="tt-link">
              Open a trial
            </Link>{' '}
            to get started.
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {openTrials.map(({ trial, course }) => (
              <a
                key={trial.id}
                href={`/att/trials/${trial.id}`}
                className="border border-[#e2e8f0] px-4 py-4 flex items-center justify-between hover:border-[#0369a1] transition-colors group"
              >
                <div>
                  <div className="text-[#0f172a] font-bold group-hover:text-[#0369a1] transition-colors">
                    {trial.name}
                  </div>
                  <div className="text-xs text-[#64748b] mt-0.5">
                    {course?.name ?? 'Unknown course'} · {trial.date}
                    {course && ` · ${course.sport}`}
                  </div>
                </div>
                <span className="text-xs border border-[#15803d] text-[#15803d] px-2 py-0.5">
                  OPEN
                </span>
              </a>
            ))}
          </div>
        )}
        <div className="mt-8 text-center">
          <Link href="/att/courses" className="tt-nav-link text-xs tracking-widest">
            BROWSE ALL COURSES →
          </Link>
        </div>
      </section>
    </main>
  )
}
