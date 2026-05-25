'use client'
import dynamic from 'next/dynamic'
import type { CourseMetadata } from '@/lib/types'

const CourseMap = dynamic(() => import('./CourseMap'), { ssr: false })

export default function CourseMapClient({ course }: { course: CourseMetadata }) {
  return <CourseMap course={course} />
}
