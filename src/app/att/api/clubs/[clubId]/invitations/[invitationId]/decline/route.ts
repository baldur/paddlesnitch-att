import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { getInvitation, deleteInvitation } from '@/lib/clubs'

type Params = { params: Promise<{ clubId: string; invitationId: string }> }

// POST /att/api/clubs/[clubId]/invitations/[invitationId]/decline
// Only the invitee may decline. We simply delete the invitation — there's
// no audit value in a tombstone here.
export async function POST(_: NextRequest, { params }: Params) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { clubId, invitationId } = await params
  const invitation = await getInvitation(clubId, invitationId)
  if (!invitation) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (invitation.toUserId !== user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  await deleteInvitation(clubId, invitationId)
  return NextResponse.json({ ok: true })
}
