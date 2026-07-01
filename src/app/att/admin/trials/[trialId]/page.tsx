'use client'
import Link from 'next/link'
import { useEffect, useState, use } from 'react'
import AppHeader from '@/components/AppHeader'
import LoadingState from '@/components/LoadingState'
import type { TrialMetadata, CourseMetadata, LeaderboardEntry } from '@/lib/types'
import { formatTime } from '@/lib/geo'

type Invitee = { sub: string; email: string; displayName: string }

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
  const [invitees, setInvitees] = useState<Invitee[]>([])
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviting, setInviting] = useState(false)
  const [inviteError, setInviteError] = useState('')

  const load = async () => {
    const t = await fetch(`/att/api/trials/${trialId}`).then(r => r.json())
    setTrial(t)
    const [c, lb] = await Promise.all([
      fetch(`/att/api/courses/${t.courseId}`).then(r => r.json()),
      fetch(`/att/api/trials/${trialId}/leaderboard`).then(r => r.json()),
    ])
    setCourse(c)
    setLeaderboard(lb)
    if (t.participation === 'invitational') loadInvitees()
  }

  const loadInvitees = async () => {
    const res = await fetch(`/att/api/trials/${trialId}/invitations`)
    if (res.ok) setInvitees((await res.json()).invitees)
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

  const toggleVisibility = async () => {
    if (!trial) return
    const next = trial.visibility === 'public' ? 'private' : 'public'
    // Make-public acknowledgement gate. Server enforces too; the client
    // confirm makes the trade-off explicit so we're not silently flipping
    // someone's performance time into a public leaderboard.
    if (next === 'public' && trial.visibility !== 'public') {
      const ok = window.confirm(
        'Make this trial public?\n\n' +
        'Everyone’s name and time on the leaderboard will become visible to anyone on the internet. ' +
        'Participants were told in the Terms of Service that this could happen, but it cannot be undone for results that get cached or shared.\n\n' +
        'Continue?'
      )
      if (!ok) return
    }
    const res = await fetch(`/att/api/trials/${trialId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visibility: next, acknowledged: next === 'public' }),
    })
    const updated = await res.json()
    if (!res.ok) {
      alert(updated.error ?? 'Could not change visibility')
      return
    }
    setTrial(updated)
  }

  const changeParticipation = async (next: 'members' | 'invitational' | 'public') => {
    if (!trial || trial.participation === next) return
    const updated = await fetch(`/att/api/trials/${trialId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ participation: next }),
    }).then(r => r.json())
    setTrial(updated)
    if (updated.participation === 'invitational') loadInvitees()
  }

  const submitInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!inviteEmail.trim()) return
    setInviting(true)
    setInviteError('')
    try {
      const res = await fetch(`/att/api/trials/${trialId}/invitations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail.trim() }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? 'Could not invite')
      }
      setInviteEmail('')
      await loadInvitees()
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : 'Could not invite')
    } finally {
      setInviting(false)
    }
  }

  const uninvite = async (sub: string) => {
    await fetch(`/att/api/trials/${trialId}/invitations/${sub}`, { method: 'DELETE' })
    setInvitees(prev => prev.filter(i => i.sub !== sub))
  }

  if (!trial || !course) {
    return (
      <main className="flex-1 flex">
        <LoadingState />
      </main>
    )
  }

  return (
    <main className="flex-1 flex flex-col">
      <AppHeader
        breadcrumb={
          <>
            <Link href="/att" className="tt-nav-link text-sm shrink-0">
              ← HOME
            </Link>
            <span className="text-[#64748b] shrink-0">/</span>
            <a
              href={`/att/admin/courses/${course.id}`}
              className="tt-nav-link text-sm truncate"
            >
              {course.name.toUpperCase()}
            </a>
            <span className="text-[#64748b] shrink-0">/</span>
            <span className="text-[#0f172a] text-sm shrink-0">{trial.name.toUpperCase()}</span>
          </>
        }
      />

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
            {/* Visibility flip. Server clamps to private when the parent
                course is private, so the user can still click but it might
                end up clamped — the next load reflects what was stored. */}
            <button
              type="button"
              onClick={toggleVisibility}
              className="px-4 py-1.5 text-xs font-bold tracking-widest border border-[#e2e8f0] text-[#64748b] hover:border-[#0369a1] hover:text-[#0369a1] transition-colors"
              title={
                course.visibility === 'private'
                  ? 'Course is private, so this trial is private too.'
                  : 'Toggle who can see this trial.'
              }
            >
              {trial.visibility === 'public' ? 'PUBLIC ↔ PRIVATE' : 'PRIVATE ↔ PUBLIC'}
            </button>
            <span className="text-xs text-[#64748b] tracking-widest self-center">SUBMIT:</span>
            {(['members', 'invitational', 'public'] as const).map(v => (
              <button
                key={v}
                type="button"
                onClick={() => changeParticipation(v)}
                className={`px-3 py-1.5 text-xs font-bold tracking-widest border transition-colors ${
                  trial.participation === v
                    ? 'border-[#0369a1] text-[#0369a1] bg-[#f0f9ff]'
                    : 'border-[#e2e8f0] text-[#64748b] hover:border-[#0369a1] hover:text-[#0369a1]'
                }`}
              >
                {v.toUpperCase()}
              </button>
            ))}
          </div>
        </section>

        {/* Invitee management — only meaningful when participation is invitational.
            Open trials hide the section so we don't suggest the data is there. */}
        {trial.participation === 'invitational' && (
          <section>
            <h2 className="text-xs text-[#64748b] tracking-[0.2em] uppercase mb-4">
              Invitees ({invitees.length})
            </h2>

            <form onSubmit={submitInvite} className="flex flex-col sm:flex-row gap-2 mb-4">
              <input
                type="email"
                required
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
                placeholder="email of someone with an account"
                className="bg-white border border-[#e2e8f0] px-3 py-2 text-[#0f172a] text-sm focus:outline-none focus:border-[#0369a1] transition-colors flex-1"
              />
              <button
                type="submit"
                disabled={inviting || !inviteEmail.trim()}
                className="px-4 py-2 bg-[#0369a1] text-white text-xs font-bold tracking-widest hover:bg-[#0284c7] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {inviting ? 'INVITING…' : 'INVITE'}
              </button>
            </form>

            {inviteError && (
              <div className="border border-[#b91c1c] bg-[#fef2f2] px-3 py-2 text-[#b91c1c] text-xs mb-4">
                {inviteError}
              </div>
            )}

            {invitees.length === 0 ? (
              <p className="text-xs text-[#64748b]">
                No one is invited yet. Only you can submit until you invite someone.
              </p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {invitees.map(i => (
                  <div
                    key={i.sub}
                    className="flex items-center justify-between border border-[#e2e8f0] px-3 py-2 text-sm"
                  >
                    <div className="min-w-0">
                      <div className="text-[#0f172a] truncate">{i.displayName}</div>
                      {i.email && (
                        <div className="text-xs text-[#64748b] truncate">{i.email}</div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => uninvite(i.sub)}
                      className="text-xs text-[#64748b] hover:text-[#b91c1c] tracking-widest"
                    >
                      REMOVE
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs text-[#64748b] tracking-[0.2em] uppercase">
              Leaderboard ({leaderboard.length} entr{leaderboard.length === 1 ? 'y' : 'ies'})
            </h2>
            {trial.status === 'open' && (
              <a
                href={`/att/trials/${trialId}/upload`}
                className="text-xs tt-link"
              >
                + Submit your entry
              </a>
            )}
          </div>

          {leaderboard.length === 0 ? (
            <div className="border border-[#e2e8f0] p-8 text-center text-[#64748b] text-sm">
              No entries yet.
              {trial.status === 'open' && (
                <>
                  {' '}
                  <a href={`/att/trials/${trialId}/upload`} className="tt-link">
                    Submit your entry
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
            <a href={`/att/trials/${trialId}`} className="tt-link">
              /att/trials/{trialId}
            </a>
          </p>
        </section>
      </div>
    </main>
  )
}
