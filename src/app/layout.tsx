import type { Metadata, Viewport } from 'next'
import { IBM_Plex_Mono } from 'next/font/google'
import './globals.css'
import Footer from '@/components/Footer'
import CookieNotice from '@/components/CookieNotice'
import FeedbackWidget from '@/components/FeedbackWidget'

const ibmPlexMono = IBM_Plex_Mono({
  weight: ['400', '500', '600', '700'],
  subsets: ['latin'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'ATTS — Automated Time Trials System',
  description: 'GPS-verified river racing — splits, leaderboards, and biometric data for kayak and rowing',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#ffffff',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={ibmPlexMono.className}>
      <body className="min-h-screen flex flex-col bg-white text-[#0f172a]">
        {children}
        <Footer />
        <CookieNotice />
        <FeedbackWidget />
      </body>
    </html>
  )
}
