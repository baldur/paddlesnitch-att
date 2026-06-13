import { NextRequest, NextResponse } from 'next/server'
import { nanoid } from 'nanoid'
import { getAuthUser } from '@/lib/auth'
import { getJson, putJson } from '@/lib/storage'
import { canViewCourse, canManageCourse } from '@/lib/permissions'
import { courseHasEntries, geometryChanged, GEOMETRY_FIELDS } from '@/lib/course-entries'
import type { CourseMetadata, Visibility } from '@/lib/types'

type Params = { params: Promise<{ courseId: string }> }

function isVisibility(v: unknown): v is Visibility {
  return v === 'public' || v === 'private'
}

export async function GET(_: NextRequest, { params }: Params) {
  const { courseId } = await params
  const course = await getJson<CourseMetadata>(`courses/${courseId}/metadata.json`)
  // Single 404 for both missing and not-allowed so we don't leak existence
  // of private resources.
  if (!course) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const viewer = await getAuthUser()
  if (!canViewCourse(course, viewer)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  return NextResponse.json(course)
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { courseId } = await params
  const course = await getJson<CourseMetadata>(`courses/${courseId}/metadata.json`)
  if (!course) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!canManageCourse(course, user)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()

  // Modify-creates-copy: if the patch touches geometry AND the course has any
  // entries on it, we MUST NOT mutate. The historical results are recorded
  // against this course's geometry; changing it would silently invalidate
  // them. Clone instead — the new course inherits ownership + visibility but
  // is a brand-new id with no trials attached.
  const wantsGeometryChange = geometryChanged(course as unknown as Record<string, unknown>, body)
  if (wantsGeometryChange && await courseHasEntries(course.id)) {
    const cloneId = nanoid()
    // Start from `body` so geometry fields apply, then layer the original
    // course on top of the non-geometry fields to preserve sport / name /
    // visibility unless the patch changes them.
    const clone: CourseMetadata = {
      ...course,
      ...pickGeometry(course, body),
      id: cloneId,
      // Edits are owned by whoever made them — usually the same person, but
      // a club admin in a future phase might trigger this with their own
      // identity. Tracks "this clone was created by X" cleanly.
      adminUserId: user.id,
      // Non-geometry edits carry over from the patch too.
      name: typeof body.name === 'string' ? body.name : course.name,
      visibility: isVisibility(body.visibility) ? body.visibility : course.visibility,
      createdAt: new Date().toISOString(),
    }
    await putJson(`courses/${cloneId}/metadata.json`, clone)
    // 201 + the new course payload + a `cloned: true` flag so the UI knows
    // to redirect to the new course's admin page instead of staying on the
    // original.
    return NextResponse.json({ ...clone, cloned: true, clonedFrom: course.id }, { status: 201 })
  }

  // Plain in-place edit. Whitelist mutable fields rather than spreading body
  // so a client can't sneak in adminUserId / id overrides via a PATCH.
  const next: CourseMetadata = { ...course }
  if (typeof body.name === 'string') next.name = body.name
  if (isVisibility(body.visibility)) next.visibility = body.visibility
  // Geometry edits on a course WITHOUT entries are also allowed in place —
  // there's nothing to preserve. Whitelist-merge to keep PATCH safe.
  for (const field of GEOMETRY_FIELDS) {
    if (field in body) {
      (next as unknown as Record<string, unknown>)[field] = body[field]
    }
  }
  if ('gates' in body) next.gates = body.gates
  await putJson(`courses/${courseId}/metadata.json`, next)
  return NextResponse.json(next)
}

// Returns an object containing only the geometry fields from `patch` that
// differ from `before`, with any not-touched fields defaulting to `before`.
// Used inside the clone branch so a clone has a fully populated CourseMetadata
// even when the patch only changed one geometry field.
function pickGeometry(
  before: CourseMetadata,
  patch: Record<string, unknown>,
): Partial<CourseMetadata> {
  const out: Record<string, unknown> = {}
  for (const field of GEOMETRY_FIELDS) {
    out[field] = field in patch ? patch[field] : (before as unknown as Record<string, unknown>)[field]
  }
  out.gates = 'gates' in patch ? patch.gates : before.gates
  return out as Partial<CourseMetadata>
}
