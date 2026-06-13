// Resolves pre-signup club invitations.
//
// When a user signs up, this is called with their fresh sub + email. It
// scans pending-invitations/clubs/{emailHash}/ for any invites queued for
// the email, merges the user into each club at the invited role, and
// deletes the pending records. Idempotent: a re-run on the same user is
// a no-op if there's nothing left to merge.

import {
  listPendingInvitationsForEmail,
  deletePendingInvitation,
  getClub,
  putClub,
  addUserToClubIndex,
} from './clubs'
import type { ClubMetadata } from './types'

export async function applyPendingInvitations(email: string, userId: string): Promise<void> {
  const pending = await listPendingInvitationsForEmail(email)
  if (pending.length === 0) return

  // Group by clubId so we only read/write each club once even if the
  // user has multiple invitations to it (the most generous role wins).
  const byClub = new Map<string, typeof pending>()
  for (const inv of pending) {
    const list = byClub.get(inv.clubId) ?? []
    list.push(inv)
    byClub.set(inv.clubId, list)
  }

  for (const [clubId, invites] of byClub) {
    const club = await getClub(clubId)
    if (!club) {
      // Club was deleted before the invitee signed up. Clean up the
      // orphan pending records and move on.
      await Promise.all(invites.map(i => deletePendingInvitation(email, i.id)))
      continue
    }
    const wantsAdmin = invites.some(i => i.role === 'admin')
    const updated: ClubMetadata = { ...club }
    if (wantsAdmin) {
      if (!updated.adminUserIds.includes(userId)) {
        updated.adminUserIds = [...updated.adminUserIds, userId]
      }
      updated.memberUserIds = updated.memberUserIds.filter(id => id !== userId)
    } else {
      if (!updated.memberUserIds.includes(userId) && updated.ownerId !== userId && !updated.adminUserIds.includes(userId)) {
        updated.memberUserIds = [...updated.memberUserIds, userId]
      }
    }
    await putClub(updated)
    await addUserToClubIndex(userId, clubId)
    await Promise.all(invites.map(i => deletePendingInvitation(email, i.id)))
  }
}
