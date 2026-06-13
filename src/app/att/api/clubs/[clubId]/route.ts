import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { getClub, putClub, deleteClub, removeUserFromClubIndex } from '@/lib/clubs'
import { canManageClub, canViewClub, canDeleteClub } from '@/lib/permissions'
import type { ClubMetadata } from '@/lib/types'

type Params = { params: Promise<{ clubId: string }> }

// GET /att/api/clubs/[clubId]
// Owner / admin / member: full payload incl. membership.
// Non-member signed-in OR unauthenticated: 404 (clubs aren't publicly browsable).
export async function GET(_: NextRequest, { params }: Params) {
  const { clubId } = await params
  const club = await getClub(clubId)
  if (!club) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const viewer = await getAuthUser()
  if (!canViewClub(club, viewer)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  return NextResponse.json(club)
}

// PATCH /att/api/clubs/[clubId]
// Owner / admin can update name + description. Only the owner can promote
// or demote admins; that lives in the dedicated /members endpoint.
export async function PATCH(req: NextRequest, { params }: Params) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { clubId } = await params
  const club = await getClub(clubId)
  if (!club) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!canManageClub(club, user)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const next: ClubMetadata = { ...club }
  if (typeof body.name === 'string' && body.name.trim()) next.name = body.name.trim()
  if (typeof body.description === 'string') next.description = body.description
  await putClub(next)
  return NextResponse.json(next)
}

// DELETE /att/api/clubs/[clubId]
// Owner only. Tears down the metadata + invitations, plus every member's
// reverse-index entry so they don't show a ghost club in their list.
export async function DELETE(_: NextRequest, { params }: Params) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { clubId } = await params
  const club = await getClub(clubId)
  if (!club) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!canDeleteClub(club, user)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const everyone = [club.ownerId, ...club.adminUserIds, ...club.memberUserIds]
  await deleteClub(clubId)
  await Promise.all(everyone.map(uid => removeUserFromClubIndex(uid, clubId)))
  return NextResponse.json({ ok: true })
}
