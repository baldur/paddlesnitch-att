'use client'
import { useEffect, useState } from 'react'

// Floating "Report an issue" button for the analyse site (#157). Mirrors the
// ATT app's widget, dark-themed to match /analyse. Submissions POST to the
// existing ATT feedback endpoint at /att/api/feedback — in production both apps
// sit behind the same CloudFront distribution / origin, so an absolute-path
// fetch reaches the ATT server which files the GitHub issue. Reusing that
// endpoint keeps the GitHub token in one place (no new secret/IAM on the
// analysis Lambda).
export default function FeedbackWidget() {
  const [open, setOpen] = useState(false)
  const [description, setDescription] = useState('')
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'done' | 'error'>('idle')
  const [error, setError] = useState('')
  const [issueUrl, setIssueUrl] = useState('')
  // Anti-bot (see apps/att/src/lib/anti-bot.ts): `website` is a hidden honeypot
  // real users never fill; `openedAt` feeds the server's time-trap (a submit
  // faster than MIN_ELAPSED_MS is treated as a bot).
  const [website, setWebsite] = useState('')
  const [openedAt, setOpenedAt] = useState(0)

  useEffect(() => {
    if (open) setOpenedAt(Date.now())
  }, [open])

  // Close with Escape
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const reset = () => {
    setDescription('')
    setEmail('')
    setStatus('idle')
    setError('')
    setIssueUrl('')
    setWebsite('')
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (status === 'sending') return
    setStatus('sending')
    setError('')
    try {
      const res = await fetch('/att/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description,
          email,
          url: window.location.href,
          userAgent: navigator.userAgent,
          viewport: `${window.innerWidth}x${window.innerHeight}`,
          website,
          elapsedMs: openedAt ? Date.now() - openedAt : 0,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error ?? 'Could not file the report')
      setIssueUrl(data?.url ?? '')
      setStatus('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not file the report')
      setStatus('error')
    }
  }

  // z-[1100] / z-[1500]: clear Leaflet's panes (z-200..z-800) and the map
  // controls, same as the ATT widget.
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-4 right-4 z-[1100] border border-[#1e293b] bg-[#0f172a] shadow-md px-3 py-2 text-xs text-[#94a3b8] tracking-widest hover:border-[#0369a1] hover:text-[#e2e8f0] transition-colors"
        aria-label="Report an issue"
      >
        REPORT AN ISSUE
      </button>
    )
  }

  return (
    <div
      className="fixed inset-0 z-[1500] bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={() => setOpen(false)}
    >
      <div
        className="bg-[#0f172a] border border-[#1e293b] w-full sm:max-w-md sm:shadow-xl flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <header className="border-b border-[#1e293b] px-4 py-3 flex items-center justify-between">
          <span className="text-xs text-[#e2e8f0] tracking-widest">REPORT AN ISSUE</span>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-[#64748b] hover:text-[#e2e8f0] text-sm"
            aria-label="Close"
          >
            ✕
          </button>
        </header>

        {status === 'done' ? (
          <div className="flex flex-col gap-4 px-4 py-6 text-sm">
            <p className="text-[#22c55e]">Thanks — your report has been filed.</p>
            {issueUrl && (
              <p className="text-xs text-[#94a3b8]">
                Tracked at{' '}
                <a href={issueUrl} target="_blank" rel="noopener noreferrer" className="text-[#0369a1] hover:underline">
                  {issueUrl.replace(/^https?:\/\//, '')}
                </a>
              </p>
            )}
            <button
              type="button"
              onClick={() => { reset(); setOpen(false) }}
              className="self-end px-4 py-2 bg-[#0369a1] text-white text-xs tracking-widest hover:bg-[#0284c7] transition-colors"
            >
              CLOSE
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-4 px-4 py-4">
            {/* Honeypot — visually hidden, skipped by keyboard + screen readers. */}
            <div aria-hidden="true" style={{ position: 'absolute', left: '-10000px', width: 1, height: 1, overflow: 'hidden' }}>
              <label>
                Website
                <input
                  type="text"
                  name="website"
                  tabIndex={-1}
                  autoComplete="off"
                  value={website}
                  onChange={e => setWebsite(e.target.value)}
                />
              </label>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-[#94a3b8] tracking-widest">WHAT WENT WRONG?</label>
              <textarea
                required
                minLength={10}
                maxLength={5000}
                value={description}
                onChange={e => setDescription(e.target.value)}
                rows={5}
                autoFocus
                placeholder="A short description helps. What were you doing when this happened?"
                className="bg-[#0b1220] border border-[#1e293b] px-3 py-2 text-[#e2e8f0] text-sm focus:outline-none focus:border-[#0369a1] transition-colors resize-y"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-[#94a3b8] tracking-widest">EMAIL (OPTIONAL)</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="So we can follow up if needed"
                className="bg-[#0b1220] border border-[#1e293b] px-3 py-2 text-[#e2e8f0] text-sm focus:outline-none focus:border-[#0369a1] transition-colors"
              />
            </div>
            {error && (
              <div className="border border-[#7f1d1d] bg-[#450a0a] px-3 py-2 text-[#fca5a5] text-xs">
                {error}
              </div>
            )}
            <p className="text-xs text-[#64748b]">
              We&apos;ll automatically include the page you&apos;re on, your browser, and (if signed in) your
              account name — so you don&apos;t need to repeat it.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={status === 'sending'}
                className="px-4 py-2 border border-[#1e293b] text-[#94a3b8] text-xs tracking-widest hover:bg-[#1e293b] transition-colors"
              >
                CANCEL
              </button>
              <button
                type="submit"
                disabled={status === 'sending' || description.trim().length < 10}
                className="px-4 py-2 bg-[#0369a1] text-white text-xs tracking-widest hover:bg-[#0284c7] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {status === 'sending' ? 'SENDING…' : 'SEND REPORT'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
