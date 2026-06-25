'use client'
import React, { useState } from 'react'
import Link from 'next/link'
import { formatTime } from '@/lib/geo'
import { paceFor500m, speedKmh, speedMs } from '@/lib/format'
import { BOAT_CLASSES, BOAT_CLASS_INFO } from '@/lib/types'
import type { LeaderboardEntry, BoatClass, CrewMember } from '@/lib/types'

// Sort crew so bow comes first, stroke last, cox last of all.
function seatSort(a: CrewMember, b: CrewMember): number {
  if (a.seat === 'C') return 1
  if (b.seat === 'C') return -1
  return (a.seat as number) - (b.seat as number)
}

// Short prefix used on each crew member in the expanded view.
// Sport matters: rowing uses Bow / Stroke, kayak uses Front / Back. hasCox
// is needed because the rowing convention puts cox last but it isn't a
// numbered seat. Reported in #56.
function seatBadge(
  seat: number | 'C',
  total: number,
  hasCox: boolean,
  sport: 'kayak' | 'rowing',
): string {
  if (seat === 'C') return 'C'
  const seatCount = hasCox ? total - 1 : total
  if (sport === 'kayak') {
    if (seat === 1) return 'F'         // Front
    if (seat === seatCount) return 'Bk' // Back (avoid colliding with rowing 'B')
    return String(seat)
  }
  if (seat === 1) return 'B'           // Bow
  if (seat === seatCount) return 'S'   // Stroke
  return String(seat)
}

