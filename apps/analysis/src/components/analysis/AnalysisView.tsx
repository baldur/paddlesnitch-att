'use client'
import Link from 'next/link'
import { useState, useEffect, useRef } from 'react'
import AnalysisMapClient from '@/components/map/AnalysisMapClient'
import type { AnalysisResult } from '@/lib/analysis'
import { fmtDur, fmtDurWords, split500 } from '@/lib/analysis'

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
const compass = (d?: number) => (d == null ? '' : COMPASS[Math.round(d / 45) % 8])
const PANEL = 'bg-[#0f172a]/95 border border-[#1e293b] backdrop-blur-sm rounded'

function WindRose({ dir }: { dir: number }) {
  const a = ((dir + 180) * Math.PI) / 180
  const x = Math.sin(a) * 9, y = -Math.cos(a) * 9
  return (
    <svg width="26" height="26" viewBox="-13 -13 26 26" className="inline-block align-middle">
      <circle r="12" fill="#0b1220" stroke="#1e293b" />
      <line x1={-x} y1={-y} x2={x} y2={y} stroke="#a78bfa" strokeWidth="2" />
      <circle cx={x} cy={y} r="3" fill="#a78bfa" />
    </svg>
  )
}

export type ViewData = AnalysisResult & { insightModel?: string; paddledAt?: string; source?: { type: 'file' | 'strava' | 'trial' } }

