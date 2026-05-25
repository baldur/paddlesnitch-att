'use client'
import { useState } from 'react'
import { formatTime } from '@/lib/geo'
import type { LeaderboardEntry } from '@/lib/types'

export default function LeaderboardTable({ entries }: { entries: LeaderboardEntry[] }) {
  const [expanded, setExpanded] = useState<string | null>(null)

  if (entries.length === 0) {
    return (
      <div className="border border-[#e2e8f0] p-8 text-center text-[#64748b] text-sm">
        No entries yet. Be the first to upload a trace.
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-[#e2e8f0] text-[#64748b] text-xs tracking-wider">
            <th className="text-left py-2 pr-4 font-normal w-8">#</th>
            <th className="text-left py-2 pr-4 font-normal">ATHLETE</th>
            <th className="text-right py-2 pr-4 font-normal">TIME</th>
            <th className="text-right py-2 pr-4 font-normal hidden sm:table-cell">AVG HR</th>
            <th className="text-right py-2 pr-4 font-normal hidden sm:table-cell">AVG SPM</th>
            <th className="text-right py-2 font-normal hidden sm:table-cell">DATE</th>
            <th className="w-5" />
          </tr>
        </thead>
        <tbody>
          {entries.map((entry, i) => {
            const hasSplits = entry.splits.length > 0
            const isOpen = expanded === entry.entryId
            return (
              <>
                <tr
                  key={entry.entryId}
                  onClick={() => hasSplits && setExpanded(isOpen ? null : entry.entryId)}
                  className={`border-b border-[#f1f5f9] transition-colors ${hasSplits ? 'cursor-pointer hover:bg-[#f8fafc]' : ''}`}
                >
                  <td className="py-3 pr-4 text-[#64748b] tabular">{i + 1}</td>
                  <td className="py-3 pr-4 text-[#0f172a] font-medium">{entry.displayName}</td>
                  <td className="py-3 pr-4 text-right tabular font-bold text-[#0369a1] text-base">
                    {formatTime(entry.totalElapsedSeconds)}
                  </td>
                  <td className="py-3 pr-4 text-right text-[#6d28d9] hidden sm:table-cell">
                    {entry.avgHeartRate ? `${Math.round(entry.avgHeartRate)} bpm` : '—'}
                  </td>
                  <td className="py-3 pr-4 text-right text-[#64748b] hidden sm:table-cell">
                    {entry.avgCadence ? `${Math.round(entry.avgCadence)} spm` : '—'}
                  </td>
                  <td className="py-3 pr-4 text-right text-[#64748b] text-xs hidden sm:table-cell">
                    {new Date(entry.submittedAt).toLocaleDateString()}
                  </td>
                  <td className="py-3 text-[#64748b] text-xs text-right">
                    {hasSplits ? (isOpen ? '▲' : '▼') : ''}
                  </td>
                </tr>
                {isOpen && (
                  <tr key={`${entry.entryId}-splits`} className="border-b border-[#f1f5f9] bg-[#f8fafc]">
                    <td colSpan={7} className="px-4 py-3">
                      <table className="text-xs border-collapse">
                        <thead>
                          <tr className="text-[#64748b] tracking-wider">
                            <th className="text-left pr-10 py-1 font-normal">MARK</th>
                            <th className="text-right pr-10 py-1 font-normal">ELAPSED</th>
                            <th className="text-right py-1 font-normal">SPLIT</th>
                          </tr>
                        </thead>
                        <tbody>
                          {entry.splits.map((split, idx) => {
                            const prev = idx === 0 ? 0 : entry.splits[idx - 1].elapsedSeconds
                            return (
                              <tr key={split.distance} className="border-b border-[#e2e8f0]">
                                <td className="pr-10 py-1.5 text-[#64748b]">{split.distance} m</td>
                                <td className="pr-10 py-1.5 text-right tabular text-[#0f172a]">
                                  {formatTime(split.elapsedSeconds)}
                                </td>
                                <td className="py-1.5 text-right tabular text-[#6d28d9]">
                                  {formatTime(split.elapsedSeconds - prev)}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </td>
                  </tr>
                )}
              </>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
