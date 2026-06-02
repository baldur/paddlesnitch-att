'use client'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import AuthNav from '@/components/AuthNav'
import { haversine } from '@/lib/geo'
import type { LatLng, Line } from '@/lib/types'

const DrawingMap = dynamic(() => import('@/components/map/DrawingMap'), { ssr: false })

type CourseTypeInput = 'point_to_point' | 'loop' | 'gate'
type GateData = Array<{ line: Line; direction: 1 | -1 }>

type CourseTypeOption = {
  value: CourseTypeInput
  label: string
  linesLabel: string
  summary: string
  detail: string
}

const COURSE_TYPES: CourseTypeOption[] = [
  {
    value: 'point_to_point',
    label: 'Point to Point',
    linesLabel: '2 lines',
    summary: 'Separate start and finish at different locations.',
    detail: 'Draw a start line and a finish line. The clock starts when the athlete crosses the start line and stops when they cross the finish line. Use this for straight stretches of river where start and finish are in different places.',
  },
  {
    value: 'loop',
    label: 'Loop',
    linesLabel: '1 line',
    summary: 'Cross the same line twice — go out, do your course, come back through.',
    detail: 'Draw one line. The clock starts when the athlete crosses it for the first time and stops the next time they cross it, regardless of direction. Works for out-and-back courses, circular loops, or any course where athletes return through the same line. Set a minimum time to filter out false starts from warmup crossings.',
  },
  {
    value: 'gate',
    label: 'Gate',
    linesLabel: '2+ gates',
    summary: 'Ordered gates each with a crossing direction — proves athletes navigated the full course correctly.',
    detail: 'Add a start gate and finish gate (minimum), plus any intermediate gates around turning buoys. Each gate is a drawn line with a direction; athletes must cross every gate in the defined direction, in order. The clock starts at gate 1 and stops at the last gate. Athletes who miss a gate or cross in the wrong direction are automatically disqualified.',
  },
]

const midpoint = (line: Line): LatLng => [(line[0][0] + line[1][0]) / 2, (line[0][1] + line[1][1]) / 2]