// The immersive full-screen analysis view. Reused by the live analyse flow and
// the saved-session view. `sessionId` enables the diary notes editor.
export default function AnalysisView({ data, sessionId, initialNote = '', onNewFile }: {
  data: ViewData
  sessionId?: string
  initialNote?: string
  onNewFile?: () => void
}) {
  const [metric, setMetric] = useState<'speed' | 'sr'>('speed')
  const [cursor, setCursor] = useState<number | null>(null)
  const [playing, setPlaying] = useState(false)
  const [note, setNote] = useState(initialNote)
  const [noteState, setNoteState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [showDiary, setShowDiary] = useState(false)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!playing) return
    const id = setInterval(() => {
      setCursor(c => { const n = (c ?? 0) + 2; if (n >= data.points.length - 1) { setPlaying(false); return data.points.length - 1 } return n })
    }, 60)
    timer.current = id
    return () => clearInterval(id)
  }, [playing, data.points.length])

  const saveNote = async () => {
    if (!sessionId) return
    setNoteState('saving')
    try {
      await fetch(`/analyse/api/analyse/sessions/${sessionId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ note }) })
      setNoteState('saved'); setTimeout(() => setNoteState('idle'), 1500)
    } catch { setNoteState('idle') }
  }

  const c = data.conditions
  const paddled = data.paddledAt ? new Date(data.paddledAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : ''

  return (
    <div className="fixed inset-0 bg-[#0b1220] text-[#e2e8f0]">
      <div className="absolute inset-0">
        <AnalysisMapClient points={data.points} stops={data.stops} surges={data.surges} metric={metric} cursor={cursor} />
      </div>

      {/* HUD — top-left */}
      <div className={`${PANEL} absolute top-3 left-3 z-[1000] p-3 max-w-[340px] text-xs`}>
        {paddled && <div className="text-[10px] text-[#64748b] tracking-widest mb-1">{paddled.toUpperCase()}{data.source?.type === 'strava' ? ' · STRAVA' : data.source?.type === 'trial' ? ' · TIME TRIAL' : ''}</div>}
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-base font-bold tabular">{fmtDurWords(data.durationS)}</span>
          <span className="text-[#94a3b8] tabular">{data.distanceKm.toFixed(2)} km</span>
          {data.avgSR != null && <span className="tabular">· ~{Math.round(data.avgSR)} spm{data.strokeRateDoubled && <span className="text-[#64748b]"> ×2</span>}</span>}
          {data.avgDps != null && <span className="text-[#94a3b8] tabular">· {data.avgDps.toFixed(1)} m/str</span>}
        </div>
        {(c?.windKmh != null || c?.flowM3s != null) && (
          <div className="flex items-center gap-3 mt-2 text-[#cbd5e1] tabular">
            {c?.windKmh != null && <span className="flex items-center gap-1"><WindRose dir={c.windDir ?? 0} /> {Math.round(c.windKmh)} km/h {compass(c.windDir)}</span>}
            {c?.flowM3s != null && <span className="text-[#22d3ee]">~~ {c.flowM3s.toFixed(1)} m³/s{c.flowStation ? ` · ${c.flowStation}` : ''}</span>}
          </div>
        )}
        <p className="mt-2 leading-relaxed text-[#e2e8f0] border-l-2 border-[#0369a1] pl-2">{data.insight}</p>
        {data.insightModel && <div className="text-[10px] text-[#64748b] mt-1">narrated by {data.insightModel}</div>}
      </div>

      {/* controls — top-right */}
      <div className="absolute top-3 right-3 z-[1000] flex flex-col items-end gap-2">
        <div className="flex gap-1">
          {onNewFile && <button onClick={onNewFile} className={`${PANEL} px-3 py-1.5 text-[10px] tracking-widest text-[#94a3b8] hover:text-[#e2e8f0]`}>NEW</button>}
          <Link href="/library" className={`${PANEL} px-3 py-1.5 text-[10px] tracking-widest text-[#94a3b8] hover:text-[#e2e8f0]`}>MY PADDLES</Link>
          {sessionId && <button onClick={() => setShowDiary(s => !s)} className={`${PANEL} px-3 py-1.5 text-[10px] tracking-widest ${showDiary ? 'text-[#a78bfa]' : 'text-[#94a3b8] hover:text-[#e2e8f0]'}`}>DIARY</button>}
        </div>
        <div className={`${PANEL} p-1.5 flex items-center gap-1`}>
          <span className="text-[10px] text-[#64748b] tracking-widest px-1">COLOUR</span>
          {(['speed', 'sr'] as const).map(m => (
            <button key={m} onClick={() => setMetric(m)}
              className={`px-2 py-1 text-[10px] tracking-widest rounded ${metric === m ? 'bg-[#0369a1] text-white' : 'text-[#94a3b8] hover:text-[#e2e8f0]'}`}>
              {m === 'speed' ? 'SPEED' : 'RATE'}
            </button>
          ))}
        </div>
        {showDiary && sessionId && (
          <div className={`${PANEL} p-2 w-[280px]`}>
            <div className="text-[10px] text-[#64748b] tracking-widest mb-1">DIARY — how did it feel?</div>
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={5}
              className="w-full text-xs bg-[#0b1220] border border-[#1e293b] rounded p-2 text-[#e2e8f0] resize-none" placeholder="Catch felt sharp today; wind picked up on the way back…" />
            <button onClick={saveNote} disabled={noteState === 'saving'}
              className="mt-1 w-full px-3 py-1.5 text-[10px] tracking-widest bg-[#0369a1] text-white rounded disabled:opacity-40">
              {noteState === 'saving' ? 'SAVING…' : noteState === 'saved' ? 'SAVED ✓' : 'SAVE NOTE'}
            </button>
          </div>
        )}
      </div>

      {/* efforts + sets — bottom-left */}
      {(data.surges.length > 0 || data.sets.some(s => s.count > 1)) && (
        <div className={`${PANEL} absolute bottom-3 left-3 z-[1000] p-3 text-xs max-w-[300px] max-h-[42vh] overflow-auto`}>
          {data.sets.some(s => s.count > 1) && (
            <div className="mb-2">
              <div className="text-[10px] text-[#64748b] tracking-widest mb-1">GROUPED</div>
              {data.sets.map((s, i) => (
                <div key={i} className="tabular">{s.count} × ~{fmtDur(s.avgDurS)} @ {split500(s.avgSpeed)}{s.avgSR != null ? `, ~${Math.round(s.avgSR)} spm` : ''}{s.count > 1 && <span className="text-[#0369a1]"> ← set</span>}</div>
              ))}
            </div>
          )}
          {data.surges.length > 0 && <div className="text-[10px] text-[#64748b] tracking-widest mb-1">EFFORTS ({data.surges.length})</div>}
          <div className="flex flex-col gap-0.5 tabular">
            {data.surges.map((s, i) => (
              <div key={i}>
                <span className="text-[#64748b]">#{i + 1} @{fmtDur(s.fromT)}</span> {fmtDur(s.durS)} · {split500(s.avgSpeed)}
                {s.avgSR != null && <> · {Math.round(s.avgSR)}spm{s.srCv != null && ` (${s.srCv.toFixed(0)}%)`}</>}
                {s.trend && <span className="text-[#a78bfa]"> → {s.trend}</span>}
              </div>
            ))}
          </div>
          {data.stops.length > 0 && <div className="mt-2 text-[10px] text-[#64748b]">rests: {data.stops.map(s => `${fmtDur(s.fromT)} (${Math.round(s.durS)}s)`).join(' · ')}</div>}
        </div>
      )}

      {/* replay scrubber — bottom-center */}
      <div className={`${PANEL} absolute bottom-3 left-1/2 -translate-x-1/2 z-[1000] p-2 flex items-center gap-3 w-[min(460px,60vw)]`}>
        <button onClick={() => { if (cursor == null || cursor >= data.points.length - 1) setCursor(0); setPlaying(p => !p) }} className="text-sm w-6 text-[#a78bfa]">{playing ? '⏸' : '▶'}</button>
        <input type="range" min={0} max={data.points.length - 1} value={cursor ?? 0} onChange={e => { setCursor(Number(e.target.value)); setPlaying(false) }} className="flex-1 accent-[#a78bfa]" />
        <span className="text-[11px] text-[#94a3b8] tabular w-12 text-right">{fmtDur(data.points[cursor ?? 0]?.t ?? 0)}</span>
      </div>
    </div>
  )
}
