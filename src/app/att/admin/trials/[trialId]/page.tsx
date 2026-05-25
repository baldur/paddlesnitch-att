'use client'
import Link from 'next/link'
import { useEffect, useState, use } from 'react'
import AuthNav from '@/components/AuthNav'
import type { TrialMetadata, CourseMetadata, LeaderboardEntry } from '@/lib/types'
import { formatTime } from '@/lib/geo'

export default function TrialAdminPage({
  params,
}: {
  params: Promise<{ trialId: string }>
}) {
  const { trialId } = use(params)
  const [trial, setTrial] = useState<TrialMetadata | null>(null)
  const [course, setCourse] = useState<CourseMetadata | null>(null)
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [toggling, setToggling] = useState(false)

  const load = async () => {
    const t = await fetch(`/att/api/trials/${trialId}`).then(r => r.json())
    setTrial(t)
    const [c, lb] = await Promise.all([
      fetch(`/att/api/courses/${t.courseId}`).then(r => r.json()),
      fetch(`/att/api/trials/${trialId}/leaderboard`).then(r => r.json()),
    ])
    setCourse(c)
    setLeaderboard(lb)
  }

  useEffect(() => { load() }, [trialId])

  const toggleStatus = async () => {
    if (!trial) return
    setToggling(true)
    const newStatus = trial.status === 'open' ? 'closed' : 'open'
    const updated = await fetch(`/att/api/trials/${trialId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    }).then(r => r.json())
    setTrial(updated)
    setToggling(false)
  }

  if (!trial || !course) {
    return (
      <main className="flex-1 flex items-center justify-center text-[#64748b] text-sm">
        Loading…
      </main>
    )
  }

  return (
    <main className="flex-1 flex flex-col">
      <header className="border-b border-[#e2e8f0] px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4 min-w-0">
          <Link href="/att" className="text-[#64748b] hover:text-[#0369a1] text-sm transition-colors shrink-0">
            ← HOME
          </Link>
          <span className="text-[#64748b] shrink-0">/</span>
          <a
            href={`/att/admin/courses/${course.id}`}
            className="text-[#64748b] hover:text-[#0369a1] text-sm transition-colors truncate"
          >
            {course.name.toUpperCase()}
          </a>
          <span className="text-[#64748b] shrink-0">/</span>
          <span className="text-[#0f172a] text-sm shrink-0">{trial.name.toUpperCase()}</span>
        </div>
        <nav className="flex gap-4 text-sm text-[#64748b] items-center shrink-0 ml-4">
          <AuthNav />
        </nav>
      </header>

      <div className="flex-1 px-4 py-8 max-w-3xl mx-auto w-full space-y-10">
        <section className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-lg font-bold text-[#0f172a] tracking-widest mb-1">
              {trial.name.toUpperCase()}
            </h1>
            <p className="text-xs text-[#64748b]">
              {course.name} · {trial.date}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <span
              className={`text-xs px-2 py-0.5 border ${
                trial.status === 'open'
                  ? 'border-[#15803d] text-[#15803d]'
                  : 'border-[#64748b] text-[#64748b]'
              }`}
            >
              {trial.status.toUpperCase()}
            </span>
            <button
              onClick={toggleStatus}
              disabled={toggling}
              className={`px-4 py-1.5 text-xs font-bold tracking-widest border transition-colors disabled:opacity-50 ${
                trial.status === 'open'
                  ? 'border-[#b91c1c] text-[#b91c1c] hover:bg-[#b91c1c] hover:text-white'
                  : 'border-[#15803d] text-[#15803d] hover:bg-[#15803d] hover:text-white'
              }`}
            >
              {toggling
                ? '…'
                : trial.status === 'open'
                ? 'CLOSE TRIAL'
                : 'REOPEN TRIAL'}
            </button>
          </div>
        </section>

        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs text-[#64748b] tracking-[0.2em] uppercase">
              Leaderboard ({leaderboard.length} entr{leaderboard.length === 1 ? 'y' : 'ies'})
            </h2>
            {trial.status === 'open' && (
              <a
                href={`/att/trials/${trialId}/upload`}
                className="text-xs text-[#0369a1] hover:underline"
              >
                + Upload entry
              </a>
            )}
          </div>

          {leaderboard.length === 0 ? (
            <div className="border border-[#e2e8f0] p-8 text-center text-[#64748b] text-sm">
              No entries yet.
              {trial.status === 'open' && (
                <>
                  {' '}
                  <a href={`/att/trials/${trialId}/upload`} className="text-[#0369a1] hover:underline">
                    Upload a trace
                  </a>{' '}
                  to get started.
                </>
              )}
            </div>
          ) : (
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-[#e2e8f0] text-[#64748b] text-xs tracking-wider">
                  <th className="text-left py-2 pr-4 font-normal">#</th>
                  <th className="text-left py-2 pr-4 font-normal">ATHLETE</th>
                  <th className="text-right py-2 pr-4 font-normal">TIME</th>
                  <th className="text-right py-2 font-normal">SUBMITTED</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.map((entry, i) => (
                  <tr key={entry.entryId} className="border-b border-[#f1f5f9]">
                    <td className="py-2.5 pr-4 text-[#64748b]">{i + 1}</td>
                    <td className="py-2.5 pr-4 text-[#0f172a]">{entry.displayName}</td>
                    <td className="py-2.5 pr-4 text-right tabular text-[#0369a1] font-bold">
                      {formatTime(entry.totalElapsedSeconds)}
                    </td>
                    <td className="py-2.5 text-right text-[#64748b] text-xs">
                      {new Date(entry.submittedAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="border-t border-[#e2e8f0] pt-6">
          <p className="text-xs text-[#64748b]">
            Public leaderboard:{' '}
            <a href={`/att/trials/${trialId}`} className="text-[#0369a1] hover:underline">
              /att/trials/{trialId}
            </a>
          </p>
        </section>
      </div>
    </main>
  )
}
