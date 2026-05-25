'use client'
import { useState, useRef, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import AuthNav from '@/components/AuthNav'
import type { AuthUser } from '@/lib/types'

export default function UploadPage({
  params,
}: {
  params: Promise<{ trialId: string }>
}) {
  const { trialId } = use(params)
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [authUser, setAuthUser] = useState<AuthUser | null | undefined>(undefined)
  const [status, setStatus] = useState<'idle' | 'uploading' | 'error'>('idle')
  const [error, setError] = useState('')
  const [inputMode, setInputMode] = useState<'file' | 'url'>('file')
  const [activityUrl, setActivityUrl] = useState('')

  useEffect(() => {
    fetch('/att/api/auth/me')
      .then(r => (r.ok ? r.json() : null))
      .then(setAuthUser)
      .catch(() => setAuthUser(null))
  }, [])

  const handleFileSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const file = fileRef.current?.files?.[0]
    if (!file) return

    setStatus('uploading')
    setError('')

    const formData = new FormData()
    formData.append('file', file)

    try {
      const res = await fetch(`/att/api/trials/${trialId}/upload`, {
        method: 'POST',
        body: formData,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Upload failed')
      router.push(`/att/trials/${trialId}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
      setStatus('error')
    }
  }

  const handleUrlSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!activityUrl.trim()) return

    setStatus('uploading')
    setError('')

    try {
      const res = await fetch(`/att/api/trials/${trialId}/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: activityUrl.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Upload failed')
      router.push(`/att/trials/${trialId}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
      setStatus('error')
    }
  }

  const inputClass = 'bg-white border border-[#e2e8f0] px-3 py-2 text-[#0f172a] text-sm focus:outline-none focus:border-[#0369a1] transition-colors w-full'

  return (
    <main className="flex-1 flex flex-col">
      <header className="border-b border-[#e2e8f0] px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <a
            href={`/att/trials/${trialId}`}
            className="text-[#64748b] hover:text-[#0369a1] text-sm transition-colors"
          >
            ← LEADERBOARD
          </a>
          <span className="text-[#64748b]">/</span>
          <span className="text-[#0f172a] text-sm">UPLOAD TRACE</span>
        </div>
        <nav className="flex gap-4 text-sm text-[#64748b] items-center">
          <AuthNav />
        </nav>
      </header>

      <div className="flex-1 px-4 py-8 max-w-xl mx-auto w-full">
        {authUser === null ? (
          <div className="flex flex-col gap-4 text-center">
            <h1 className="text-lg font-bold text-[#0f172a] tracking-widest">
              SIGN IN TO SUBMIT
            </h1>
            <p className="text-sm text-[#64748b]">
              You need an account to submit a trace and appear on the leaderboard.
            </p>
            <a
              href={`/att/auth?next=/att/trials/${trialId}/upload`}
              className="px-6 py-2.5 bg-[#0369a1] text-white font-bold text-sm tracking-widest hover:bg-[#0284c7] transition-colors"
            >
              SIGN IN / SIGN UP
            </a>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            <h1 className="text-lg font-bold text-[#0f172a] tracking-widest">
              SUBMIT YOUR ACTIVITY
            </h1>
            <p className="text-sm text-[#64748b] -mt-4">
              Upload your full session — warmup and cooldown included. The system
              automatically finds the segment between the start and finish lines
              and extracts your time.
            </p>

            {/* Mode toggle */}
            <div className="flex border-b border-[#e2e8f0]">
              <button
                type="button"
                onClick={() => setInputMode('file')}
                className={`px-4 py-2 text-sm tracking-widest transition-colors ${
                  inputMode === 'file'
                    ? 'border-b-2 border-[#0369a1] text-[#0369a1] -mb-px'
                    : 'text-[#64748b] hover:text-[#0f172a]'
                }`}
              >
                UPLOAD FILE
              </button>
              <button
                type="button"
                onClick={() => setInputMode('url')}
                className={`px-4 py-2 text-sm tracking-widest transition-colors ${
                  inputMode === 'url'
                    ? 'border-b-2 border-[#0369a1] text-[#0369a1] -mb-px'
                    : 'text-[#64748b] hover:text-[#0f172a]'
                }`}
              >
                PASTE URL
              </button>
            </div>

            {inputMode === 'file' ? (
              <form onSubmit={handleFileSubmit} className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <label className="text-xs text-[#64748b] tracking-widest">
                    GPS FILE (.gpx, .fit, or .csv)
                  </label>
                  <input
                    ref={fileRef}
                    type="file"
                    required
                    accept=".gpx,.fit,.csv"
                    className="bg-white border border-[#e2e8f0] px-3 py-2 text-[#0f172a] text-sm file:bg-[#f1f5f9] file:text-[#0f172a] file:border-0 file:px-3 file:py-1 file:mr-3 file:text-xs file:cursor-pointer hover:border-[#0369a1] transition-colors cursor-pointer w-full"
                  />
                  <p className="text-xs text-[#64748b]">
                    Export your full activity from Garmin Connect, Strava, Apple Fitness, or any GPS device. GPX, FIT, and CSV are all supported.
                  </p>
                </div>

                {status === 'error' && (
                  <div className="border border-[#b91c1c] bg-[#fef2f2] px-3 py-3 text-[#b91c1c] text-xs">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={status === 'uploading'}
                  className="px-6 py-2.5 bg-[#0369a1] text-white font-bold text-sm tracking-widest hover:bg-[#0284c7] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {status === 'uploading' ? 'PROCESSING…' : 'SUBMIT TRACE'}
                </button>
              </form>
            ) : (
              <form onSubmit={handleUrlSubmit} className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <label className="text-xs text-[#64748b] tracking-widest">
                    ACTIVITY URL
                  </label>
                  <input
                    type="url"
                    required
                    placeholder="https://www.strava.com/activities/..."
                    value={activityUrl}
                    onChange={e => setActivityUrl(e.target.value)}
                    className={inputClass}
                  />
                  <p className="text-xs text-[#64748b]">
                    Paste a public Strava activity URL or a direct .gpx link. Your full session is fine — no need to trim it.
                  </p>
                </div>

                {status === 'error' && (
                  <div className="border border-[#b91c1c] bg-[#fef2f2] px-3 py-3 text-[#b91c1c] text-xs">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={status === 'uploading'}
                  className="px-6 py-2.5 bg-[#0369a1] text-white font-bold text-sm tracking-widest hover:bg-[#0284c7] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {status === 'uploading' ? 'FETCHING…' : 'SUBMIT URL'}
                </button>
              </form>
            )}
          </div>
        )}
      </div>
    </main>
  )
}
