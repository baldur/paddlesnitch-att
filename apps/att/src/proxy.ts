import { NextRequest, NextResponse } from 'next/server'

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Auth routes always public
  if (pathname.startsWith('/att/auth') || pathname.startsWith('/att/api/auth')) {
    return NextResponse.next()
  }

  // Paddle-analysis tool: stateless, no persistence, nothing to protect —
  // public so it's a frictionless "drop a file, see the analysis" utility
  // (playable prototype; moves to apps/analysis later).
  if (pathname.startsWith('/att/api/analyse')) {
    return NextResponse.next()
  }

  // Admin pages always require auth
  const requiresAuth =
    pathname.startsWith('/att/admin') ||
    (req.method !== 'GET' && pathname.startsWith('/att/api') && !pathname.startsWith('/att/api/auth'))

  if (requiresAuth && !req.cookies.get('tt_id')) {
    const url = req.nextUrl.clone()
    url.pathname = '/att/auth'
    url.searchParams.set('next', pathname)
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  // Run on all routes except Next.js internals and static files
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
