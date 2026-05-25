'use client'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import AuthNav from '@/components/AuthNav'
import { haversine } from '@/lib/geo'
import type { LatLng, Line } from '@/lib/types'

const DrawingMap = dynamic(() => import('@/components/map/DrawingMap'), { ssr: false })

export default function NewCoursePage() {
  const router = useRouter()
  const [courseType, setCourseType] = useState<'one_way' | 'loop'>('one_way')
  const [startLine, setStartLine] = useState<Line | undefined>()
  const [finishLine, setFinishLine] = useState<Line | undefined>()
  const [distanceMetres, setDistanceMetres] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const nameRef = useRef<HTMLInputElement>(null)
  const sportRef = useRef<HTMLSelectElement>(null)

  const handleMapChange = (lines: { startLine?: Line; finishLine?: Line }) => {
    setStartLine(lines.startLine)
    setFinishLine(lines.finishLine)
    if (courseType === 'loop') {
      if (lines.startLine) {
        setDistanceMetres(null) // distance not calculable for loop without finish
      } else {
        setDistanceMetres(null)
      }
    } else {
      if (lines.startLine && lines.finishLine) {
        const mid = (line: Line): LatLng => [
          (line[0][0] + line[1][0]) / 2,
          (line[0][1] + line[1][1]) / 2,
        ]
        setDistanceMetres(Math.round(haversine(mid(lines.startLine), mid(lines.finishLine))))
      } else {
        setDistanceMetres(null)
      }
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!startLine) {
      setError(courseType === 'loop'
        ? 'Crossing line must be drawn on the map.'
        : 'Both start and finish lines must be drawn on the map.')
      return
    }
    if (courseType === 'one_way' && !finishLine) {
      setError('Both start and finish lines must be drawn on the map.')
      return
    }

    const name = nameRef.current?.value.trim()
    const sport = sportRef.current?.value

    if (!name || !sport) {
      setError('All fields are required.')
      return
    }

    // For one_way, use calculated distance; for loop, use 0 as placeholder
    const dist = courseType === 'one_way' ? distanceMetres ?? 0 : 0

    setSaving(true)
    try {
      const res = await fetch('/api/courses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          sport,
          type: courseType,
          startLine,
          finishLine: courseType === 'one_way' ? finishLine : undefined,
          distanceMetres: dist,
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? 'Failed to create course')
      }
      const course = await res.json()
      router.push(`/admin/courses/${course.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      setSaving(false)
    }
  }

  const inputClass = 'bg-white border border-[#e2e8f0] px-3 py-2 text-[#0f172a] text-sm focus:outline-none focus:border-[#0369a1] transition-colors'

  return (
    <main className="flex-1 flex flex-col">
      <header className="border-b border-[#e2e8f0] px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/" className="text-[#64748b] hover:text-[#0369a1] text-sm transition-colors">
            ← HOME
          </Link>
          <span className="text-[#64748b]">/</span>
          <span className="text-[#0f172a] text-sm">NEW COURSE</span>
        </div>
        <nav className="flex gap-4 text-sm text-[#64748b] items-center">
          <AuthNav />
        </nav>
      </header>

      <div className="flex-1 px-4 py-8 max-w-2xl mx-auto w-full">
        <h1 className="text-lg font-bold text-[#0f172a] tracking-widest mb-8">
          CREATE COURSE
        </h1>

        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-[#64748b] tracking-widest">COURSE NAME</label>
            <input
              ref={nameRef}
              type="text"
              required
              placeholder="e.g. Thames — Henley Reach"
              className={inputClass}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-[#64748b] tracking-widest">SPORT</label>
            <select
              ref={sportRef}
              required
              className={inputClass}
            >
              <option value="kayak">Kayak</option>
              <option value="rowing">Rowing</option>
              <option value="both">Both</option>
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-[#64748b] tracking-widest">COURSE TYPE</label>
            <div className="flex gap-4 mt-1">
              <label className="flex items-center gap-2 text-sm text-[#0f172a] cursor-pointer">
                <input
                  type="radio"
                  name="courseType"
                  value="one_way"
                  checked={courseType === 'one_way'}
                  onChange={() => { setCourseType('one_way'); setStartLine(undefined); setFinishLine(undefined); setDistanceMetres(null) }}
                  className="accent-[#0369a1]"
                />
                One-way (separate start &amp; finish lines)
              </label>
              <label className="flex items-center gap-2 text-sm text-[#0f172a] cursor-pointer">
                <input
                  type="radio"
                  name="courseType"
                  value="loop"
                  checked={courseType === 'loop'}
                  onChange={() => { setCourseType('loop'); setStartLine(undefined); setFinishLine(undefined); setDistanceMetres(null) }}
                  className="accent-[#0369a1]"
                />
                Loop (single crossing line)
              </label>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs text-[#64748b] tracking-widest">
              {courseType === 'loop' ? 'CROSSING LINE' : 'START / FINISH LINES'}
            </label>
            <p className="text-xs text-[#64748b]">
              {courseType === 'loop'
                ? 'Click "SET CROSSING LINE" then click 2 points across the river.'
                : 'Click "SET START LINE" then click 2 points across the river. Repeat for the finish line.'}
            </p>
            <DrawingMap onChange={handleMapChange} courseType={courseType} />
            <div className="flex gap-4 text-xs">
              <span className={startLine ? 'text-[#15803d]' : 'text-[#64748b]'}>
                {courseType === 'loop'
                  ? (startLine ? '✓ Crossing line set' : '○ Crossing line not set')
                  : (startLine ? '✓ Start line set' : '○ Start line not set')}
              </span>
              {courseType === 'one_way' && (
                <span className={finishLine ? 'text-[#b91c1c]' : 'text-[#64748b]'}>
                  {finishLine ? '✓ Finish line set' : '○ Finish line not set'}
                </span>
              )}
              {distanceMetres && courseType === 'one_way' && (
                <span className="text-[#6d28d9]">
                  ~{distanceMetres.toLocaleString()} m
                </span>
              )}
            </div>
          </div>

          {error && (
            <div className="border border-[#b91c1c] bg-[#fef2f2] px-3 py-2 text-[#b91c1c] text-xs">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2.5 bg-[#0369a1] text-white font-bold text-sm tracking-widest hover:bg-[#0284c7] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? 'SAVING…' : 'CREATE COURSE'}
          </button>
        </form>
      </div>
    </main>
  )
}
