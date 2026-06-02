'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import type { AuthUser } from '@/lib/types'

export default function AuthNav() {
  const router = useRouter()
  const [user, setUser] = useState<AuthUser | null | undefined>(undefined)

  useEffect(() => {
    fetch('/att/api/auth/me')
      .then(r => (r.ok ? r.json() : null))
      .then(setUser)
      .catch(() => setUser(null))
  }, [])

  const logout = async () => {
    await fetch('/att/api/auth/logout', { method: 'POST' })
    // Three steps because each one fails for different reasons in isolation:
    //   - setUser(null) flips this Client Component's UI immediately
    //   - router.refresh() re-renders Server Components so anything
    //     gated on getAuthUser() reflects the signed-out state
    //   - router.push('/att') navigates home (no-op if already there)
    setUser(null)
    router.refresh()
    router.push('/att')
  }

  if (user === undefined) return null // loading — don't flash incorrect state

  if (!user) {
    return (
      <Link href="/att/auth" className="tt-nav-link">
        SIGN IN
      </Link>
    )
  }

  return (
    <>
      <span className="text-[#0f172a]">{user.displayName}</span>
      <button onClick={logout} className="text-[#64748b] hover:text-[#b91c1c] transition-colors">
        SIGN OUT
      </button>
    </>
  )
}
