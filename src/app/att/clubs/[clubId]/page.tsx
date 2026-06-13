'use client'
import Link from 'next/link'
import { useEffect, useState, use } from 'react'
import { useRouter } from 'next/navigation'
import AuthNav from '@/components/AuthNav'
import type { ClubMetadata, ClubInvitation, AuthUser } from '@/lib/types'

type Invitation = ClubInvitation

// /att/clubs/[clubId] — manage members and invitations.
//
// Owners + admins see invite/kick controls and the full member list.
// Plain members see the member list but no controls (other than leave).
// Non-members hit a 404 server-side at the API and end up on a friendly
// "club not visible" state here.

export default function ClubDetailPage({
  params,
}: {
  params: Promise<{ clubId: string }>
}) {
  const { clubId } = use(params)
  const router = useRouter()
  const [user, setUser] = useState<AuthUser | null | undefined>(undefined)
  const [club, setClub] = useState<ClubMetadata | null | undefined>(undefined)
  const [invitations, setInvitations] = useState<Invitation[]>([])
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<'admin' | 'member'>('member')
  const [inviting, setInviting] = useState(false)
  const [inviteError, setInviteError] = useState('')

  const loadAll = async () => {
    const [meRes, clubRes] = await Promise.all([
      fetch('/att/api/auth/me').then(r => r.ok ? r.json() : null),
      fetch(`/att/api/clubs/${clubId}`),
    ])
    setUser(meRes)
    if (!clubRes.ok) { setClub(null); return }
    const c = await clubRes.json()
    setClub(c)
    // Only owners + admins can list invitations — try, ignore 403.
    const invRes = await fetch(`/att/api/clubs/${clubId}/invitations`)
    if (invRes.ok) {
      const data = await invRes.json()
      setInvitations(data.invitations ?? [])
    }
  }
  useEffect(() => { loadAll() }, [clubId])

  if (user === undefined || club === undefined) {
    return <main className="flex-1 flex items-center justify-center text-[#64748b] text-sm">Loading…</main>
  }
  if (!user) {
    return (
      <main className="flex-1 flex flex-col items-center justify-center gap-4 px-4">
        <p className="text-sm text-[#64748b]">You need to sign in to view this club.</p>
        <Link href="/att/auth?next=/att/clubs" className="px-6 py-2 bg-[#0369a1] text-white text-xs font-bold tracking-widest hover:bg-[#0284c7] transition-colors">SIGN IN</Link>
      </main>
    )
  }
  if (!club) {
    return (
      <main className="flex-1 flex flex-col items-center justify-center gap-4 px-4">
        <p className="text-sm text-[#64748b]">This club is not visible to you, or doesn&apos;t exist.</p>
        <Link href="/att/clubs" className="tt-nav-link text-xs tracking-widest">← BACK TO CLUBS</Link>
      </main>
    )
  }

  const role: 'owner' | 'admin' | 'member' = (() => {
    if (club.ownerId === user.id) return 'owner'
    if (club.adminUserIds.includes(user.id)) return 'admin'
    return 'member'
  })()
  const canManage = role === 'owner' || role === 'admin'

  const submitInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    setInviting(true)
    setInviteError('')
    try {
      const res = await fetch(`/att/api/clubs/${clubId}/invitations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? 'Could not invite')
      }
      const data = await res.json()
      setInviteEmail('')
      // Only resolved invites land in the visible list — pending email
      // ones live elsewhere and surface on the recipient's signup.
      if (data.resolved) setInvitations(prev => [...prev, data.invitation])
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : 'Could not invite')
    } finally {
      setInviting(false)
    }
  }

  const removeInvitation = async (id: string) => {
    await fetch(`/att/api/clubs/${clubId}/invitations/${id}`, { method: 'DELETE' })
    setInvitations(prev => prev.filter(i => i.id !== id))
  }

  const removeMember = async (userId: string) => {
    const res = await fetch(`/att/api/clubs/${clubId}/members/${userId}`, { method: 'DELETE' })
    if (!res.ok) return
    const data = await res.json()
    setClub(data.club)
  }

  const leaveClub = async () => {
    if (!confirm('Leave this club?')) return
    const res = await fetch(`/att/api/clubs/${clubId}/members/${user.id}`, { method: 'DELETE' })
    if (res.ok) router.push('/att/clubs')
  }

  const deleteClub = async () => {
    if (!confirm('Delete this club? This cannot be undone.')) return
    const res = await fetch(`/att/api/clubs/${clubId}`, { method: 'DELETE' })
    if (res.ok) router.push('/att/clubs')
  }

  const inputClass = 'bg-white border border-[#e2e8f0] px-3 py-2 text-[#0f172a] text-sm focus:outline-none focus:border-[#0369a1] transition-colors'

  return (
    <main className="flex-1 flex flex-col">
      <header className="border-b border-[#e2e8f0] px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4 min-w-0">
          <Link href="/att/clubs" className="tt-nav-link text-sm shrink-0">← CLUBS</Link>
          <span className="text-[#64748b] shrink-0">/</span>
          <span className="text-[#0f172a] text-sm truncate">{club.name.toUpperCase()}</span>
        </div>
        <nav className="flex gap-4 text-sm text-[#64748b] items-center">
          <AuthNav />
        </nav>
      </header>

      <div className="flex-1 px-4 py-8 max-w-3xl mx-auto w-full space-y-10">
        <section>
          <div className="flex items-start justify-between gap-4 mb-2">
            <h1 className="text-lg font-bold text-[#0f172a] tracking-widest">{club.name.toUpperCase()}</h1>
            <span className="text-xs px-2 py-0.5 border border-[#0369a1] text-[#0369a1] uppercase shrink-0">{role}</span>
          </div>
          {club.description && (
            <p className="text-sm text-[#64748b] mb-2 whitespace-pre-wrap">{club.description}</p>
          )}
        </section>

        <section>
          <h2 className="text-xs text-[#64748b] tracking-[0.2em] uppercase mb-4">
            Members ({1 + club.adminUserIds.length + club.memberUserIds.length})
          </h2>
          <div className="flex flex-col gap-1.5">
            <MemberRow userId={club.ownerId} role="owner" canKick={false} onKick={() => {}} />
            {club.adminUserIds.map(id => (
              <MemberRow
                key={id}
                userId={id}
                role="admin"
                canKick={role === 'owner' && id !== user.id}
                onKick={() => removeMember(id)}
              />
            ))}
            {club.memberUserIds.map(id => (
              <MemberRow
                key={id}
                userId={id}
                role="member"
                canKick={canManage && id !== user.id}
                onKick={() => removeMember(id)}
              />
            ))}
          </div>
          {role !== 'owner' && (
            <button
              onClick={leaveClub}
              className="mt-4 text-xs text-[#64748b] hover:text-[#b91c1c] tracking-widest"
            >
              LEAVE CLUB
            </button>
          )}
        </section>

        {canManage && (
          <section>
            <h2 className="text-xs text-[#64748b] tracking-[0.2em] uppercase mb-4">Invite a member</h2>
            <form onSubmit={submitInvite} className="flex flex-col sm:flex-row gap-2">
              <input
                type="email"
                required
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
                placeholder="email address"
                className={`${inputClass} flex-1`}
              />
              <select
                value={inviteRole}
                onChange={e => setInviteRole(e.target.value as 'admin' | 'member')}
                className={inputClass}
              >
                <option value="member">Member</option>
                <option value="admin">Admin</option>
              </select>
              <button
                type="submit"
                disabled={inviting || !inviteEmail.trim()}
                className="px-4 py-2 bg-[#0369a1] text-white text-xs font-bold tracking-widest hover:bg-[#0284c7] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {inviting ? 'INVITING…' : 'INVITE'}
              </button>
            </form>
            {inviteError && (
              <div className="border border-[#b91c1c] bg-[#fef2f2] px-3 py-2 text-[#b91c1c] text-xs mt-3">{inviteError}</div>
            )}
            <p className="text-xs text-[#64748b] mt-3">
              If the email has no account yet, the invitation will activate the moment they sign up.
            </p>
          </section>
        )}

        {canManage && invitations.length > 0 && (
          <section>
            <h2 className="text-xs text-[#64748b] tracking-[0.2em] uppercase mb-4">
              Pending invitations ({invitations.length})
            </h2>
            <div className="flex flex-col gap-1.5">
              {invitations.map(i => (
                <div key={i.id} className="flex items-center justify-between border border-[#e2e8f0] px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <div className="text-[#0f172a] truncate">{i.toEmail ?? i.toUserId}</div>
                    <div className="text-xs text-[#64748b]">role: {i.role}</div>
                  </div>
                  <button
                    onClick={() => removeInvitation(i.id)}
                    className="text-xs text-[#64748b] hover:text-[#b91c1c] tracking-widest"
                  >RESCIND</button>
                </div>
              ))}
            </div>
          </section>
        )}

        {role === 'owner' && (
          <section className="border-t border-[#e2e8f0] pt-8">
            <h2 className="text-xs text-[#b91c1c] tracking-[0.2em] uppercase mb-3">Delete club</h2>
            <p className="text-sm text-[#64748b] mb-3">
              Tears down the club, its invitations, and removes it from every member&apos;s list.
              Courses and trials scoped to this club fall back to private (you can re-scope them later).
            </p>
            <button
              onClick={deleteClub}
              className="px-4 py-2 border border-[#b91c1c] text-[#b91c1c] text-xs font-bold tracking-widest hover:bg-[#b91c1c] hover:text-white transition-colors"
            >
              DELETE CLUB
            </button>
          </section>
        )}
      </div>
    </main>
  )
}

function MemberRow({
  userId,
  role,
  canKick,
  onKick,
}: {
  userId: string
  role: 'owner' | 'admin' | 'member'
  canKick: boolean
  onKick: () => void
}) {
  // We don't fan out to Cognito here — the member list is just subs.
  // Rendering the sub is unhelpful but unambiguous; a future commit can
  // add a batched ListUsers-by-sub if name display becomes important.
  return (
    <div className="flex items-center justify-between border border-[#e2e8f0] px-3 py-2 text-sm">
      <div className="min-w-0 flex items-center gap-2">
        <span className="text-xs px-2 py-0.5 border border-[#cbd5e1] text-[#64748b] uppercase tracking-widest">{role}</span>
        <span className="text-xs text-[#64748b] truncate tabular">{userId}</span>
      </div>
      {canKick && (
        <button
          onClick={onKick}
          className="text-xs text-[#64748b] hover:text-[#b91c1c] tracking-widest"
        >REMOVE</button>
      )}
    </div>
  )
}