export default function NewCoursePage() {
  const router = useRouter()
  const [courseType, setCourseType] = useState<CourseTypeInput>('point_to_point')
  const [startLine, setStartLine] = useState<Line | undefined>()
  const [finishLine, setFinishLine] = useState<Line | undefined>()
  const [gates, setGates] = useState<GateData | undefined>()
  const [distanceMetres, setDistanceMetres] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const nameRef = useRef<HTMLInputElement>(null)
  const sportRef = useRef<HTMLSelectElement>(null)
  const distanceRef = useRef<HTMLInputElement>(null)
  const minValidSecondsRef = useRef<HTMLInputElement>(null)

  const isP2P = courseType === 'point_to_point'
  const isGate = courseType === 'gate'

  const handleMapChange = (state: { startLine?: Line; finishLine?: Line; gateDirection?: 1 | -1; gates?: GateData }) => {
    setStartLine(state.startLine)
    setFinishLine(state.finishLine)
    setGates(state.gates)
    if (isP2P && state.startLine && state.finishLine) {
      setDistanceMetres(Math.round(haversine(midpoint(state.startLine), midpoint(state.finishLine))))
    } else if (isGate && state.gates && state.gates.length >= 2) {
      const first = state.gates[0].line
      const last = state.gates[state.gates.length - 1].line
      setDistanceMetres(Math.round(haversine(midpoint(first), midpoint(last))))
    } else {
      setDistanceMetres(null)
    }
  }

  const handleTypeChange = (type: CourseTypeInput) => {
    setCourseType(type)
    setStartLine(undefined)
    setFinishLine(undefined)
    setGates(undefined)
    setDistanceMetres(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (isGate) {
      if (!gates || gates.length < 2) {
        setError('Draw all gate lines on the map before saving.')
        return
      }
    } else {
      if (!startLine) {
        setError(isP2P
          ? 'Draw both start and finish lines on the map before saving.'
          : 'Draw the crossing line on the map before saving.')
        return
      }
      if (isP2P && !finishLine) {
        setError('Draw the finish line on the map before saving.')
        return
      }
    }

    const name = nameRef.current?.value.trim()
    const sport = sportRef.current?.value
    if (!name || !sport) { setError('All fields are required.'); return }

    const dist = courseType === 'loop'
      ? (distanceRef.current?.value ? parseInt(distanceRef.current.value, 10) : 0)
      : (distanceMetres ?? 0)

    setSaving(true)
    try {
      const res = await fetch('/att/api/courses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name, sport,
          type: courseType,
          ...(isGate ? { gates } : { startLine }),
          ...(isP2P ? { finishLine } : {}),
          distanceMetres: dist,
          minValidSeconds: minValidSecondsRef.current?.value ? parseInt(minValidSecondsRef.current.value, 10) : undefined,
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? 'Failed to create course')
      }
      const course = await res.json()
      router.push(`/att/admin/courses/${course.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      setSaving(false)
    }
  }

  const inputClass = 'bg-white border border-[#e2e8f0] px-3 py-2 text-[#0f172a] text-sm focus:outline-none focus:border-[#0369a1] transition-colors'
  const selectedType = COURSE_TYPES.find(t => t.value === courseType)!

  return (
    <main className="flex-1 flex flex-col">
      <header className="border-b border-[#e2e8f0] px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/att" className="tt-nav-link text-sm">
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
        <h1 className="text-lg font-bold text-[#0f172a] tracking-widest mb-8">CREATE COURSE</h1>

        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          {/* Name */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-[#64748b] tracking-widest">COURSE NAME</label>
            <input ref={nameRef} type="text" required placeholder="e.g. Thames — Henley Reach" className={inputClass} />
          </div>

          {/* Sport */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-[#64748b] tracking-widest">SPORT</label>
            <select ref={sportRef} required className={inputClass}>
              <option value="kayak">Kayak</option>
              <option value="rowing">Rowing</option>
              <option value="both">Both</option>
            </select>
          </div>

          {/* Course type */}
          <div className="flex flex-col gap-2">
            <label className="text-xs text-[#64748b] tracking-widest">COURSE TYPE</label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {COURSE_TYPES.map(t => (
                <label
                  key={t.value}
                  className={`flex flex-col gap-1.5 border p-3 cursor-pointer transition-colors ${
                    courseType === t.value
                      ? 'border-[#0369a1] bg-[#f0f9ff]'
                      : 'border-[#e2e8f0] hover:border-[#94a3b8]'
                  }`}
                >
                  <input
                    type="radio"
                    name="courseType"
                    value={t.value}
                    checked={courseType === t.value}
                    onChange={() => handleTypeChange(t.value)}
                    className="sr-only"
                  />
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-[#0f172a]">{t.label}</span>
                    <span className="text-[10px] tracking-widest text-[#64748b] border border-[#e2e8f0] px-1.5 py-0.5 whitespace-nowrap">
                      {t.linesLabel}
                    </span>
                  </div>
                  <p className="text-xs text-[#64748b]">{t.summary}</p>
                </label>
              ))}
            </div>
            <div className="border border-[#e2e8f0] bg-[#f8fafc] px-3 py-3 text-xs text-[#64748b] leading-relaxed">
              <span className="font-bold text-[#0f172a]">{selectedType.label}: </span>
              {selectedType.detail}
            </div>
          </div>

          {/* Map */}
          <div className="flex flex-col gap-2">
            <label className="text-xs text-[#64748b] tracking-widest">
              {isP2P ? 'START / FINISH LINES' : isGate ? 'GATES' : 'CROSSING LINE'}
            </label>
            <DrawingMap onChange={handleMapChange} courseType={courseType} />
            <div className="flex gap-4 text-xs flex-wrap">
              {isGate ? (
                <span className={gates ? 'text-[#15803d]' : 'text-[#64748b]'}>
                  {gates ? `✓ ${gates.length} gates set` : '○ Gates not complete'}
                </span>
              ) : (
                <>
                  <span className={startLine ? (isP2P ? 'text-[#15803d]' : 'text-[#7c3aed]') : 'text-[#64748b]'}>
                    {isP2P
                      ? (startLine ? '✓ Start line set' : '○ Start line not set')
                      : (startLine ? '✓ Crossing line set' : '○ Crossing line not set')}
                  </span>
                  {isP2P && (
                    <span className={finishLine ? 'text-[#b91c1c]' : 'text-[#64748b]'}>
                      {finishLine ? '✓ Finish line set' : '○ Finish line not set'}
                    </span>
                  )}
                </>
              )}
              {distanceMetres != null && courseType !== 'loop' && (
                <span className="text-[#6d28d9]">~{distanceMetres.toLocaleString()} m</span>
              )}
            </div>
          </div>

          {/* Manual distance (loop only) */}
          {courseType === 'loop' && (
            <div className="flex flex-col gap-1">
              <label className="text-xs text-[#64748b] tracking-widest">COURSE DISTANCE (METRES) — OPTIONAL</label>
              <input ref={distanceRef} type="number" min={0} placeholder="e.g. 1000" className={inputClass} />
              <p className="text-xs text-[#64748b]">Nominal course length shown on the leaderboard. Leave blank if unknown.</p>
            </div>
          )}

          {/* Minimum valid time */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-[#64748b] tracking-widest">MINIMUM VALID TIME (SECONDS) — OPTIONAL</label>
            <input ref={minValidSecondsRef} type="number" min={0} placeholder="e.g. 300" className={inputClass} />
            <p className="text-xs text-[#64748b]">
              Ignore results shorter than this. Useful for loop courses where warmup crossings could be mistaken for a race.
            </p>
          </div>

          {error && (
            <div className="border border-[#b91c1c] bg-[#fef2f2] px-3 py-2 text-[#b91c1c] text-xs">{error}</div>
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
