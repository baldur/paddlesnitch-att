import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { findUserByEmail } from '@/lib/cognito'
import {
  getClub,
  listClubInvitations,
  newInvitation,
  putInvitation,
  putPendingInvitation,
} from '@/lib/clubs'
import { canManageClub } from '@/lib/permissions'

type Params = { params: Promise<{ clubId: string }> }

// GET /att/api/clubs/[clubId]/invitations
// Owner / admin only. Returns every outstanding (or finalised) invitation
// stored under the club. Pending email invitations queued under
// pending-invitations/ are NOT included here — they're only surfaced when
// the matching user signs up.
export async function GET(_: NextRequest, { params }: Params) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { clubId } = await params
  const club = await getClub(clubId)
  if (!club) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!canManageClub(club, user)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const invites = await listClubInvitations(clubId)
  return NextResponse.json({ invitations: invites })
}

// POST /att/api/clubs/[clubId]/invitations  { email, role?: 'admin' | 'member' }
// Owner / admin. If the email matches an existing account, the invite is
// stored resolved (toUserId set). If not, it's queued as a pending invite
// keyed by email-hash so the next signup with that address can pick it up.
//
// The inviter doesn't need to know whether the recipient has an account.
export async function POST(req: NextRequest, { params }: Params) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { clubId } = await params
  const club = await getClub(clubId)
  if (!club) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!canManageClub(club, user)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  if (!email) return NextResponse.json({ error: 'Email is required' }, { status: 400 })
  const role = body.role === 'admin' ? 'admin' : 'member'

  const matched = await findUserByEmail(email)
  if (matched) {
    // Already-an-account invite. Stored resolved under the club so the
    // recipient can find it by clubId without scanning everything.
    const invitation = newInvitation({
      clubId,
      role,
      invitedBy: user.id,
      toUserId: matched.sub,
    })
    await putInvitation(invitation)
    return NextResponse.json({ invitation, resolved: true }, { status: 201 })
  }

  // Pre-signup invite. Queued under pending-invitations/clubs/{emailHash}/
  // and merged into the user's clubs when they sign up.
  const invitation = newInvitation({
    clubId,
    role,
    invitedBy: user.id,
    toEmail: email,
  })
  await putPendingInvitation(invitation)
  return NextResponse.json({ invitation, resolved: false }, { status: 201 })
}
