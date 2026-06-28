import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { getGroup, putGroup, deleteGroup, removeUserFromGroupIndex } from '@/lib/groups'
import { canManageGroup, canViewGroup, canDeleteGroup } from '@/lib/permissions'
import type { GroupMetadata } from '@/lib/types'

type Params = { params: Promise<{ groupId: string }> }

// GET /att/api/groups/[groupId]
// Owner / admin / member: full payload incl. membership.
// Non-member signed-in OR unauthenticated: 404 (groups aren't publicly browsable).
export async function GET(_: NextRequest, { params }: Params) {
  const { groupId } = await params
  const group = await getGroup(groupId)
  if (!group) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const viewer = await getAuthUser()
  if (!canViewGroup(group, viewer)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  return NextResponse.json(group)
}

// PATCH /att/api/groups/[groupId]
// Owner / admin can update name + description. Only the owner can promote
// or demote admins; that lives in the dedicated /members endpoint.
export async function PATCH(req: NextRequest, { params }: Params) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { groupId } = await params
  const group = await getGroup(groupId)
  if (!group) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!canManageGroup(group, user)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const next: GroupMetadata = { ...group }
  if (typeof body.name === 'string' && body.name.trim()) next.name = body.name.trim()
  if (typeof body.description === 'string') next.description = body.description
  await putGroup(next)
  return NextResponse.json(next)
}

// DELETE /att/api/groups/[groupId]
// Owner only. Tears down the metadata + invitations, plus every member's
// reverse-index entry so they don't show a ghost group in their list.
export async function DELETE(_: NextRequest, { params }: Params) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { groupId } = await params
  const group = await getGroup(groupId)
  if (!group) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!canDeleteGroup(group, user)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const everyone = [group.ownerId, ...group.adminUserIds, ...group.memberUserIds]
  await deleteGroup(groupId)
  await Promise.all(everyone.map(uid => removeUserFromGroupIndex(uid, groupId)))
  return NextResponse.json({ ok: true })
}
