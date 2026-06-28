import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import {
  listAllGroups,
  newGroup,
  putGroup,
  getUserGroupIds,
  addUserToGroupIndex,
} from '@/lib/groups'

// GET /att/api/groups
// Lists groups the viewer is in (owner / admin / member). Unauthenticated
// requests get an empty list — groups are not publicly listable to keep
// member lists private by default.
export async function GET() {
  const viewer = await getAuthUser()
  if (!viewer) return NextResponse.json({ groups: [] })
  const myGroupIds = await getUserGroupIds(viewer.id)
  const all = await listAllGroups()
  return NextResponse.json({ groups: all.filter(c => myGroupIds.includes(c.id)) })
}

// POST /att/api/groups  { name, description? }
// Any signed-in user can create a group. The creator becomes the owner.
export async function POST(req: NextRequest) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  const description = typeof body.description === 'string' ? body.description : ''

  const group = newGroup({ name, description, ownerId: user.id })
  await putGroup(group)
  await addUserToGroupIndex(user.id, group.id)
  return NextResponse.json(group, { status: 201 })
}
