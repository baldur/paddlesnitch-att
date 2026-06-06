'use client'
import { useEffect, useState } from 'react'

// Floating "Report an issue" button. Click opens a modal with a text area +
// optional email. Submission posts to /att/api/feedback which files a GitHub
// issue tagged `customer-reported`.
export default function FeedbackWidget() {
  const [open, setOpen] = useState(false)
  const [description, setDescription] = useState('')
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'done' | 'error'>('idle')
  const [error, setError] = useState('')
  const [issueUrl, setIssueUrl] = useState('')
  // Anti-bot:
  //   - `website` is a honeypot — visually hidden but present in the DOM.
  //     Bots that scrape and fill every input will set it; real users won't.
  //   - `openedAt` is the wall-clock ms when the modal opened. The server
  //     rejects submissions that arrive too quickly — humans take a few
  //     seconds to type a description.
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

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-4 right-4 z-40 border border-[#e2e8f0] bg-white shadow-md px-3 py-2 text-xs text-[#64748b] tracking-widest hover:border-[#0369a1] hover:text-[#0369a1] transition-colors"
        aria-label="Report an issue"
      >
        REPORT AN ISSUE
      </button>
    )
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/30 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={() => setOpen(false)}
    >
      <div
        className="bg-white border border-[#e2e8f0] w-full sm:max-w-md sm:shadow-xl flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <header className="border-b border-[#e2e8f0] px-4 py-3 flex items-center justify-between">
          <span className="text-xs text-[#0f172a] tracking-widest">REPORT AN ISSUE</span>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-[#64748b] hover:text-[#0f172a] text-sm"
            aria-label="Close"
          >
            ✕
          </button>
        </header>

        {status === 'done' ? (
          <div className="flex flex-col gap-4 px-4 py-6 text-sm">
            <p className="text-[#15803d]">Thanks — your report has been filed.</p>
            {issueUrl && (
              <p className="text-xs text-[#64748b]">
                Tracked at{' '}
                <a href={issueUrl} target="_blank" rel="noopener noreferrer" className="tt-link">
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
            {/* Honeypot — visually hidden, skipped by keyboard + screen readers.
                Real users never see or fill this; bots scraping inputs will. */}
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
              <label className="text-xs text-[#64748b] tracking-widest">WHAT WENT WRONG?</label>
              <textarea
                required
                minLength={10}
                maxLength={5000}
                value={description}
                onChange={e => setDescription(e.target.value)}
                rows={5}
                autoFocus
                placeholder="A short description helps. What were you doing when this happened?"
                className="bg-white border border-[#e2e8f0] px-3 py-2 text-[#0f172a] text-sm focus:outline-none focus:border-[#0369a1] transition-colors resize-y"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-[#64748b] tracking-widest">EMAIL (OPTIONAL)</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="So we can follow up if needed"
                className="bg-white border border-[#e2e8f0] px-3 py-2 text-[#0f172a] text-sm focus:outline-none focus:border-[#0369a1] transition-colors"
              />
            </div>
            {error && (
              <div className="border border-[#b91c1c] bg-[#fef2f2] px-3 py-2 text-[#b91c1c] text-xs">
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
                className="px-4 py-2 border border-[#e2e8f0] text-[#64748b] text-xs tracking-widest hover:bg-[#f1f5f9] transition-colors"
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
