'use client'
import Link from 'next/link'
import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import AuthNav from '@/components/AuthNav'
import type { CourseMetadata } from '@/lib/types'

function NewTrialForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  // Derive directly from searchParams — see CLAUDE.md (useSearchParams anti-pattern note).
  const presetCourseId = searchParams.get('courseId') ?? ''

  const [courses, setCourses] = useState<CourseMetadata[] | null>(null)
  const [courseId, setCourseId] = useState(presetCourseId)
  const [name, setName] = useState('')
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0])
  const [visibility, setVisibility] = useState<'public' | 'private'>('public')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/att/api/courses')
      .then(r => r.json())
      .then(setCourses)
      .catch(() => setError('Could not load courses'))
  }, [])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!courseId) { setError('Pick a course.'); return }
    if (!name.trim()) { setError('Trial name is required.'); return }

    setCreating(true)
    try {
      const res = await fetch('/att/api/trials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courseId, name: name.trim(), date, visibility }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? 'Failed to create trial')
      }
      const trial = await res.json()
      router.push(`/att/admin/trials/${trial.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      setCreating(false)
    }
  }

  const inputClass = 'bg-white border border-[#e2e8f0] px-3 py-2 text-[#0f172a] text-sm focus:outline-none focus:border-[#0369a1] transition-colors'

  const selectedCourse = courses?.find(c => c.id === courseId)

  return (
    <div className="flex-1 px-4 py-8 max-w-2xl mx-auto w-full">
      <h1 className="text-lg font-bold text-[#0f172a] tracking-widest mb-8">CREATE TIME TRIAL</h1>

      <form onSubmit={submit} className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <label className="text-xs text-[#64748b] tracking-widest">COURSE</label>
          {courses === null ? (
            <div className="text-xs text-[#64748b] py-2">Loading courses…</div>
          ) : courses.length === 0 ? (
            <div className="border border-[#e2e8f0] bg-[#f8fafc] px-3 py-3 text-xs text-[#64748b]">
              No courses yet.{' '}
              <Link href="/att/admin/courses/new" className="tt-link">
                Create one
              </Link>{' '}
              to get started.
            </div>
          ) : (
            <>
              <select
                required
                value={courseId}
                onChange={e => setCourseId(e.target.value)}
                className={inputClass}
              >
                <option value="">— Select a course —</option>
                {courses.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.sport}, {c.distanceMetres.toLocaleString()} m)
                  </option>
                ))}
              </select>
              {selectedCourse && (
                <p className="text-xs text-[#64748b]">
                  <Link href={`/att/courses/${selectedCourse.id}`} className="tt-link">
                    View course details
                  </Link>{' '}
                  · or{' '}
                  <Link href="/att/admin/courses/new" className="tt-link">
                    create a new course
                  </Link>
                </p>
              )}
              {!selectedCourse && (
                <p className="text-xs text-[#64748b]">
                  Or{' '}
                  <Link href="/att/admin/courses/new" className="tt-link">
                    create a new course
                  </Link>{' '}
                  if yours isn&apos;t listed.
                </p>
              )}
            </>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-[#64748b] tracking-widest">TRIAL NAME</label>
          <input
            type="text"
            required
            placeholder="e.g. Spring Sprint 2025"
            value={name}
            onChange={e => setName(e.target.value)}
            className={inputClass}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-[#64748b] tracking-widest">DATE</label>
          <input
            type="date"
            required
            value={date}
            onChange={e => setDate(e.target.value)}
            className={`${inputClass} cursor-pointer`}
          />
          <p className="text-xs text-[#64748b]">When the trial takes place. Defaults to today.</p>
        </div>

        {/* Visibility. Public is only offered when the course itself is public —
            otherwise the trial would leak the course's geometry to anyone with
            the link. The server clamps anyway; the UI explains why. */}
        <div className="flex flex-col gap-2">
          <label className="text-xs text-[#64748b] tracking-widest">VISIBILITY</label>
          <div className="flex gap-2">
            {(['public', 'private'] as const).map(v => {
              const disabled = v === 'public' && selectedCourse?.visibility === 'private'
              const active = (selectedCourse?.visibility === 'private' ? 'private' : visibility) === v
              return (
                <button
                  key={v}
                  type="button"
                  disabled={disabled}
                  onClick={() => !disabled && setVisibility(v)}
                  className={`px-4 py-2 text-xs tracking-widest border transition-colors ${
                    active
                      ? 'border-[#0369a1] text-[#0369a1] bg-[#f0f9ff]'
                      : 'border-[#e2e8f0] text-[#64748b] hover:border-[#cbd5e1]'
                  } ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
                >
                  {v.toUpperCase()}
                </button>
              )
            })}
          </div>
          <p className="text-xs text-[#64748b]">
            {selectedCourse?.visibility === 'private'
              ? 'This course is private, so any trial on it must be private too.'
              : visibility === 'public'
                ? 'The leaderboard will be visible to anyone.'
                : 'Only you can see this trial and its leaderboard.'}
          </p>
        </div>

        {error && (
          <div className="border border-[#b91c1c] bg-[#fef2f2] px-3 py-2 text-[#b91c1c] text-xs">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={creating || !courses || courses.length === 0}
          className="px-6 py-2.5 bg-[#0369a1] text-white font-bold text-sm tracking-widest hover:bg-[#0284c7] disabled:opacity-50 disabled:cursor-not-allowed transition-colors self-start"
        >
          {creating ? 'CREATING…' : 'CREATE TRIAL'}
        </button>
      </form>
    </div>
  )
}

export default function NewTrialPage() {
  return (
    <main className="flex-1 flex flex-col">
      <header className="border-b border-[#e2e8f0] px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/att" className="tt-nav-link text-sm">
            ← HOME
          </Link>
          <span className="text-[#64748b]">/</span>
          <span className="text-[#0f172a] text-sm">NEW TRIAL</span>
        </div>
        <nav className="flex gap-4 text-sm text-[#64748b] items-center">
          <AuthNav />
        </nav>
      </header>
      <Suspense fallback={null}>
        <NewTrialForm />
      </Suspense>
    </main>
  )
}
