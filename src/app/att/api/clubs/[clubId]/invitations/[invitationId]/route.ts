import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import {
  getClub,
  getInvitation,
  deleteInvitation,
} from '@/lib/clubs'
import { canManageClub } from '@/lib/permissions'

type Params = { params: Promise<{ clubId: string; invitationId: string }> }

// DELETE /att/api/clubs/[clubId]/invitations/[invitationId]
// Owner / admin can rescind any invitation. Idempotent — a 404 on a
// missing invitation is still treated as success so the UI can call this
// without checking first.
export async function DELETE(_: NextRequest, { params }: Params) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { clubId, invitationId } = await params
  const club = await getClub(clubId)
  if (!club) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!canManageClub(club, user)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await deleteInvitation(clubId, invitationId)
  return NextResponse.json({ ok: true })
}
