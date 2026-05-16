export default function Home() {
  return (
    <main className="flex-1 flex flex-col">
      <header className="border-b border-[#262626] px-4 py-3 flex items-center justify-between">
        <div>
          <span className="text-[#f59e0b] font-bold text-lg tracking-widest glow-amber">RRC</span>
          <span className="text-[#e5e5e5] font-bold text-lg tracking-widest ml-2">TIME TRIALS</span>
        </div>
        <nav className="flex gap-4 text-sm text-[#525252]">
          <a href="/admin/courses/new" className="hover:text-[#f59e0b] transition-colors">
            + NEW COURSE
          </a>
        </nav>
      </header>

      <section className="relative scanlines border-b border-[#262626] px-4 py-12 text-center bg-[#141414]">
        <p className="text-[#525252] text-xs tracking-[0.3em] uppercase mb-3">
          GPS-verified river racing
        </p>
        <h1 className="text-5xl md:text-7xl font-bold text-[#f59e0b] glow-amber tabular mb-2">
          00:00.0
        </h1>
        <p className="text-[#525252] text-sm">Upload your trace. See your split.</p>
      </section>

      <section className="flex-1 px-4 py-8 max-w-3xl mx-auto w-full">
        <h2 className="text-xs text-[#525252] tracking-[0.2em] uppercase mb-6">
          Open Time Trials
        </h2>
        <div className="border border-[#262626] p-8 text-center text-[#525252] text-sm">
          No open trials yet.{' '}
          <a href="/admin/courses/new" className="text-[#f59e0b] hover:underline">
            Create a course
          </a>{' '}
          to get started.
        </div>
      </section>
    </main>
  )
}
