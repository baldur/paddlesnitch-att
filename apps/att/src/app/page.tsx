import Link from 'next/link'

export const metadata = {
  title: 'paddlesnitch.com — tools for the river',
  description: 'A growing suite of software for paddlers, rowers, and river groups.',
}

// One available product, then a couple of anonymous teaser slots so the
// homepage reads as a suite-in-progress without committing publicly to
// what the next two are. Promote a teaser by adding name/short/details/
// href/cta and flipping status to 'available'.
type Product = {
  name?: string
  short?: string                             // one-line subtitle
  details?: string                           // 1-2 sentences expanding it
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
    name: 'Paddle Analysis',
    short: 'Upload a paddle, see what actually happened.',
    details:
      'Drop a GPS trace from any device and get an instant read of the session: your pieces and rest, stroke-rate consistency, distance-per-stroke, and the day’s wind and river flow — on an interactive map coloured by speed or stroke rate.',
    status: 'available',
    href: '/att/analyse',
    cta: 'TRY ANALYSIS',
  },
  { status: 'coming-soon' },
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
          Software for paddlers, rowers, and river groups.
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
          {PRODUCTS.map((p, i) => {
            if (p.status === 'coming-soon') {
              return (
                <article
                  key={`teaser-${i}`}
                  className="border border-dashed border-[#e2e8f0] bg-[#f8fafc] p-6 flex items-center justify-end h-24"
                  aria-label="Coming soon"
                >
                  <span className="text-[10px] tracking-widest px-2 py-0.5 border border-[#cbd5e1] text-[#94a3b8] whitespace-nowrap">
                    COMING SOON
                  </span>
                </article>
              )
            }
            return (
              <article
                key={p.name}
                className="border border-[#e2e8f0] p-6 flex flex-col gap-3"
              >
                <div className="flex items-start justify-between gap-4">
                  <h3 className="text-lg font-bold text-[#0f172a]">{p.name}</h3>
                  <span className="text-[10px] tracking-widest px-2 py-0.5 border border-[#15803d] text-[#15803d] whitespace-nowrap shrink-0">
                    AVAILABLE NOW
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
            )
          })}
        </div>

        <p className="text-xs text-[#64748b] text-center mt-12">
          Curious about the next ones? Use the &quot;Report an issue&quot; widget below
          to tell us what you&apos;d like to see.
        </p>
      </section>
    </main>
  )
}
