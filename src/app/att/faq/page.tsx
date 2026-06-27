import Link from 'next/link'
import { readFaqDoc, parseFaq, faqParagraphs } from '@/lib/faq'
import AppHeader from '@/components/AppHeader'

// Public read-only help page, rendered server-side from legal/faq.md.
// Kept as Markdown so editors can add questions without touching code —
// see #78.
export const dynamic = 'force-dynamic'

export default async function FaqPage() {
  const body = await readFaqDoc()
  const entries = body ? parseFaq(body) : []

  return (
    <main className="flex-1 flex flex-col">
      <AppHeader
        breadcrumb={
          <>
            <Link href="/att" className="tt-nav-link text-sm">← HOME</Link>
            <span className="text-[#64748b]">/</span>
            <span className="text-[#0f172a] text-sm">HELP / FAQ</span>
          </>
        }
      />

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
                <div className="flex flex-col gap-3">
                  {faqParagraphs(entry.answer).map((para, i) => (
                    <p key={i} className="text-sm text-[#64748b] leading-relaxed">
                      {para}
                    </p>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
