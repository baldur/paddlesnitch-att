'use client'
import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

// Fires a `pageview` beacon to /att/api/track on every route change. Enabled in
// production builds; off in dev/test so local navigation doesn't emit. Set
// NEXT_PUBLIC_ANALYTICS=0 to force it off (kill switch). Uses
// navigator.sendBeacon so the request survives the navigation that triggered
// it. No PII: the only id sent is a random per-tab session id from sessionStorage.
const ENABLED =
  process.env.NEXT_PUBLIC_ANALYTICS !== '0' &&
  process.env.NODE_ENV === 'production'

function sessionId(): string {
  try {
    const KEY = 'tt_sid'
    let sid = sessionStorage.getItem(KEY)
    if (!sid) {
      sid = (crypto?.randomUUID?.() ?? String(Math.random())).slice(0, 32)
      sessionStorage.setItem(KEY, sid)
    }
    return sid
  } catch {
    return 'anon'
  }
}

export function track(event: string, path?: string) {
  if (!ENABLED) return
  try {
    const payload = JSON.stringify({ event, path, sid: sessionId() })
    const blob = new Blob([payload], { type: 'application/json' })
    if (navigator.sendBeacon?.('/att/api/track', blob)) return
    // Fallback for browsers without sendBeacon.
    fetch('/att/api/track', { method: 'POST', body: payload, headers: { 'Content-Type': 'application/json' }, keepalive: true })
  } catch {
    // analytics must never throw into the app
  }
}

export default function Analytics() {
  const pathname = usePathname()
  useEffect(() => {
    if (!ENABLED || !pathname) return
    track('pageview', pathname)
  }, [pathname])
  return null
}
