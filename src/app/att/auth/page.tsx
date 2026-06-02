'use client'
import Link from 'next/link'
import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

function AuthForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const next = searchParams.get('next') ?? '/att'

  // Redirect if already signed in
  useEffect(() => {
    fetch('/att/api/auth/me').then(r => {
      if (r.ok) router.replace(next)
    })
  }, [next, router])

  const [tab, setTab] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(
    searchParams.get('error') === 'magic_disabled'
      ? 'Magic link sign-in is temporarily unavailable. Please use email and password.'
      : ''
  )
  const [loading, setLoading] = useState(false)

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/att/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      if (res.ok) {
        router.push(next)
      } else {
        const data = await res.json()
        setError(data.error ?? 'Sign in failed')
        setLoading(false)
      }
    } catch {
      setError('Network error')
      setLoading(false)
    }
  }

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/att/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, displayName, password }),
      })
      if (res.ok) {
        router.push(next)
      } else {
        const data = await res.json()
        setError(data.error ?? 'Sign up failed')
        setLoading(false)
      }
    } catch {
      setError('Network error')
      setLoading(false)
    }
  }

  const inputClass =
    'bg-white border border-[#e2e8f0] px-3 py-2 text-[#0f172a] text-sm focus:outline-none focus:border-[#0369a1] transition-colors'

  const tabClass = (t: typeof tab) =>
    `px-4 py-2 text-sm tracking-widest transition-colors ${
      tab === t
        ? 'border-b-2 border-[#0369a1] text-[#0369a1] -mb-px'
        : 'text-[#64748b] hover:text-[#0f172a]'
    }`

  return (
    <div className="w-full max-w-sm">
      <div className="flex border-b border-[#e2e8f0] mb-8">
        <button type="button" onClick={() => { setTab('signin'); setError('') }} className={tabClass('signin')}>
          SIGN IN
        </button>
        <button type="button" onClick={() => { setTab('signup'); setError('') }} className={tabClass('signup')}>
          SIGN UP
        </button>
      </div>

      {tab === 'signin' && (
        <form onSubmit={handleSignIn} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-[#64748b] tracking-widest">EMAIL</label>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className={inputClass}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-[#64748b] tracking-widest">PASSWORD</label>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className={inputClass}
            />
          </div>
          {error && (
            <div className="border border-[#b91c1c] bg-[#fef2f2] px-3 py-2 text-[#b91c1c] text-xs">
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-2.5 bg-[#0369a1] text-white font-bold text-sm tracking-widest hover:bg-[#0284c7] disabled:opacity-50 transition-colors"
          >
            {loading ? 'SIGNING IN…' : 'SIGN IN'}
          </button>
          <p className="text-xs text-[#64748b] text-center">
            No account?{' '}
            <button
              type="button"
              onClick={() => { setTab('signup'); setError('') }}
              className="tt-link"
            >
              Sign up
            </button>
          </p>
        </form>
      )}

      {tab === 'signup' && (
        <form onSubmit={handleSignUp} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-[#64748b] tracking-widest">EMAIL</label>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className={inputClass}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-[#64748b] tracking-widest">DISPLAY NAME</label>
            <input
              type="text"
              required
              autoComplete="name"
              placeholder="e.g. John Smith"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              className={inputClass}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-[#64748b] tracking-widest">PASSWORD</label>
            <input
              type="password"
              required
              autoComplete="new-password"
              minLength={8}
              value={password}
              onChange={e => setPassword(e.target.value)}
              className={inputClass}
            />
            <p className="text-xs text-[#64748b]">Minimum 8 characters</p>
          </div>
          {error && (
            <div className="border border-[#b91c1c] bg-[#fef2f2] px-3 py-2 text-[#b91c1c] text-xs">
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-2.5 bg-[#0369a1] text-white font-bold text-sm tracking-widest hover:bg-[#0284c7] disabled:opacity-50 transition-colors"
          >
            {loading ? 'CREATING ACCOUNT…' : 'CREATE ACCOUNT'}
          </button>
          <p className="text-xs text-[#64748b] text-center">
            Already have an account?{' '}
            <button
              type="button"
              onClick={() => { setTab('signin'); setError('') }}
              className="tt-link"
            >
              Sign in
            </button>
          </p>
        </form>
      )}

    </div>
  )
}

export default function AuthPage() {
  return (
    <main className="flex-1 flex flex-col">
      <header className="border-b border-[#e2e8f0] px-4 py-3">
        <Link href="/att">
          <span className="text-[#0f172a] font-bold text-lg tracking-widest">ATT</span>
          <span className="text-[#64748b] text-xs tracking-widest ml-3 hidden sm:inline">AUTOMATED TIME TRIALS</span>
        </Link>
      </header>
      <div className="flex-1 flex items-start justify-center pt-16 px-4">
        <Suspense>
          <AuthForm />
        </Suspense>
      </div>
    </main>
  )
}
