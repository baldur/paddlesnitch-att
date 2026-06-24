import Link from 'next/link'
import { readFaqDoc, parseFaq } from '@/lib/faq'
import AuthNav from '@/components/AuthNav'

// Public read-only help page, rendered server-side from legal/faq.md.
// Kept as Markdown so editors can add questions without touching code —
// see #78.
export const dynamic = 'force-dynamic'

export default async function FaqPage() {
  const body = await readFaqDoc()
  const entries = body ? parseFaq(body) : []

  return (
    <main className="flex-1 flex flex-col">
      <header className="border-b border-[#e2e8f0] px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/att" className="tt-nav-link text-sm">← HOME</Link>
          <span className="text-[#64748b]">/</span>
          <span className="text-[#0f172a] text-sm">HELP / FAQ</span>
        </div>
        <nav className="flex gap-4 text-sm text-[#64748b] items-center">
          <AuthNav />
        </nav>
      </header>

      <div className="flex-1 px-4 py-8 max-w-2xl mx-auto w-full">
        <h1 className="text-lg font-bold text-[#0f172a] tracking-widest mb-8">
          FREQUENTLY ASKED QUESTIONS
        </h1>
        {entries.length === 0 ? (
          <p className="text-sm text-[#b91c1c]">
            The FAQ is unavailable right now. Please contact privacy@paddlesnitch.com.
          </p>
        ) : (
          <div className="flex flex-col divide-y divide-[#e2e8f0]">
            {entries.map(entry => (
              <section key={entry.question} className="py-5 first:pt-0">
                <h2 className="text-sm font-bold text-[#0f172a] mb-2">{entry.question}</h2>
                <p className="text-sm text-[#64748b] leading-relaxed whitespace-pre-wrap">
                  {entry.answer}
                </p>
              </section>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
