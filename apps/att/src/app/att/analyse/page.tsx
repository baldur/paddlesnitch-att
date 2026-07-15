'use client'
import Link from 'next/link'
import { useState, useEffect, useRef } from 'react'
import AnalysisMapClient from '@/components/map/AnalysisMapClient'
import type { AnalysisResult } from '@/lib/analysis'
import { fmtDur, split500 } from '@/lib/analysis'

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
const compass = (d?: number) => (d == null ? '' : COMPASS[Math.round(d / 45) % 8])

// tiny wind rose: arrow points the way the wind blows TOWARD (dir + 180)
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

const PANEL = 'bg-[#0f172a]/95 border border-[#1e293b] backdrop-blur-sm rounded'

export default function AnalysePage() {
  const [file, setFile] = useState<File | null>(null)
  const [dbl, setDbl] = useState(false)
  const [status, setStatus] = useState<'idle' | 'busy'>('idle')
  const [error, setError] = useState('')
  const [res, setRes] = useState<(AnalysisResult & { insightModel?: string }) | null>(null)
  const [model, setModel] = useState('')
  const [metric, setMetric] = useState<'speed' | 'sr'>('speed')
  const [cursor, setCursor] = useState<number | null>(null)
  const [playing, setPlaying] = useState(false)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  const run = async (f: File, double: boolean) => {
    setStatus('busy'); setError('')
    try {
      const fd = new FormData(); fd.append('file', f); fd.append('doubleStrokeRate', String(double))
      if (model.trim()) fd.append('model', model.trim())
      const r = await fetch('/att/api/analyse', { method: 'POST', body: fd })
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? 'Analysis failed')
      setRes(await r.json()); setCursor(null); setPlaying(false)
    } catch (err) { setError(err instanceof Error ? err.message : 'Analysis failed') }
    finally { setStatus('idle') }
  }

  // replay
  useEffect(() => {
    if (!playing || !res) return
    timer.current = setInterval(() => {
      setCursor(c => { const n = (c ?? 0) + 2; if (n >= res.points.length - 1) { setPlaying(false); return res.points.length - 1 } return n })
    }, 60)
    return () => { if (timer.current) clearInterval(timer.current) }
  }, [playing, res])

  const reset = () => { setRes(null); setFile(null); setCursor(null); setPlaying(false); setError('') }

  // ---------- upload state ----------
  if (!res) {
    return (
      <div className="fixed inset-0 bg-[#0b1220] text-[#e2e8f0] flex flex-col items-center justify-center px-4">
        <Link href="/" className="absolute top-4 left-4 text-xs tracking-widest text-[#64748b] hover:text-[#e2e8f0]">← PADDLESNITCH</Link>
        <div className={`${PANEL} w-full max-w-md p-6`}>
          <h1 className="text-lg font-bold tracking-widest">PADDLE ANALYSIS</h1>
          <p className="text-xs text-[#64748b] mt-1 mb-5">Drop a paddle and see what actually happened — pieces, rests, stroke-rate, wind &amp; flow, on an interactive map.</p>
          <label className="text-[10px] text-[#64748b] tracking-widest">GPS FILE (.gpx .fit .tcx .csv .zip)</label>
          <input type="file" accept=".gpx,.fit,.tcx,.csv,.zip" onChange={e => setFile(e.target.files?.[0] ?? null)}
            className="mt-1 block w-full text-sm text-[#e2e8f0] file:bg-[#1e293b] file:text-[#cbd5e1] file:border-0 file:px-3 file:py-1.5 file:mr-3 file:text-xs file:cursor-pointer bg-[#0b1220] border border-[#1e293b] px-3 py-2 rounded" />
          <label className="flex items-center gap-2 text-xs text-[#94a3b8] mt-3">
            <input type="checkbox" checked={dbl} onChange={e => setDbl(e.target.checked)} /> double stroke rate (SUP&nbsp;→&nbsp;kayak)
          </label>
          <input type="text" value={model} onChange={e => setModel(e.target.value)} placeholder="LLM model — e.g. llama3.2:3b (optional)"
            className="mt-3 block w-full text-xs text-[#e2e8f0] bg-[#0b1220] border border-[#1e293b] px-3 py-2 rounded placeholder:text-[#475569]" />
          <button disabled={!file || status === 'busy'} onClick={() => file && run(file, dbl)}
            className="mt-5 w-full px-5 py-2.5 bg-[#0369a1] text-white text-xs font-bold tracking-widest hover:bg-[#0284c7] disabled:opacity-40 rounded">
            {status === 'busy' ? 'ANALYSING…' : 'ANALYSE'}
          </button>
          {error && <div className="mt-3 text-xs text-[#fca5a5] border border-[#7f1d1d] bg-[#450a0a]/40 px-3 py-2 rounded">{error}</div>}
        </div>
      </div>
    )
  }

  // ---------- result: full-screen immersive ----------
  const c = res.conditions
  return (
    <div className="fixed inset-0 bg-[#0b1220] text-[#e2e8f0]">
      <div className="absolute inset-0">
        <AnalysisMapClient points={res.points} stops={res.stops} surges={res.surges} metric={metric} cursor={cursor} />
      </div>

      {/* HUD — top-left */}
      <div className={`${PANEL} absolute top-3 left-3 z-[1000] p-3 max-w-[340px] text-xs`}>
        <div className="flex items-baseline gap-2">
          <span className="text-base font-bold tabular">{fmtDur(res.durationS)}</span>
          <span className="text-[#94a3b8] tabular">{res.distanceKm.toFixed(2)} km</span>
          {res.avgSR != null && <span className="tabular">· ~{Math.round(res.avgSR)} spm{res.strokeRateDoubled && <span className="text-[#64748b]"> ×2</span>}</span>}
          {res.avgDps != null && <span className="text-[#94a3b8] tabular">· {res.avgDps.toFixed(1)} m/str</span>}
        </div>
        {(c?.windKmh != null || c?.flowM3s != null) && (
          <div className="flex items-center gap-3 mt-2 text-[#cbd5e1] tabular">
            {c?.windKmh != null && <span className="flex items-center gap-1"><WindRose dir={c.windDir ?? 0} /> {Math.round(c.windKmh)} km/h {compass(c.windDir)}</span>}
            {c?.flowM3s != null && <span className="text-[#22d3ee]">~~ {c.flowM3s.toFixed(1)} m³/s{c.flowStation ? ` · ${c.flowStation}` : ''}</span>}
          </div>
        )}
        <p className="mt-2 leading-relaxed text-[#e2e8f0] border-l-2 border-[#0369a1] pl-2">{res.insight}</p>
        {res.insightModel && <div className="text-[10px] text-[#64748b] mt-1">narrated by {res.insightModel}</div>}
      </div>

      {/* controls — top-right */}
      <div className="absolute top-3 right-3 z-[1000] flex flex-col items-end gap-2">
        <div className="flex gap-1">
          <button onClick={reset} className={`${PANEL} px-3 py-1.5 text-[10px] tracking-widest text-[#94a3b8] hover:text-[#e2e8f0]`}>NEW FILE</button>
          <Link href="/att" className={`${PANEL} px-3 py-1.5 text-[10px] tracking-widest text-[#94a3b8] hover:text-[#e2e8f0]`}>ATT →</Link>
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
      </div>

      {/* efforts + sets — bottom-left */}
      {(res.surges.length > 0 || res.sets.some(s => s.count > 1)) && (
        <div className={`${PANEL} absolute bottom-3 left-3 z-[1000] p-3 text-xs max-w-[300px] max-h-[42vh] overflow-auto`}>
          {res.sets.some(s => s.count > 1) && (
            <div className="mb-2">
              <div className="text-[10px] text-[#64748b] tracking-widest mb-1">GROUPED</div>
              {res.sets.map((s, i) => (
                <div key={i} className="tabular">{s.count} × ~{fmtDur(s.avgDurS)} @ {split500(s.avgSpeed)}{s.avgSR != null ? `, ~${Math.round(s.avgSR)} spm` : ''}{s.count > 1 && <span className="text-[#0369a1]"> ← set</span>}</div>
              ))}
            </div>
          )}
          {res.surges.length > 0 && <div className="text-[10px] text-[#64748b] tracking-widest mb-1">EFFORTS ({res.surges.length})</div>}
          <div className="flex flex-col gap-0.5 tabular">
            {res.surges.map((s, i) => (
              <div key={i}>
                <span className="text-[#64748b]">#{i + 1} @{fmtDur(s.fromT)}</span> {fmtDur(s.durS)} · {split500(s.avgSpeed)}
                {s.avgSR != null && <> · {Math.round(s.avgSR)}spm{s.srCv != null && ` (${s.srCv.toFixed(0)}%)`}</>}
                {s.trend && <span className="text-[#a78bfa]"> → {s.trend}</span>}
              </div>
            ))}
          </div>
          {res.stops.length > 0 && <div className="mt-2 text-[10px] text-[#64748b]">rests: {res.stops.map(s => `${fmtDur(s.fromT)} (${Math.round(s.durS)}s)`).join(' · ')}</div>}
        </div>
      )}

      {/* replay scrubber — bottom-center */}
      <div className={`${PANEL} absolute bottom-3 left-1/2 -translate-x-1/2 z-[1000] p-2 flex items-center gap-3 w-[min(520px,70vw)]`}>
        <button onClick={() => { if (cursor == null || cursor >= res.points.length - 1) setCursor(0); setPlaying(p => !p) }}
          className="text-sm w-6 text-[#a78bfa]">{playing ? '⏸' : '▶'}</button>
        <input type="range" min={0} max={res.points.length - 1} value={cursor ?? 0}
          onChange={e => { setCursor(Number(e.target.value)); setPlaying(false) }} className="flex-1 accent-[#a78bfa]" />
        <span className="text-[11px] text-[#94a3b8] tabular w-12 text-right">{fmtDur(res.points[cursor ?? 0]?.t ?? 0)}</span>
      </div>
    </div>
  )
}
