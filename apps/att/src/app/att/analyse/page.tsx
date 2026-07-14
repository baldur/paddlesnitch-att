'use client'
import Link from 'next/link'
import { useState } from 'react'
import AnalysisMapClient from '@/components/map/AnalysisMapClient'
import type { AnalysisResult } from '@/lib/analysis'
import { fmtDur, split500 } from '@/lib/analysis'

const compass = (d?: number) => (d == null ? '' : ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(d / 45) % 8])

export default function AnalysePage() {
  const [file, setFile] = useState<File | null>(null)
  const [dbl, setDbl] = useState(false)
  const [status, setStatus] = useState<'idle' | 'busy' | 'error'>('idle')
  const [error, setError] = useState('')
  const [res, setRes] = useState<AnalysisResult | null>(null)
  const [metric, setMetric] = useState<'speed' | 'sr'>('speed')

  const run = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!file) return
    setStatus('busy'); setError(''); setRes(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('doubleStrokeRate', String(dbl))
      const r = await fetch('/att/api/analyse', { method: 'POST', body: fd })
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? 'Analysis failed')
      setRes(await r.json()); setStatus('idle')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed'); setStatus('error')
    }
  }

  return (
    <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-6">
      <div className="flex items-baseline justify-between mb-4">
        <h1 className="text-lg font-bold tracking-widest">PADDLE ANALYSIS <span className="text-[#64748b] text-xs">· prototype</span></h1>
        <Link href="/att" className="tt-nav-link text-xs tracking-widest">← HOME</Link>
      </div>

      <form onSubmit={run} className="flex flex-col sm:flex-row sm:items-end gap-3 border border-[#e2e8f0] bg-[#f8fafc] p-4">
        <div className="flex-1">
          <label className="text-xs text-[#64748b] tracking-widest">GPS FILE (.gpx .fit .tcx .csv .zip)</label>
          <input type="file" accept=".gpx,.fit,.tcx,.csv,.zip" onChange={e => setFile(e.target.files?.[0] ?? null)}
            className="mt-1 block w-full text-sm file:bg-[#f1f5f9] file:border-0 file:px-3 file:py-1 file:mr-3 file:text-xs bg-white border border-[#e2e8f0] px-3 py-2" />
        </div>
        <label className="flex items-center gap-2 text-xs text-[#64748b]">
          <input type="checkbox" checked={dbl} onChange={e => setDbl(e.target.checked)} /> double stroke rate (SUP→kayak)
        </label>
        <button type="submit" disabled={!file || status === 'busy'}
          className="px-5 py-2 bg-[#0369a1] text-white text-xs font-bold tracking-widest hover:bg-[#0284c7] disabled:opacity-50">
          {status === 'busy' ? 'ANALYSING…' : 'ANALYSE'}
        </button>
      </form>
      {error && <div className="border border-[#b91c1c] bg-[#fef2f2] text-[#b91c1c] text-xs px-3 py-2 mt-3">{error}</div>}

      {res && (
        <div className="mt-6 flex flex-col gap-4">
          <div className="text-sm tabular text-[#0f172a]">
            <b className="text-base">{fmtDur(res.durationS)}</b> · {res.distanceKm.toFixed(2)} km
            {res.avgSR != null && <> · ~{Math.round(res.avgSR)} spm{res.strokeRateDoubled && <span className="text-[#64748b]"> (×2)</span>}</>}
            {res.avgDps != null && <> · {res.avgDps.toFixed(1)} m/stroke</>}
            {res.conditions?.windKmh != null && <> · <span className="text-[#6d28d9]">wind {Math.round(res.conditions.windKmh)} km/h {compass(res.conditions.windDir)}</span></>}
            {res.conditions?.flowM3s != null && <> · <span className="text-[#0369a1]">flow {res.conditions.flowM3s.toFixed(1)} m³/s{res.conditions.flowStation ? ` · ${res.conditions.flowStation}` : ''}</span></>}
          </div>

          <div className="border-l-2 border-[#0369a1] bg-[#f8fafc] px-4 py-3 text-sm text-[#0f172a]">{res.insight}</div>

          <div>
            <div className="flex items-center gap-2 mb-2 text-xs tracking-widest text-[#64748b]">
              COLOUR BY
              {(['speed', 'sr'] as const).map(m => (
                <button key={m} onClick={() => setMetric(m)}
                  className={`px-2 py-1 border ${metric === m ? 'bg-[#0369a1] text-white border-[#0369a1]' : 'border-[#e2e8f0] text-[#64748b]'}`}>
                  {m === 'speed' ? 'SPEED' : 'STROKE RATE'}
                </button>
              ))}
            </div>
            <AnalysisMapClient points={res.points} stops={res.stops} surges={res.surges} metric={metric} />
          </div>

          {res.sets.length > 0 && (
            <div>
              <h2 className="text-xs text-[#64748b] tracking-widest mb-1">GROUPED</h2>
              {res.sets.map((s, i) => (
                <div key={i} className="text-sm tabular">{s.count} × ~{fmtDur(s.avgDurS)} @ {split500(s.avgSpeed)}/500{s.avgSR != null ? `, ~${Math.round(s.avgSR)} spm` : ''}{s.count > 1 && <span className="text-[#0369a1]"> ← a set</span>}</div>
              ))}
            </div>
          )}

          {res.surges.length > 0 && (
            <div>
              <h2 className="text-xs text-[#64748b] tracking-widest mb-1">EFFORTS ({res.surges.length})</h2>
              <div className="flex flex-col gap-0.5 text-sm tabular">
                {res.surges.map((s, i) => (
                  <div key={i}>
                    <span className="text-[#64748b]">#{i + 1} @{fmtDur(s.fromT)}</span> {fmtDur(s.durS)} · {split500(s.avgSpeed)}/500
                    {s.avgSR != null && <> · {Math.round(s.avgSR)} spm{s.srCv != null && ` (${s.srCv.toFixed(0)}% CV)`}</>}
                    {s.avgDps != null && <> · {s.avgDps.toFixed(1)} m/str</>}
                    {s.trend && <span className="text-[#6d28d9]"> → {s.trend}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
          {res.stops.length > 0 && <div className="text-xs text-[#64748b] tabular">rests: {res.stops.map(s => `${fmtDur(s.fromT)} (${Math.round(s.durS)}s)`).join(' · ')}</div>}
        </div>
      )}
    </main>
  )
}
