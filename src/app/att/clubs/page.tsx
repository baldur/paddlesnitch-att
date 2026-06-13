'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import AuthNav from '@/components/AuthNav'
import type { ClubMetadata } from '@/lib/types'

// /att/clubs — the viewer's clubs and a quick-create form.
//
// Clubs are not publicly listable. An unauthenticated visitor sees an
// empty list with a sign-in prompt; signed-in users see the clubs they
// own / admin / are members of.

export default function ClubsCataloguePage() {
  const router = useRouter()
  const [clubs, setClubs] = useState<ClubMetadata[] | null>(null)
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  const load = async () => {
    const res = await fetch('/att/api/clubs')
    if (!res.ok) { setClubs([]); return }
    const data = await res.json()
    setClubs(data.clubs)
  }
  useEffect(() => { load() }, [])

  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setCreating(true)
    try {
      const res = await fetch('/att/api/clubs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? 'Could not create club')
      }
      const club = await res.json()
      router.push(`/att/clubs/${club.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create club')
      setCreating(false)
    }
  }

  const inputClass = 'bg-white border border-[#e2e8f0] px-3 py-2 text-[#0f172a] text-sm focus:outline-none focus:border-[#0369a1] transition-colors'

  return (
    <main className="flex-1 flex flex-col">
      <header className="border-b border-[#e2e8f0] px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/att" className="tt-nav-link text-sm">← HOME</Link>
          <span className="text-[#64748b]">/</span>
          <span className="text-[#0f172a] text-sm">CLUBS</span>
        </div>
        <nav className="flex gap-4 text-sm text-[#64748b] items-center">
          <AuthNav />
        </nav>
      </header>

      <div className="flex-1 px-4 py-8 max-w-3xl mx-auto w-full space-y-10">
        <section>
          <h1 className="text-lg font-bold text-[#0f172a] tracking-widest mb-2">YOUR CLUBS</h1>
          <p className="text-sm text-[#64748b] mb-6">
            Clubs scope courses and trials to a closed group of members.
          </p>

          {clubs === null && (
            <div className="text-xs text-[#64748b]">Loading…</div>
          )}
          {clubs && clubs.length === 0 && (
            <div className="border border-[#e2e8f0] p-6 text-center text-[#64748b] text-sm">
              You&apos;re not in any clubs yet. Create one below, or wait for an invitation.
            </div>
          )}
          {clubs && clubs.length > 0 && (
            <div className="flex flex-col gap-2">
              {clubs.map(c => (
                <Link
                  key={c.id}
                  href={`/att/clubs/${c.id}`}
                  className="border border-[#e2e8f0] px-4 py-3 hover:border-[#0369a1] transition-colors group flex items-center justify-between"
                >
                  <div className="min-w-0">
                    <div className="text-[#0f172a] font-bold group-hover:text-[#0369a1] transition-colors">{c.name}</div>
                    {c.description && (
                      <div className="text-xs text-[#64748b] mt-0.5 truncate">{c.description}</div>
                    )}
                  </div>
                  <div className="text-xs text-[#64748b] shrink-0 tabular">
                    {1 + c.adminUserIds.length + c.memberUserIds.length} member{1 + c.adminUserIds.length + c.memberUserIds.length === 1 ? '' : 's'}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="border-t border-[#e2e8f0] pt-8">
          <h2 className="text-xs text-[#64748b] tracking-[0.2em] uppercase mb-4">Create a club</h2>
          <form onSubmit={create} className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              required
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Club name (e.g. Henley Rowing Club)"
              className={`${inputClass} flex-1`}
            />
            <button
              type="submit"
              disabled={creating || !name.trim()}
              className="px-6 py-2 bg-[#0369a1] text-white text-xs font-bold tracking-widest hover:bg-[#0284c7] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {creating ? 'CREATING…' : 'CREATE CLUB'}
            </button>
          </form>
          {error && (
            <div className="border border-[#b91c1c] bg-[#fef2f2] px-3 py-2 text-[#b91c1c] text-xs mt-3">{error}</div>
          )}
        </section>
      </div>
    </main>
  )
}
