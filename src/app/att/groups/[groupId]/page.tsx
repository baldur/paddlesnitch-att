'use client'
import Link from 'next/link'
import { useEffect, useState, use } from 'react'
import { useRouter } from 'next/navigation'
import AppHeader from '@/components/AppHeader'
import LoadingState from '@/components/LoadingState'
import type { GroupInvitation, JoinPolicy, AuthUser } from '@/lib/types'

type Invitation = GroupInvitation
type ViewerStatus = 'owner' | 'admin' | 'member' | 'none' | 'pending'

// What GET /att/api/groups/[id] returns: full payload for members, a limited
// projection (name/description/memberCount) for non-members. `viewerStatus`
// distinguishes them.
type GroupView = {
  id: string
  name: string
  description: string
  viewerStatus: ViewerStatus
  limited?: boolean
  // full payload only (members):
  ownerId?: string
  adminUserIds?: string[]
  memberUserIds?: string[]
  joinPolicy?: JoinPolicy
  joinLinkToken?: string
  // limited payload only (non-members):
  memberCount?: number
}

type PendingRequest = { id: string; userId: string; displayName: string; email: string }

// /att/groups/[groupId] — view a group, manage members (admins), or join
// (non-members). Self-serve join is phase 4.
export default function GroupDetailPage({
  params,
}: {
  params: Promise<{ groupId: string }>
}) {
  const { groupId } = use(params)
  const router = useRouter()
  const [user, setUser] = useState<AuthUser | null | undefined>(undefined)
  const [group, setGroup] = useState<GroupView | null | undefined>(undefined)
  const [invitations, setInvitations] = useState<Invitation[]>([])
  const [joinRequests, setJoinRequests] = useState<PendingRequest[]>([])
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<'admin' | 'member'>('member')
  const [inviting, setInviting] = useState(false)
  const [inviteError, setInviteError] = useState('')
  const [joining, setJoining] = useState(false)
  const [joinError, setJoinError] = useState('')

  const loadAll = async () => {
    const [meRes, groupRes] = await Promise.all([
      fetch('/att/api/auth/me').then(r => r.ok ? r.json() : null),
      fetch(`/att/api/groups/${groupId}`),
    ])
    setUser(meRes)
    if (!groupRes.ok) { setGroup(null); return }
    const g: GroupView = await groupRes.json()
    setGroup(g)
    const canManage = g.viewerStatus === 'owner' || g.viewerStatus === 'admin'
    if (canManage) {
      const [invRes, reqRes] = await Promise.all([
        fetch(`/att/api/groups/${groupId}/invitations`),
        fetch(`/att/api/groups/${groupId}/join-requests`),
      ])
      if (invRes.ok) setInvitations((await invRes.json()).invitations ?? [])
      if (reqRes.ok) setJoinRequests((await reqRes.json()).requests ?? [])
    }
  }
  useEffect(() => { loadAll() }, [groupId])

  if (user === undefined || group === undefined) {
    return <main className="flex-1 flex"><LoadingState /></main>
  }
  if (!user) {
    return (
      <main className="flex-1 flex flex-col items-center justify-center gap-4 px-4">
        <p className="text-sm text-[#64748b]">You need to sign in to view this group.</p>
        <Link href={`/att/auth?next=/att/groups/${groupId}`} className="px-6 py-2 bg-[#0369a1] text-white text-xs font-bold tracking-widest hover:bg-[#0284c7] transition-colors">SIGN IN</Link>
      </main>
    )
  }
  if (!group) {
    return (
      <main className="flex-1 flex flex-col items-center justify-center gap-4 px-4">
        <p className="text-sm text-[#64748b]">This group doesn&apos;t exist.</p>
        <Link href="/att/groups" className="tt-nav-link text-xs tracking-widest">← BACK TO GROUPS</Link>
      </main>
    )
  }

  const role = group.viewerStatus
  const isMember = role === 'owner' || role === 'admin' || role === 'member'
  const canManage = role === 'owner' || role === 'admin'
  const inputClass = 'bg-white border border-[#e2e8f0] px-3 py-2 text-[#0f172a] text-sm focus:outline-none focus:border-[#0369a1] transition-colors'

  // ---- Non-member: the join view ----
  if (!isMember) {
    const policy = group.joinPolicy ?? 'request'
    const requestToJoin = async () => {
      setJoining(true)
      setJoinError('')
      try {
        const token = new URLSearchParams(window.location.search).get('join') ?? undefined
        const res = await fetch(`/att/api/groups/${groupId}/join-requests`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(token ? { token } : {}),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error ?? 'Could not join')
        await loadAll() // reflect accepted (now a member) or pending
      } catch (err) {
        setJoinError(err instanceof Error ? err.message : 'Could not join')
      } finally {
        setJoining(false)
      }
    }

    return (
      <main className="flex-1 flex flex-col">
        <AppHeader breadcrumb={
          <>
            <Link href="/att/groups" className="tt-nav-link text-sm shrink-0">← GROUPS</Link>
            <span className="text-[#64748b] shrink-0">/</span>
            <span className="text-[#0f172a] text-sm truncate">{group.name.toUpperCase()}</span>
          </>
        } />
        <div className="flex-1 px-4 py-8 max-w-2xl mx-auto w-full space-y-6">
          <div>
            <h1 className="text-lg font-bold text-[#0f172a] tracking-widest mb-1">{group.name.toUpperCase()}</h1>
            <p className="text-xs text-[#64748b]">{group.memberCount} member{group.memberCount === 1 ? '' : 's'}</p>
          </div>
          {group.description && <p className="text-sm text-[#64748b] whitespace-pre-wrap">{group.description}</p>}

          <div className="border border-[#e2e8f0] bg-[#f8fafc] p-6 flex flex-col gap-3">
            {role === 'pending' ? (
              <p className="text-sm text-[#0f172a]">Your request to join is pending an admin&apos;s approval.</p>
            ) : policy === 'invite_only' ? (
              <p className="text-sm text-[#64748b]">This group is invite-only. Ask an admin to send you an invitation.</p>
            ) : (
              <>
                <p className="text-sm text-[#0f172a]">
                  {policy === 'open'
                    ? 'Anyone can join this group.'
                    : 'Request to join — an admin will approve you.'}
                </p>
                <button
                  onClick={requestToJoin}
                  disabled={joining}
                  className="self-start px-6 py-2.5 bg-[#0369a1] text-white font-bold text-sm tracking-widest hover:bg-[#0284c7] disabled:opacity-50 transition-colors"
                >
                  {joining ? 'WORKING…' : policy === 'open' ? 'JOIN GROUP' : 'REQUEST TO JOIN'}
                </button>
              </>
            )}
            {joinError && <p className="text-xs text-[#b91c1c]">{joinError}</p>}
          </div>
          <Link href="/att/groups" className="tt-nav-link text-xs tracking-widest">← BACK TO GROUPS</Link>
        </div>
      </main>
    )
  }

  // ---- Member / admin view ----
  const adminUserIds = group.adminUserIds ?? []
  const memberUserIds = group.memberUserIds ?? []
  const ownerId = group.ownerId!

  const submitInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    setInviting(true)
    setInviteError('')
    try {
      const res = await fetch(`/att/api/groups/${groupId}/invitations`, {
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
      if (data.resolved) setInvitations(prev => [...prev, data.invitation])
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : 'Could not invite')
    } finally {
      setInviting(false)
    }
  }

  const removeInvitation = async (id: string) => {
    await fetch(`/att/api/groups/${groupId}/invitations/${id}`, { method: 'DELETE' })
    setInvitations(prev => prev.filter(i => i.id !== id))
  }

  const removeMember = async (userId: string) => {
    const res = await fetch(`/att/api/groups/${groupId}/members/${userId}`, { method: 'DELETE' })
    if (!res.ok) return
    const data = await res.json()
    setGroup({ ...data.group, viewerStatus: role })
  }

  const leaveGroup = async () => {
    if (!confirm('Leave this group?')) return
    const res = await fetch(`/att/api/groups/${groupId}/members/${user.id}`, { method: 'DELETE' })
    if (res.ok) router.push('/att/groups')
  }

  const deleteGroup = async () => {
    if (!confirm('Delete this group? This cannot be undone.')) return
    const res = await fetch(`/att/api/groups/${groupId}`, { method: 'DELETE' })
    if (res.ok) router.push('/att/groups')
  }

  const setJoinPolicy = async (policy: JoinPolicy) => {
    const res = await fetch(`/att/api/groups/${groupId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ joinPolicy: policy }),
    })
    if (res.ok) { const g = await res.json(); setGroup({ ...g, viewerStatus: role }) }
  }

  const patchLink = async (body: Record<string, unknown>) => {
    const res = await fetch(`/att/api/groups/${groupId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (res.ok) { const g = await res.json(); setGroup({ ...g, viewerStatus: role }) }
  }

  const approveRequest = async (id: string) => {
    const res = await fetch(`/att/api/groups/${groupId}/join-requests/${id}/approve`, { method: 'POST' })
    if (!res.ok) return
    const data = await res.json()
    setGroup({ ...data.group, viewerStatus: role })
    setJoinRequests(prev => prev.filter(r => r.id !== id))
  }

  const declineRequest = async (id: string) => {
    const res = await fetch(`/att/api/groups/${groupId}/join-requests/${id}/decline`, { method: 'POST' })
    if (res.ok) setJoinRequests(prev => prev.filter(r => r.id !== id))
  }

  const joinPolicy = group.joinPolicy ?? 'request'
  const joinLink = group.joinLinkToken
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/att/groups/${groupId}?join=${group.joinLinkToken}`
    : ''

  return (
    <main className="flex-1 flex flex-col">
      <AppHeader
        breadcrumb={
          <>
            <Link href="/att/groups" className="tt-nav-link text-sm shrink-0">← GROUPS</Link>
            <span className="text-[#64748b] shrink-0">/</span>
            <span className="text-[#0f172a] text-sm truncate">{group.name.toUpperCase()}</span>
          </>
        }
      />

      <div className="flex-1 px-4 py-8 max-w-3xl mx-auto w-full space-y-10">
        <section>
          <div className="flex items-start justify-between gap-4 mb-2">
            <h1 className="text-lg font-bold text-[#0f172a] tracking-widest">{group.name.toUpperCase()}</h1>
            <span className="text-xs px-2 py-0.5 border border-[#0369a1] text-[#0369a1] uppercase shrink-0">{role}</span>
          </div>
          {group.description && (
            <p className="text-sm text-[#64748b] mb-2 whitespace-pre-wrap">{group.description}</p>
          )}
        </section>

        <section>
          <h2 className="text-xs text-[#64748b] tracking-[0.2em] uppercase mb-4">
            Members ({1 + adminUserIds.length + memberUserIds.length})
          </h2>
          <div className="flex flex-col gap-1.5">
            <MemberRow userId={ownerId} role="owner" canKick={false} onKick={() => {}} />
            {adminUserIds.map(id => (
              <MemberRow key={id} userId={id} role="admin" canKick={role === 'owner' && id !== user.id} onKick={() => removeMember(id)} />
            ))}
            {memberUserIds.map(id => (
              <MemberRow key={id} userId={id} role="member" canKick={canManage && id !== user.id} onKick={() => removeMember(id)} />
            ))}
          </div>
          {role !== 'owner' && (
            <button onClick={leaveGroup} className="mt-4 text-xs text-[#64748b] hover:text-[#b91c1c] tracking-widest">
              LEAVE GROUP
            </button>
          )}
        </section>

        {canManage && joinRequests.length > 0 && (
          <section>
            <h2 className="text-xs text-[#64748b] tracking-[0.2em] uppercase mb-4">
              Join requests ({joinRequests.length})
            </h2>
            <div className="flex flex-col gap-1.5">
              {joinRequests.map(r => (
                <div key={r.id} className="flex items-center justify-between border border-[#e2e8f0] px-3 py-2 text-sm gap-3">
                  <div className="min-w-0">
                    <div className="text-[#0f172a] truncate">{r.displayName}</div>
                    {r.email && <div className="text-xs text-[#64748b] truncate">{r.email}</div>}
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button onClick={() => approveRequest(r.id)} className="px-3 py-1 text-xs font-bold tracking-widest border border-[#15803d] text-[#15803d] hover:bg-[#15803d] hover:text-white transition-colors">APPROVE</button>
                    <button onClick={() => declineRequest(r.id)} className="px-3 py-1 text-xs tracking-widest text-[#64748b] hover:text-[#b91c1c] transition-colors">DECLINE</button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {canManage && (
          <section>
            <h2 className="text-xs text-[#64748b] tracking-[0.2em] uppercase mb-4">Invite a member</h2>
            <form onSubmit={submitInvite} className="flex flex-col sm:flex-row gap-2">
              <input type="email" required value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="email address" className={`${inputClass} flex-1`} />
              <select value={inviteRole} onChange={e => setInviteRole(e.target.value as 'admin' | 'member')} className={inputClass}>
                <option value="member">Member</option>
                <option value="admin">Admin</option>
              </select>
              <button type="submit" disabled={inviting || !inviteEmail.trim()} className="px-4 py-2 bg-[#0369a1] text-white text-xs font-bold tracking-widest hover:bg-[#0284c7] disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                {inviting ? 'INVITING…' : 'INVITE'}
              </button>
            </form>
            {inviteError && <div className="border border-[#b91c1c] bg-[#fef2f2] px-3 py-2 text-[#b91c1c] text-xs mt-3">{inviteError}</div>}
            <p className="text-xs text-[#64748b] mt-3">If the email has no account yet, the invitation will activate the moment they sign up.</p>
          </section>
        )}

        {canManage && invitations.length > 0 && (
          <section>
            <h2 className="text-xs text-[#64748b] tracking-[0.2em] uppercase mb-4">Pending invitations ({invitations.length})</h2>
            <div className="flex flex-col gap-1.5">
              {invitations.map(i => (
                <div key={i.id} className="flex items-center justify-between border border-[#e2e8f0] px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <div className="text-[#0f172a] truncate">{i.toEmail ?? i.toUserId}</div>
                    <div className="text-xs text-[#64748b]">role: {i.role}</div>
                  </div>
                  <button onClick={() => removeInvitation(i.id)} className="text-xs text-[#64748b] hover:text-[#b91c1c] tracking-widest">RESCIND</button>
                </div>
              ))}
            </div>
          </section>
        )}

        {canManage && (
          <section>
            <h2 className="text-xs text-[#64748b] tracking-[0.2em] uppercase mb-4">How people join</h2>
            <div className="flex gap-2 mb-3">
              {(['invite_only', 'request', 'open'] as const).map(p => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setJoinPolicy(p)}
                  className={`px-3 py-1.5 text-xs font-bold tracking-widest border transition-colors ${
                    joinPolicy === p
                      ? 'border-[#0369a1] text-[#0369a1] bg-[#f0f9ff]'
                      : 'border-[#e2e8f0] text-[#64748b] hover:border-[#0369a1] hover:text-[#0369a1]'
                  }`}
                >
                  {p === 'invite_only' ? 'INVITE ONLY' : p.toUpperCase()}
                </button>
              ))}
            </div>
            <p className="text-xs text-[#64748b] mb-4">
              {joinPolicy === 'invite_only'
                ? 'Only people you invite can join.'
                : joinPolicy === 'request'
                  ? 'Anyone can request to join; you approve each request.'
                  : 'Anyone with the group link can join instantly.'}
            </p>
            <div className="flex flex-col gap-2">
              <label className="text-xs text-[#64748b] tracking-widest">SHAREABLE JOIN LINK</label>
              {joinLink ? (
                <div className="flex flex-col sm:flex-row gap-2">
                  <input readOnly value={joinLink} onFocus={e => e.target.select()} className={`${inputClass} flex-1 text-xs`} />
                  <button type="button" onClick={() => navigator.clipboard?.writeText(joinLink)} className="px-4 py-2 border border-[#e2e8f0] text-[#64748b] text-xs tracking-widest hover:border-[#0369a1] hover:text-[#0369a1] transition-colors">COPY</button>
                  <button type="button" onClick={() => patchLink({ joinLinkToken: null })} className="px-4 py-2 border border-[#e2e8f0] text-[#64748b] text-xs tracking-widest hover:border-[#b91c1c] hover:text-[#b91c1c] transition-colors">REVOKE</button>
                </div>
              ) : (
                <button type="button" onClick={() => patchLink({ regenerateJoinLink: true })} className="self-start px-4 py-2 border border-[#e2e8f0] text-[#64748b] text-xs tracking-widest hover:border-[#0369a1] hover:text-[#0369a1] transition-colors">
                  CREATE JOIN LINK
                </button>
              )}
              <p className="text-xs text-[#64748b]">Anyone signed in who opens this link joins instantly, whatever the policy above. Revoke to disable it.</p>
            </div>
          </section>
        )}

        {role === 'owner' && (
          <section className="border-t border-[#e2e8f0] pt-8">
            <h2 className="text-xs text-[#b91c1c] tracking-[0.2em] uppercase mb-3">Delete group</h2>
            <p className="text-sm text-[#64748b] mb-3">
              Tears down the group, its invitations, and removes it from every member&apos;s list.
              Courses and trials scoped to this group fall back to private (you can re-scope them later).
            </p>
            <button onClick={deleteGroup} className="px-4 py-2 border border-[#b91c1c] text-[#b91c1c] text-xs font-bold tracking-widest hover:bg-[#b91c1c] hover:text-white transition-colors">
              DELETE GROUP
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
  return (
    <div className="flex items-center justify-between border border-[#e2e8f0] px-3 py-2 text-sm">
      <div className="min-w-0 flex items-center gap-2">
        <span className="text-xs px-2 py-0.5 border border-[#cbd5e1] text-[#64748b] uppercase tracking-widest">{role}</span>
        <span className="text-xs text-[#64748b] truncate tabular">{userId}</span>
      </div>
      {canKick && (
        <button onClick={onKick} className="text-xs text-[#64748b] hover:text-[#b91c1c] tracking-widest">REMOVE</button>
      )}
    </div>
  )
}
