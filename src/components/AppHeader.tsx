import type { ReactNode } from 'react'
import AuthNav from '@/components/AuthNav'
import ReportLink from '@/components/ReportLink'

// Shared page header: a breadcrumb on the left, a nav on the right that always
// ends with <AuthNav />. The wrapping <header> uses `flex-wrap` so that on a
// narrow (mobile) viewport the two groups drop to separate lines instead of
// overlapping — see issue #100. Previously this markup was copy-pasted inline
// across every page under src/app/att/, so the overlap bug existed everywhere;
// owning the header here fixes it once.
export default function AppHeader({
  breadcrumb,
  children,
}: {
  breadcrumb: ReactNode
  children?: ReactNode
}) {
  return (
    <header className="border-b border-[#e2e8f0] px-4 py-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <div className="flex items-center gap-4 min-w-0">{breadcrumb}</div>
      <nav className="flex gap-4 text-sm text-[#64748b] items-center shrink-0">
        {children}
        <ReportLink />
        <AuthNav />
      </nav>
    </header>
  )
}
