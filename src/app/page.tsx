import Link from 'next/link'

export const metadata = {
  title: 'paddlesnitch.com — tools for the river',
  description: 'A growing suite of software for paddlers, rowers, and river clubs.',
}

// PRODUCTS is the editable bit. Add / remove / rename freely as the roadmap
// firms up. The page below renders whatever's here.
//
// `available` items get a CTA button and link to their product. `coming-soon`
// items are inert cards with just a description — keep them honest, no
// pre-launch fanfare or signup forms.
type Product = {
  name: string
  short: string                              // one-line subtitle
  details: string                            // 1-2 sentences expanding it
  status: 'available' | 'coming-soon'
  href?: string                              // only when available
  cta?: string                               // CTA button text
}

const PRODUCTS: Product[] = [
  {
    name: 'Automated Time Trials',
    short: 'GPS-verified river racing for kayak & rowing.',
    details:
      'Organisers draw start and finish lines on a map; paddlers and rowers upload their GPS traces from any device. The system extracts the segment between the lines and ranks results, with 500 m splits, boat-class filtering, and crew listings.',
    status: 'available',
    href: '/att',
    cta: 'OPEN ATT',
  },
  {
    name: 'River Conditions',
    short: 'Live water levels, flow, and weather for UK rivers.',
    details:
      'Quick check before you drive out: is the river running, is it safe, is it worth it. Aggregated gauge and forecast data, no apps to install.',
    status: 'coming-soon',
  },
  {
    name: 'Club Hub',
    short: 'Membership, sessions, and comms for clubs.',
    details:
      'Lightweight admin for kayak and rowing clubs — member rolls, session sign-ups, and a shared notice board that doesn’t live on WhatsApp.',
    status: 'coming-soon',
  },
]

export default function LandingPage() {
  return (
    <main className="flex-1 flex flex-col">
      <header className="border-b border-[#e2e8f0] px-4 py-3 flex items-center justify-between">
        <div>
          <span className="text-[#0f172a] font-bold text-lg tracking-widest">PADDLESNITCH.COM</span>
          <span className="text-[#64748b] text-xs tracking-widest ml-3 hidden sm:inline">
            TOOLS FOR THE RIVER
          </span>
        </div>
      </header>

      <section className="border-b border-[#e2e8f0] px-4 py-16 text-center bg-[#f8fafc]">
        <p className="text-[#64748b] text-xs tracking-[0.3em] uppercase mb-3">
          A growing suite
        </p>
        <h1 className="text-3xl md:text-5xl font-bold text-[#0f172a] mb-3">
          Software for paddlers, rowers, and river clubs.
        </h1>
        <p className="text-[#64748b] text-sm max-w-xl mx-auto leading-relaxed">
          Practical tools that disappear into the river day. Honest, no-bloat,
          designed for people who&apos;d rather be on the water.
        </p>
      </section>

      <section className="flex-1 px-4 py-12 max-w-3xl mx-auto w-full">
        <h2 className="text-xs text-[#64748b] tracking-[0.2em] uppercase mb-6">
          Products
        </h2>
        <div className="flex flex-col gap-4">
          {PRODUCTS.map(p => (
            <article
              key={p.name}
              className="border border-[#e2e8f0] p-6 flex flex-col gap-3"
            >
              <div className="flex items-start justify-between gap-4">
                <h3 className="text-lg font-bold text-[#0f172a]">{p.name}</h3>
                <span
                  className={`text-[10px] tracking-widest px-2 py-0.5 border whitespace-nowrap shrink-0 ${
                    p.status === 'available'
                      ? 'border-[#15803d] text-[#15803d]'
                      : 'border-[#64748b] text-[#64748b]'
                  }`}
                >
                  {p.status === 'available' ? 'AVAILABLE NOW' : 'COMING SOON'}
                </span>
              </div>
              <p className="text-sm text-[#0f172a]">{p.short}</p>
              <p className="text-sm text-[#64748b] leading-relaxed">{p.details}</p>
              {p.href && p.cta && (
                <Link
                  href={p.href}
                  className="self-start mt-2 px-4 py-2 bg-[#0369a1] text-white text-xs tracking-widest hover:bg-[#0284c7] transition-colors"
                >
                  {p.cta}
                </Link>
              )}
            </article>
          ))}
        </div>

        <p className="text-xs text-[#64748b] text-center mt-12">
          Curious about the next ones? Use the &quot;Report an issue&quot; widget below
          to tell us what you&apos;d like to see.
        </p>
      </section>
    </main>
  )
}
