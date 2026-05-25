import Link from 'next/link'

export default function LandingPage() {
  return (
    <main className="flex-1 flex flex-col items-center justify-center px-4 text-center">
      <h1 className="text-2xl font-bold text-[#0f172a] tracking-widest mb-2">
        PADDLESNITCH.COM
      </h1>
      <p className="text-[#64748b] text-sm mb-8">GPS-verified river racing for kayak &amp; rowing.</p>
      <Link
        href="/att"
        className="text-[#0369a1] text-sm tracking-widest hover:underline"
      >
        → AUTOMATED TIME TRIALS (ATT)
      </Link>
    </main>
  )
}