export default function LeaderboardTable({
  entries,
  uploadHref,
  profileLinks,
}: {
  entries: LeaderboardEntry[]
  // If set, the empty state shows an upload CTA. Only pass for open trials.
  uploadHref?: string
  // userId -> canonical profile path segment (handle or id), present ONLY for
  // paddlers whose profile is public. A name links to its profile when present,
  // otherwise renders as plain text (no dead links to private profiles).
  profileLinks?: Record<string, string>
}) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const [classFilter, setClassFilter] = useState<BoatClass | 'all'>('all')

  if (entries.length === 0) {
    return (
      <div className="border border-[#e2e8f0] p-8 flex flex-col items-center gap-4 text-center text-[#64748b] text-sm">
        <p>
          {uploadHref ? 'No entries yet. Be the first to upload a trace.' : 'No entries.'}
        </p>
        {uploadHref && (
          <a
            href={uploadHref}
            className="px-4 py-2 bg-[#0369a1] text-white text-xs tracking-widest hover:bg-[#0284c7] transition-colors"
          >
            UPLOAD TRACE
          </a>
        )}
      </div>
    )
  }

  // Only show class filter options for classes that actually appear in the data,
  // so the dropdown doesn't lie about what's available.
  const presentClasses = Array.from(new Set(entries.map(e => e.boatClass)))
    .sort((a, b) => BOAT_CLASSES.indexOf(a) - BOAT_CLASSES.indexOf(b))

  const filtered = classFilter === 'all'
    ? entries
    : entries.filter(e => e.boatClass === classFilter)

  return (
    <div className="flex flex-col gap-4">
      {presentClasses.length > 1 && (
        <div className="flex items-center gap-3 text-xs">
          <label className="text-[#64748b] tracking-widest">BOAT CLASS</label>
          <select
            value={classFilter}
            onChange={e => setClassFilter(e.target.value as BoatClass | 'all')}
            className="bg-white border border-[#e2e8f0] px-2 py-1 text-[#0f172a] text-xs focus:outline-none focus:border-[#0369a1] transition-colors"
          >
            <option value="all">All ({entries.length})</option>
            {presentClasses.map(c => {
              const count = entries.filter(e => e.boatClass === c).length
              return <option key={c} value={c}>{c} ({count})</option>
            })}
          </select>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-[#e2e8f0] text-[#64748b] text-xs tracking-wider">
              <th className="text-left py-2 pr-4 font-normal w-8">#</th>
              <th className="text-left py-2 pr-4 font-normal">ATHLETE</th>
              <th className="text-left py-2 pr-4 font-normal">CLASS</th>
              <th className="text-right py-2 pr-4 font-normal">TIME</th>
              <th className="text-right py-2 font-normal hidden sm:table-cell">DATE</th>
              <th className="w-5" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((entry, i) => {
              const hasSplits = entry.splits.length > 0
              const isOpen = expanded === entry.entryId
              return (
                <React.Fragment key={entry.entryId}>
                  <tr
                    onClick={() => hasSplits && setExpanded(isOpen ? null : entry.entryId)}
                    className={`border-b border-[#f1f5f9] transition-colors ${hasSplits ? 'cursor-pointer hover:bg-[#f8fafc]' : ''}`}
                  >
                    <td className="py-3 pr-4 text-[#64748b] tabular">{i + 1}</td>
                    <td className="py-3 pr-4 text-[#0f172a] font-medium">
                      {profileLinks?.[entry.userId] ? (
                        <Link
                          href={`/att/u/${profileLinks[entry.userId]}`}
                          onClick={e => e.stopPropagation()}
                          className="hover:text-[#0369a1] hover:underline transition-colors"
                        >
                          {entry.displayName}
                        </Link>
                      ) : (
                        entry.displayName
                      )}
                      {entry.dateDiscrepancy && (
                        <span
                          title="The race date the athlete picked doesn't match the date in the GPS trace."
                          className="ml-2 text-[10px] tracking-widest text-[#b91c1c] border border-[#b91c1c] px-1.5 py-0.5"
                        >
                          DATE !
                        </span>
                      )}
                    </td>
                    <td className="py-3 pr-4 text-[#64748b] tabular text-xs">{entry.boatClass}</td>
                    <td className="py-3 pr-4 text-right tabular font-bold text-[#0369a1] text-base">
                      {formatTime(entry.totalElapsedSeconds)}
                    </td>
                    <td className="py-3 pr-4 text-right text-[#64748b] text-xs hidden sm:table-cell">
                      {entry.raceDate ?? new Date(entry.submittedAt).toLocaleDateString()}
                    </td>
                    <td className="py-3 text-[#64748b] text-xs text-right">
                      {hasSplits ? (isOpen ? '▲' : '▼') : ''}
                    </td>
                  </tr>
                  {isOpen && (
                    <tr key={`${entry.entryId}-splits`} className="border-b border-[#f1f5f9] bg-[#f8fafc]">
                      <td colSpan={6} className="px-4 py-3">
                        {entry.runCount && entry.runCount > 1 && (
                          <div className="mb-4 text-xs text-[#64748b]">
                            Best of {entry.runCount} runs in this upload — the fastest is shown.
                          </div>
                        )}
                        {entry.crew && entry.crew.length > 1 && (
                          <div className="mb-4">
                            <div className="text-[#64748b] text-xs tracking-wider mb-1.5">CREW</div>
                            <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs">
                              {[...entry.crew].sort(seatSort).map(m => (
                                <span key={String(m.seat)}>
                                  <span className="text-[#64748b] mr-1 tabular">{seatBadge(m.seat, entry.crew.length, !!entry.crew.find(c => c.seat === 'C'), BOAT_CLASS_INFO[entry.boatClass].sport)}</span>
                                  <span className="text-[#0f172a]">{m.name}</span>
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                        <table className="text-xs border-collapse">
                          <thead>
                            <tr className="text-[#64748b] tracking-wider">
                              <th className="text-left pr-8 py-1 font-normal">MARK</th>
                              <th className="text-right pr-8 py-1 font-normal">ELAPSED</th>
                              <th className="text-right pr-8 py-1 font-normal">SPLIT</th>
                              <th className="text-right pr-8 py-1 font-normal">PACE /500M</th>
                              <th className="text-right pr-6 py-1 font-normal">KM/H</th>
                              <th className="text-right py-1 font-normal">M/S</th>
                            </tr>
                          </thead>
                          <tbody>
                            {entry.splits.map((split, idx) => {
                              const prev = idx === 0 ? 0 : entry.splits[idx - 1].elapsedSeconds
                              // Pace and speed for this split are based on the time it took to cover
                              // THIS 500m segment, not the cumulative.
                              const segSecs = split.elapsedSeconds - prev
                              const segDist = idx === 0 ? split.distance : split.distance - entry.splits[idx - 1].distance
                              return (
                                <tr key={split.distance} className="border-b border-[#e2e8f0]">
                                  <td className="pr-8 py-1.5 text-[#64748b]">{split.distance} m</td>
                                  <td className="pr-8 py-1.5 text-right tabular text-[#0f172a]">
                                    {formatTime(split.elapsedSeconds)}
                                  </td>
                                  <td className="pr-8 py-1.5 text-right tabular text-[#6d28d9]">
                                    {formatTime(segSecs)}
                                  </td>
                                  <td className="pr-8 py-1.5 text-right tabular text-[#0369a1]">
                                    {paceFor500m(segDist, segSecs)}
                                  </td>
                                  <td className="pr-6 py-1.5 text-right tabular text-[#0369a1]">
                                    {speedKmh(segDist, segSecs)}
                                  </td>
                                  <td className="py-1.5 text-right tabular text-[#0369a1]">
                                    {speedMs(segDist, segSecs)}
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
