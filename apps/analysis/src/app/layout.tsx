import type { Metadata, Viewport } from 'next'
import { IBM_Plex_Mono } from 'next/font/google'
import './globals.css'
import FeedbackWidget from '@/components/FeedbackWidget'

const ibmPlexMono = IBM_Plex_Mono({
  weight: ['400', '500', '600', '700'],
  subsets: ['latin'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Paddle Analysis — paddlesnitch',
  description: 'Upload a paddle, see what actually happened.',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0b1220',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={ibmPlexMono.className}>
      <body className="bg-[#0b1220] text-[#e2e8f0]">
        {children}
        <FeedbackWidget />
      </body>
    </html>
  )
}
