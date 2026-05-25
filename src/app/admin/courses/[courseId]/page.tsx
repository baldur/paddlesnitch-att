'use client'
import dynamic from 'next/dynamic'
import { useEffect, useState, use } from 'react'
import { useRouter } from 'next/navigation'
import AuthNav from '@/components/AuthNav'
import type { CourseMetadata, TrialMetadata } from '@/lib/types'

const CourseMap = dynamic(() => import('@/components/map/CourseMap'), { ssr: false })

export default function CourseAdminPage({
  params,
}: {
  params: Promise<{ courseId: string }>
}) {
  const { courseId } = use(params)
  const router = useRouter()
  const [course, setCourse] = useState<CourseMetadata | null>(null)
  const [trials, setTrials] = useState<TrialMetadata[]>([])
  const [trialName, setTrialName] = useState('')
  const [trialDate, setTrialDate] = useState(() => new Date().toISOString().split('T')[0])
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch(`/api/courses/${courseId}`)
      .then(r => r.json())
      .then(setCourse)
    fetch(`/api/trials?courseId=${courseId}`)
      .then(r => r.json())
      .then(setTrials)
  }, [courseId])

  const createTrial = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setCreating(true)
    try {
      const res = await fetch('/api/trials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courseId, name: trialName, date: trialDate }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? 'Failed to create trial')
      }
      const trial = await res.json()
      router.push(`/admin/trials/${trial.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      setCreating(false)
    }
  }

  if (!course) {
    return (
      <main className="flex-1 flex items-center justify-center text-[#64748b] text-sm">
        Loading…
      </main>
    )
  }

  const sortedTrials = [...trials].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )

  const inputClass = 'bg-white border border-[#e2e8f0] px-3 py-2 text-[#0f172a] text-sm focus:outline-none focus:border-[#0369a1] transition-colors'

  return (
    <main className="flex-1 flex flex-col">
      <header className="border-b border-[#e2e8f0] px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4 min-w-0">
          <a href="/" className="text-[#64748b] hover:text-[#0369a1] text-sm transition-colors shrink-0">
            ← HOME
          </a>
          <span className="text-[#64748b] shrink-0">/</span>
          <span className="text-[#0f172a] text-sm truncate">{course.name.toUpperCase()}</span>
        </div>
        <nav className="flex gap-4 text-sm text-[#64748b] items-center shrink-0 ml-4">
          <AuthNav />
        </nav>
      </header>

      <div className="flex-1 px-4 py-8 max-w-3xl mx-auto w-full space-y-10">
        <section>
          <h1 className="text-lg font-bold text-[#0f172a] tracking-widest mb-1">
            {course.name.toUpperCase()}
          </h1>
          <p className="text-xs text-[#64748b] mb-4">
            {course.sport.toUpperCase()} · {course.distanceMetres.toLocaleString()} M
            {course.type === 'loop' && ' · LOOP'}
          </p>
          <CourseMap course={course} />
        </section>

        <section>
          <h2 className="text-xs text-[#64748b] tracking-[0.2em] uppercase mb-4">
            Time Trials
          </h2>
          {sortedTrials.length === 0 ? (
            <div className="border border-[#e2e8f0] p-6 text-center text-[#64748b] text-sm">
              No trials yet.
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {sortedTrials.map(t => (
                <a
                  key={t.id}
                  href={`/admin/trials/${t.id}`}
                  className="border border-[#e2e8f0] px-4 py-3 flex items-center justify-between hover:border-[#0369a1] transition-colors group"
                >
                  <div>
                    <div className="text-[#0f172a] text-sm group-hover:text-[#0369a1] transition-colors">
                      {t.name}
                    </div>
                    <div className="text-xs text-[#64748b] mt-0.5">{t.date}</div>
                  </div>
                  <span
                    className={`text-xs px-2 py-0.5 border ${
                      t.status === 'open'
                        ? 'border-[#15803d] text-[#15803d]'
                        : 'border-[#64748b] text-[#64748b]'
                    }`}
                  >
                    {t.status.toUpperCase()}
                  </span>
                </a>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="text-xs text-[#64748b] tracking-[0.2em] uppercase mb-4">
            New Time Trial
          </h2>
          <form onSubmit={createTrial} className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-[#64748b] tracking-widest">TRIAL NAME</label>
                <input
                  type="text"
                  required
                  value={trialName}
                  onChange={e => setTrialName(e.target.value)}
                  placeholder="e.g. Spring 2025"
                  className={inputClass}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-[#64748b] tracking-widest">DATE</label>
                <input
                  type="date"
                  required
                  value={trialDate}
                  onChange={e => setTrialDate(e.target.value)}
                  className={`${inputClass} cursor-pointer`}
                />
                <p className="text-xs text-[#64748b]">Click to open calendar</p>
              </div>
            </div>
            {error && (
              <div className="border border-[#b91c1c] bg-[#fef2f2] px-3 py-2 text-[#b91c1c] text-xs">
                {error}
              </div>
            )}
            <button
              type="submit"
              disabled={creating}
              className="px-6 py-2.5 bg-[#0369a1] text-white font-bold text-sm tracking-widest hover:bg-[#0284c7] disabled:opacity-50 disabled:cursor-not-allowed transition-colors self-start"
            >
              {creating ? 'CREATING…' : 'CREATE TRIAL'}
            </button>
          </form>
        </section>
      </div>
    </main>
  )
}
