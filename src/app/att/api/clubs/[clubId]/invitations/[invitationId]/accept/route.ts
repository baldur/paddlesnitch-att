import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import {
  getClub,
  getInvitation,
  putClub,
  putInvitation,
  deleteInvitation,
  addUserToClubIndex,
} from '@/lib/clubs'
import type { ClubMetadata } from '@/lib/types'

type Params = { params: Promise<{ clubId: string; invitationId: string }> }

// POST /att/api/clubs/[clubId]/invitations/[invitationId]/accept
// Only the invitee may accept. On accept we add them to the club at the
// invited role and delete the invitation. Idempotent if they're already
// a member at the same or higher role.
export async function POST(_: NextRequest, { params }: Params) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { clubId, invitationId } = await params
  const invitation = await getInvitation(clubId, invitationId)
  if (!invitation) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (invitation.toUserId !== user.id) {
    // Hide existence — the invite isn't for them.
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  const club = await getClub(clubId)
  if (!club) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const updated: ClubMetadata = { ...club }
  if (invitation.role === 'admin') {
    if (!updated.adminUserIds.includes(user.id)) {
      updated.adminUserIds = [...updated.adminUserIds, user.id]
    }
    // An accepted admin invitation supersedes a prior plain membership.
    updated.memberUserIds = updated.memberUserIds.filter(id => id !== user.id)
  } else {
    // Only promote to member if not already admin / owner.
    const role = club.ownerId === user.id || club.adminUserIds.includes(user.id) ? null : 'member'
    if (role && !updated.memberUserIds.includes(user.id)) {
      updated.memberUserIds = [...updated.memberUserIds, user.id]
    }
  }
  await putClub(updated)
  await addUserToClubIndex(user.id, clubId)
  await deleteInvitation(clubId, invitationId)
  return NextResponse.json({ club: updated })
}
