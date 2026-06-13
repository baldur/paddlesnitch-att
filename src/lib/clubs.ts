// Storage helpers for clubs + club invitations.
//
// S3 layout:
//   clubs/{clubId}/metadata.json
//   clubs/{clubId}/invitations/{invitationId}.json     (resolved invites)
//   pending-invitations/clubs/{emailHash}/{invitationId}.json
//   users/{userId}/clubs.json                          (reverse index)
//
// The reverse index is a single { clubIds: string[] } record per user. It
// lets the catalogue + "are you in this club" checks avoid scanning every
// club's member list.
//
// `emailHash` is sha-256 hex of the lowercased email — keeps the path
// directory layout from leaking unverified emails to anyone who can list
// the bucket.

import { createHash } from 'crypto'
import { nanoid } from 'nanoid'
import { getJson, putJson, deleteObject, listKeys } from './storage'
import type { ClubMetadata, ClubInvitation } from './types'

export function clubMetaKey(clubId: string): string {
  return `clubs/${clubId}/metadata.json`
}

export function userClubsKey(userId: string): string {
  return `users/${userId}/clubs.json`
}

export function emailHash(email: string): string {
  return createHash('sha256').update(email.trim().toLowerCase()).digest('hex')
}

// ---------------- Club CRUD ----------------

export async function getClub(clubId: string): Promise<ClubMetadata | null> {
  return getJson<ClubMetadata>(clubMetaKey(clubId))
}

export async function putClub(club: ClubMetadata): Promise<void> {
  await putJson(clubMetaKey(club.id), club)
}

export async function deleteClub(clubId: string): Promise<void> {
  // Delete the metadata + every invitation under the club. Members'
  // reverse-index entries are cleaned up by the caller — they need to know
  // which subs to update.
  await deleteObject(clubMetaKey(clubId))
  const inviteKeys = await listKeys(`clubs/${clubId}/invitations/`)
  await Promise.all(inviteKeys.map(k => deleteObject(k)))
}

export async function listAllClubs(): Promise<ClubMetadata[]> {
  const keys = await listKeys('clubs/')
  const metaKeys = keys.filter(k => k.endsWith('/metadata.json') && !k.includes('/invitations/'))
  const clubs = await Promise.all(metaKeys.map(k => getJson<ClubMetadata>(k)))
  return clubs.filter((c): c is ClubMetadata => c !== null)
}

// ---------------- Per-user reverse index ----------------

type UserClubs = { clubIds: string[] }

export async function getUserClubIds(userId: string): Promise<string[]> {
  const rec = await getJson<UserClubs>(userClubsKey(userId))
  return rec?.clubIds ?? []
}

export async function addUserToClubIndex(userId: string, clubId: string): Promise<void> {
  const current = await getUserClubIds(userId)
  if (current.includes(clubId)) return
  await putJson(userClubsKey(userId), { clubIds: [...current, clubId] })
}

export async function removeUserFromClubIndex(userId: string, clubId: string): Promise<void> {
  const current = await getUserClubIds(userId)
  if (!current.includes(clubId)) return
  await putJson(userClubsKey(userId), { clubIds: current.filter(id => id !== clubId) })
}

// Whether `userId` is the owner, an admin, or a member of `club`. Cheap
// because the membership lists are inline on the metadata.
export function clubRoleOf(club: ClubMetadata, userId: string): 'owner' | 'admin' | 'member' | null {
  if (club.ownerId === userId) return 'owner'
  if (club.adminUserIds.includes(userId)) return 'admin'
  if (club.memberUserIds.includes(userId)) return 'member'
  return null
}

// ---------------- Invitations (resolved) ----------------

function inviteKey(clubId: string, invitationId: string): string {
  return `clubs/${clubId}/invitations/${invitationId}.json`
}

export async function getInvitation(clubId: string, invitationId: string): Promise<ClubInvitation | null> {
  return getJson<ClubInvitation>(inviteKey(clubId, invitationId))
}

export async function putInvitation(invitation: ClubInvitation): Promise<void> {
  await putJson(inviteKey(invitation.clubId, invitation.id), invitation)
}

export async function deleteInvitation(clubId: string, invitationId: string): Promise<void> {
  await deleteObject(inviteKey(clubId, invitationId))
}

export async function listClubInvitations(clubId: string): Promise<ClubInvitation[]> {
  const keys = await listKeys(`clubs/${clubId}/invitations/`)
  const invites = await Promise.all(keys.map(k => getJson<ClubInvitation>(k)))
  return invites.filter((i): i is ClubInvitation => i !== null)
}

// ---------------- Pending email invitations (pre-signup) ----------------

function pendingKey(email: string, invitationId: string): string {
  return `pending-invitations/clubs/${emailHash(email)}/${invitationId}.json`
}

export async function putPendingInvitation(invitation: ClubInvitation): Promise<void> {
  if (!invitation.toEmail) throw new Error('putPendingInvitation requires toEmail')
  await putJson(pendingKey(invitation.toEmail, invitation.id), invitation)
}

// Returns every pending invitation queued for this email. Used by the
// signup hook to merge them into the new user's clubs.
export async function listPendingInvitationsForEmail(email: string): Promise<ClubInvitation[]> {
  const keys = await listKeys(`pending-invitations/clubs/${emailHash(email)}/`)
  const invites = await Promise.all(keys.map(k => getJson<ClubInvitation>(k)))
  return invites.filter((i): i is ClubInvitation => i !== null)
}

export async function deletePendingInvitation(email: string, invitationId: string): Promise<void> {
  await deleteObject(pendingKey(email, invitationId))
}

// ---------------- Builder ----------------

// Constructs a fresh ClubMetadata, generating an id, and seeding the owner
// as the first (sole) admin so they have full management rights without
// being listed twice in the member array.
export function newClub(input: {
  name: string
  description?: string
  ownerId: string
}): ClubMetadata {
  return {
    id: nanoid(),
    name: input.name,
    description: input.description ?? '',
    ownerId: input.ownerId,
    adminUserIds: [],
    memberUserIds: [],
    createdAt: new Date().toISOString(),
  }
}

// Constructs an invitation. If `toEmail` is set, it's a pending invite; if
// `toUserId` is set, it's a resolved invite (we already know the account).
export function newInvitation(input: {
  clubId: string
  role: 'admin' | 'member'
  invitedBy: string
  toUserId?: string
  toEmail?: string
}): ClubInvitation {
  const now = new Date()
  const expires = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
  return {
    id: nanoid(),
    clubId: input.clubId,
    role: input.role,
    invitedBy: input.invitedBy,
    toUserId: input.toUserId,
    toEmail: input.toEmail,
    createdAt: now.toISOString(),
    expiresAt: expires.toISOString(),
    status: 'pending',
  }
}
