'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { isSyntheticStravaEmail } from '@/lib/strava-account'

// Subtle banner shown to Strava-only accounts (those signed in with a
// synthesised email) so they know we can't reach them about T&C
// changes or account events unless they add a real contact email.
//
// Render-decision rules:
//  - user is signed in
//  - user.email looks like a synth email
//  - they haven't already saved a contact email
//  - they haven't dismissed the banner this browser
//
// Dismissal is a cookie so it's per-browser (a user on a new device
// gets the prompt again). The contact email itself is per-account
// and durable.
//
// Mounted from src/app/layout.tsx so it shows above every page.

const DISMISS_KEY = 'tt_strava_email_banner_dismissed'

function hasDismissCookie(): boolean {
  if (typeof document === 'undefined') return false
  return document.cookie.split('; ').some(c => c.startsWith(`${DISMISS_KEY}=1`))
}

function setDismissCookie() {
  // 6 months; long enough that we don't keep nagging.
  const sixMonths = 60 * 60 * 24 * 180
  document.cookie = `${DISMISS_KEY}=1; max-age=${sixMonths}; path=/; samesite=lax`
}

export default function StravaContactBanner() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (hasDismissCookie()) return
    let cancelled = false
    ;(async () => {
      const me = await fetch('/att/api/auth/me').then(r => (r.ok ? r.json() : null))
      if (cancelled || !me) return
      if (!isSyntheticStravaEmail(me.email)) return
      const contact = await fetch('/att/api/account/contact').then(r => (r.ok ? r.json() : null))
      if (cancelled) return
      if (contact?.contact?.email) return
      setShow(true)
    })()
    return () => { cancelled = true }
  }, [])

  if (!show) return null

  const dismiss = () => {
    setDismissCookie()
    setShow(false)
  }

  return (
    <div className="border-b border-[#fed7aa] bg-[#fff7ed] text-[#9a3412] text-xs px-4 py-2 flex items-center justify-between gap-4">
      <span>
        You signed in with Strava and we can&apos;t email you about T&amp;C changes or account
        events. <Link href="/att/account" className="underline hover:no-underline">Add a contact email</Link>?
      </span>
      <button
        type="button"
        onClick={dismiss}
        className="text-[#9a3412] hover:text-[#7c2d12] text-xs tracking-widest shrink-0"
        aria-label="Dismiss this banner"
      >
        DISMISS
      </button>
    </div>
  )
}
