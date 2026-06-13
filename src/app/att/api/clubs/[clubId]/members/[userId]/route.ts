import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { getClub, putClub, removeUserFromClubIndex } from '@/lib/clubs'
import { canManageClub } from '@/lib/permissions'
import type { ClubMetadata } from '@/lib/types'

type Params = { params: Promise<{ clubId: string; userId: string }> }

// DELETE /att/api/clubs/[clubId]/members/[userId]
// Allowed for the owner / any admin (kicking a member or another admin)
// OR for the user themselves (self-leave). The owner cannot be removed
// from their own club without first transferring ownership.
//
// The reverse-index entry is removed too so the kicked user doesn't see
// the club in their list anymore.
export async function DELETE(_: NextRequest, { params }: Params) {
  const viewer = await getAuthUser()
  if (!viewer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { clubId, userId } = await params
  const club = await getClub(clubId)
  if (!club) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const isSelf = viewer.id === userId
  if (!isSelf && !canManageClub(club, viewer)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (userId === club.ownerId) {
    return NextResponse.json(
      { error: 'Cannot remove the club owner. Transfer ownership first.' },
      { status: 400 }
    )
  }

  const updated: ClubMetadata = {
    ...club,
    adminUserIds: club.adminUserIds.filter(id => id !== userId),
    memberUserIds: club.memberUserIds.filter(id => id !== userId),
  }
  await putClub(updated)
  await removeUserFromClubIndex(userId, clubId)
  return NextResponse.json({ club: updated })
}
