import Link from 'next/link'

// Site footer. Always visible on /att/* pages. Provides discoverability for
// the privacy policy and surfaces the controller identity at a glance.
export default function Footer() {
  return (
    <footer className="border-t border-[#e2e8f0] px-4 py-4 text-xs text-[#64748b] flex flex-wrap items-center justify-between gap-3">
      <div>
        © {new Date().getFullYear()} paddlesnitch.com
      </div>
      <nav className="flex gap-4">
        <Link href="/att/privacy" className="tt-nav-link">PRIVACY</Link>
        <Link href="/att/account" className="tt-nav-link">ACCOUNT</Link>
      </nav>
    </footer>
  )
}
