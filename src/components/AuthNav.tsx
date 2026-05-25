'use client'
import { useState, useEffect } from 'react'
import type { AuthUser } from '@/lib/types'

export default function AuthNav() {
  const [user, setUser] = useState<AuthUser | null | undefined>(undefined)

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => (r.ok ? r.json() : null))
      .then(setUser)
      .catch(() => setUser(null))
  }, [])

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    window.location.href = '/'
  }

  if (user === undefined) return null // loading — don't flash incorrect state

  if (!user) {
    return (
      <a href="/auth" className="text-[#64748b] hover:text-[#0369a1] transition-colors">
        SIGN IN
      </a>
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
