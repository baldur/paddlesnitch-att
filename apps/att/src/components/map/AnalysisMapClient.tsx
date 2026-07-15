'use client'
import dynamic from 'next/dynamic'
import type { AnalysisPoint, Segment } from '@/lib/analysis'

const AnalysisMap = dynamic(() => import('./AnalysisMap'), { ssr: false })

export default function AnalysisMapClient(props: { points: AnalysisPoint[]; stops: Segment[]; surges: Segment[]; metric: 'speed' | 'sr'; cursor?: number | null }) {
  return <AnalysisMap {...props} />
}
