'use client'
import Link from 'next/link'
import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import AuthNav from '@/components/AuthNav'
import type { AuthUser } from '@/lib/types'

type StravaStatus =
  | { connected: false }
  | { connected: true; athlete: { id: number; name: string } }

// Banner copy keyed off the ?strava= query param the callback sets when it
// finishes. Keeps redirects round-trippable instead of relying on session state.
const STRAVA_FLASH: Record<string, { tone: 'ok' | 'err'; text: string }> = {
  connected: { tone: 'ok', text: 'Strava connected.' },
  denied: { tone: 'err', text: 'Strava connection cancelled.' },
  state_mismatch: { tone: 'err', text: 'Strava connect failed (state mismatch). Please try again.' },
  exchange_failed: { tone: 'err', text: 'Strava connect failed during token exchange. Please try again.' },
  not_configured: { tone: 'err', text: 'Strava is not configured on this server.' },
}

export default function AccountPage() {
  // Suspense wrapper required because the inner component reads
  // useSearchParams (which marks the route as needing CSR bailout in
  // Next.js 16). The fallback never shows in practice — the page renders
  // its own "Loading…" state once the auth /me promise resolves.
  return (
    <Suspense fallback={null}>
      <AccountPageInner />
    </Suspense>
  )
}

function AccountPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const stravaFlashKey = searchParams.get('strava')
  const stravaFlash = stravaFlashKey ? STRAVA_FLASH[stravaFlashKey] : undefined

  const [user, setUser] = useState<AuthUser | null | undefined>(undefined)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [working, setWorking] = useState<'export' | 'delete' | 'strava' | null>(null)
  const [error, setError] = useState('')
  const [strava, setStrava] = useState<StravaStatus | undefined>(undefined)

  useEffect(() => {
    fetch('/att/api/auth/me')
      .then(r => (r.ok ? r.json() : null))
      .then(setUser)
      .catch(() => setUser(null))
  }, [])

  useEffect(() => {
    fetch('/att/api/strava/status')
      .then(r => (r.ok ? r.json() : { connected: false }))
      .then(setStrava)
      .catch(() => setStrava({ connected: false }))
  }, [stravaFlashKey])

  async function disconnectStrava() {
    setError('')
    setWorking('strava')
    try {
      const res = await fetch('/att/api/strava/disconnect', { method: 'POST' })
      if (!res.ok) throw new Error('Disconnect failed')
      setStrava({ connected: false })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Disconnect failed')
    } finally {
      setWorking(null)
    }
  }

  async function downloadExport() {
    setError('')
    setWorking('export')
    try {
      const res = await fetch('/att/api/account/export')
      if (!res.ok) throw new Error('Export failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      // Server already sets Content-Disposition; the anchor download attribute
      // is the cross-browser fallback. Filename comes from the server header.
      a.download = ''
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed')
    } finally {
      setWorking(null)
    }
  }

  async function deleteAccount() {
    setError('')
    setWorking('delete')
    try {
      const res = await fetch('/att/api/account', { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? 'Deletion failed')
      }
      // Account gone. Send them home.
      router.replace('/att')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Deletion failed')
      setWorking(null)
    }
  }

  return (
    <main className="flex-1 flex flex-col">
      <header className="border-b border-[#e2e8f0] px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/att" className="tt-nav-link text-sm">
            ← HOME
          </Link>
          <span className="text-[#64748b]">/</span>
          <span className="text-[#0f172a] text-sm">ACCOUNT</span>
        </div>
        <nav className="flex gap-4 text-sm text-[#64748b] items-center">
          <AuthNav />
        </nav>
      </header>

      <div className="flex-1 px-4 py-8 max-w-2xl mx-auto w-full space-y-10">
        {user === undefined && (
          <p className="text-sm text-[#64748b]">Loading…</p>
        )}

        {user === null && (
          <div className="flex flex-col gap-4 text-center pt-16">
            <h1 className="text-lg font-bold text-[#0f172a] tracking-widest">SIGN IN REQUIRED</h1>
            <p className="text-sm text-[#64748b]">
              Sign in to view or manage your account data.
            </p>
            <Link
              href="/att/auth?next=/att/account"
              className="px-6 py-2.5 bg-[#0369a1] text-white font-bold text-sm tracking-widest hover:bg-[#0284c7] transition-colors self-center"
            >
              SIGN IN
            </Link>
          </div>
        )}

        {user && (
          <>
            <section>
              <h1 className="text-lg font-bold text-[#0f172a] tracking-widest mb-6">YOUR ACCOUNT</h1>
              <dl className="grid grid-cols-3 gap-4 text-sm">
                <dt className="text-[#64748b] tracking-widest text-xs uppercase">Email</dt>
                <dd className="col-span-2 text-[#0f172a] tabular">{user.email}</dd>
                <dt className="text-[#64748b] tracking-widest text-xs uppercase">Display name</dt>
                <dd className="col-span-2 text-[#0f172a]">{user.displayName}</dd>
                <dt className="text-[#64748b] tracking-widest text-xs uppercase">User ID</dt>
                <dd className="col-span-2 text-[#64748b] tabular text-xs break-all">{user.id}</dd>
              </dl>
            </section>

            <section>
              <h2 className="text-xs text-[#64748b] tracking-[0.2em] uppercase mb-3">
                Strava integration
              </h2>
              <p className="text-sm text-[#64748b] mb-4 leading-relaxed">
                Connect Strava once and you can import any of your recent water-sport activities directly into a time trial — no need to export GPX files yourself. We only request read access and never post anything to your Strava account.
              </p>

              {stravaFlash && (
                <div
                  className={`mb-4 border px-3 py-2 text-xs ${
                    stravaFlash.tone === 'ok'
                      ? 'border-[#15803d] bg-[#f0fdf4] text-[#15803d]'
                      : 'border-[#b91c1c] bg-[#fef2f2] text-[#b91c1c]'
                  }`}
                >
                  {stravaFlash.text}
                </div>
              )}

              {strava === undefined && (
                <p className="text-xs text-[#64748b]">Checking…</p>
              )}

              {strava && !strava.connected && (
                <a
                  href="/att/api/strava/connect"
                  className="inline-block px-6 py-2.5 bg-[#fc4c02] text-white font-bold text-sm tracking-widest hover:bg-[#e34402] transition-colors"
                >
                  CONNECT STRAVA
                </a>
              )}

              {strava && strava.connected && (
                <div className="flex items-center justify-between gap-4 border border-[#e2e8f0] px-4 py-3">
                  <div className="text-sm">
                    <span className="text-[#15803d] tracking-widest text-xs mr-2">CONNECTED</span>
                    <span className="text-[#0f172a]">{strava.athlete.name}</span>
                  </div>
                  <button
                    type="button"
                    onClick={disconnectStrava}
                    disabled={working === 'strava'}
                    className="px-4 py-2 border border-[#64748b] text-[#64748b] text-xs tracking-widest hover:bg-[#f1f5f9] disabled:opacity-50 transition-colors"
                  >
                    {working === 'strava' ? 'DISCONNECTING…' : 'DISCONNECT'}
                  </button>
                </div>
              )}
            </section>

            <section>
              <h2 className="text-xs text-[#64748b] tracking-[0.2em] uppercase mb-3">
                Download my data
              </h2>
              <p className="text-sm text-[#64748b] mb-4 leading-relaxed">
                Get a JSON file containing every piece of personal data paddlesnitch.com holds about you:
                your profile, every course and trial you created, every entry you submitted. Backs your
                right of access (UK GDPR Art. 15) and data portability (Art. 20).
              </p>
              <button
                type="button"
                onClick={downloadExport}
                disabled={working === 'export'}
                className="px-6 py-2.5 border border-[#0369a1] text-[#0369a1] font-bold text-sm tracking-widest hover:bg-[#f0f9ff] disabled:opacity-50 transition-colors"
              >
                {working === 'export' ? 'PREPARING…' : 'DOWNLOAD MY DATA (.json)'}
              </button>
            </section>

            <section className="border-t border-[#e2e8f0] pt-8">
              <h2 className="text-xs text-[#b91c1c] tracking-[0.2em] uppercase mb-3">
                Delete my account
              </h2>
              <p className="text-sm text-[#64748b] mb-4 leading-relaxed">
                Permanently removes your account from Cognito, every course and trial you created,
                every entry you submitted across all trials (their leaderboards rebuild without you),
                and clears your sign-in cookies. <strong className="text-[#b91c1c]">This is immediate and cannot be undone.</strong> Backs
                your right to erasure (UK GDPR Art. 17).
              </p>

              {!confirmDelete ? (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="px-6 py-2.5 border border-[#b91c1c] text-[#b91c1c] font-bold text-sm tracking-widest hover:bg-[#fef2f2] transition-colors"
                >
                  DELETE MY ACCOUNT
                </button>
              ) : (
                <div className="border border-[#b91c1c] bg-[#fef2f2] p-4 flex flex-col gap-3">
                  <p className="text-sm text-[#0f172a]">
                    Type <strong>DELETE</strong> to confirm. There is no undo.
                  </p>
                  <input
                    type="text"
                    value={confirmText}
                    onChange={e => setConfirmText(e.target.value)}
                    className="bg-white border border-[#e2e8f0] px-3 py-2 text-[#0f172a] text-sm focus:outline-none focus:border-[#b91c1c]"
                    autoFocus
                  />
                  <div className="flex gap-3 flex-wrap">
                    <button
                      type="button"
                      onClick={deleteAccount}
                      disabled={confirmText !== 'DELETE' || working === 'delete'}
                      className="px-6 py-2.5 bg-[#b91c1c] text-white font-bold text-sm tracking-widest hover:bg-[#dc2626] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {working === 'delete' ? 'DELETING…' : 'CONFIRM DELETION'}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setConfirmDelete(false); setConfirmText('') }}
                      disabled={working === 'delete'}
                      className="px-6 py-2.5 border border-[#64748b] text-[#64748b] text-sm tracking-widest hover:bg-[#f1f5f9] disabled:opacity-50 transition-colors"
                    >
                      CANCEL
                    </button>
                  </div>
                </div>
              )}
            </section>

            {error && (
              <div className="border border-[#b91c1c] bg-[#fef2f2] px-3 py-2 text-[#b91c1c] text-xs">
                {error}
              </div>
            )}

            <section className="text-xs text-[#64748b] border-t border-[#e2e8f0] pt-6">
              See the{' '}
              <Link href="/att/privacy" className="tt-link">privacy policy</Link>{' '}
              for full details on what we hold, why, and how to exercise rights we can&apos;t handle from
              this page. For rectification or other requests, email{' '}
              <a href="mailto:privacy@paddlesnitch.com" className="tt-link">
                privacy@paddlesnitch.com
              </a>
              .
            </section>
          </>
        )}
      </div>
    </main>
  )
}
