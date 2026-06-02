import Link from 'next/link'
import { getJson, listKeys } from '@/lib/storage'
import AuthNav from '@/components/AuthNav'
import type { CourseMetadata, TrialMetadata } from '@/lib/types'

// Reads live course state from storage on every request — never prerender.
export const dynamic = 'force-dynamic'

type CourseWithCounts = {
  course: CourseMetadata
  trialCount: number
  openCount: number
}

async function getCoursesWithCounts(): Promise<CourseWithCounts[]> {
  const keys = await listKeys('courses/')
  const metaKeys = keys.filter(k => k.endsWith('metadata.json'))
  const courses = (
    await Promise.all(metaKeys.map(k => getJson<CourseMetadata>(k)))
  ).filter((c): c is CourseMetadata => c !== null)

  // Fetch trials once and group by courseId — cheaper than N queries.
  const trialKeys = await listKeys('trials/')
  const trialMetaKeys = trialKeys.filter(
    k => k.endsWith('metadata.json') && !k.includes('/entries/')
  )
  const trials = (
    await Promise.all(trialMetaKeys.map(k => getJson<TrialMetadata>(k)))
  ).filter((t): t is TrialMetadata => t !== null)

  return courses
    .map(course => {
      const courseTrials = trials.filter(t => t.courseId === course.id)
      return {
        course,
        trialCount: courseTrials.length,
        openCount: courseTrials.filter(t => t.status === 'open').length,
      }
    })
    .sort((a, b) => b.openCount - a.openCount || a.course.name.localeCompare(b.course.name))
}

function courseTypeLabel(course: CourseMetadata): string {
  if (course.gates && course.gates.length >= 2) return `${course.gates.length}-gate`
  if (course.type === 'loop' || course.type === 'lap' || course.type === 'figure_eight') return 'Loop'
  if (course.type === 'gate' || course.type === 'out_and_back') return 'Gate'
  return 'Point-to-point'
}

export default async function CoursesCataloguePage() {
  const courses = await getCoursesWithCounts()

  return (
    <main className="flex-1 flex flex-col">
      <header className="border-b border-[#e2e8f0] px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/att" className="tt-nav-link text-sm">
            ← HOME
          </Link>
          <span className="text-[#64748b]">/</span>
          <span className="text-[#0f172a] text-sm">COURSES</span>
        </div>
        <nav className="flex gap-4 text-sm text-[#64748b] items-center">
          <Link href="/att/admin/courses/new" className="tt-nav-link">
            + NEW COURSE
          </Link>
          <AuthNav />
        </nav>
      </header>

      <div className="flex-1 px-4 py-8 max-w-3xl mx-auto w-full">
        <h1 className="text-lg font-bold text-[#0f172a] tracking-widest mb-2">COURSE CATALOGUE</h1>
        <p className="text-sm text-[#64748b] mb-8">
          Browse all courses. Any signed-in user can open a new time trial on any course.
        </p>

        {courses.length === 0 ? (
          <div className="border border-[#e2e8f0] p-8 text-center text-[#64748b] text-sm">
            No courses yet.{' '}
            <Link href="/att/admin/courses/new" className="tt-link">
              Create the first one
            </Link>
            .
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {courses.map(({ course, trialCount, openCount }) => (
              <Link
                key={course.id}
                href={`/att/courses/${course.id}`}
                className="border border-[#e2e8f0] px-4 py-4 hover:border-[#0369a1] transition-colors group"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-[#0f172a] font-bold group-hover:text-[#0369a1] transition-colors">
                      {course.name}
                    </div>
                    <div className="text-xs text-[#64748b] mt-0.5 tabular">
                      {course.sport.toUpperCase()} ·{' '}
                      {course.distanceMetres > 0 ? `${course.distanceMetres.toLocaleString()} m` : '—'} ·{' '}
                      {courseTypeLabel(course)}
                    </div>
                  </div>
                  <div className="text-right text-xs shrink-0">
                    {openCount > 0 && (
                      <div className="border border-[#15803d] text-[#15803d] px-2 py-0.5 mb-1 inline-block">
                        {openCount} OPEN
                      </div>
                    )}
                    <div className="text-[#64748b]">
                      {trialCount} trial{trialCount === 1 ? '' : 's'}
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
