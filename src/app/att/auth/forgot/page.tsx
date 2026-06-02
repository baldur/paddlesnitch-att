'use client'
import Link from 'next/link'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

// Step 1 of password reset: user types their email, we ask Cognito to send a
// code. We always show the same "code sent" message regardless of whether the
// email exists in the pool — don't leak account existence here.
export default function ForgotPasswordPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/att/api/auth/password-reset/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error ?? 'Could not send reset code')
      }
      // Send them to the next step regardless of whether the email exists —
      // the next page accepts the code and shows the same UX either way.
      router.push(`/att/auth/reset?email=${encodeURIComponent(email)}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send reset code')
      setLoading(false)
    }
  }

  const inputClass = 'bg-white border border-[#e2e8f0] px-3 py-2 text-[#0f172a] text-sm focus:outline-none focus:border-[#0369a1] transition-colors'

  return (
    <main className="flex-1 flex flex-col">
      <header className="border-b border-[#e2e8f0] px-4 py-3">
        <Link href="/att">
          <span className="text-[#0f172a] font-bold text-lg tracking-widest">ATT</span>
        </Link>
      </header>
      <div className="flex-1 flex items-start justify-center pt-16 px-4">
        <div className="w-full max-w-sm">
          <h1 className="text-sm tracking-widest text-[#0f172a] mb-2">RESET PASSWORD</h1>
          <p className="text-xs text-[#64748b] mb-6">
            Enter your email and we&apos;ll send you a 6-digit code to reset your
            password.
          </p>
          <form onSubmit={submit} className="flex flex-col gap-4">
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
              {loading ? 'SENDING…' : 'SEND CODE'}
            </button>
            <p className="text-xs text-[#64748b] text-center">
              Remembered it?{' '}
              <Link href="/att/auth" className="tt-link">Sign in</Link>
            </p>
          </form>
        </div>
      </div>
    </main>
  )
}
