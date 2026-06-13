import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import {
  listAllClubs,
  newClub,
  putClub,
  getUserClubIds,
  addUserToClubIndex,
} from '@/lib/clubs'

// GET /att/api/clubs
// Lists clubs the viewer is in (owner / admin / member). Unauthenticated
// requests get an empty list — clubs are not publicly listable to keep
// member lists private by default.
export async function GET() {
  const viewer = await getAuthUser()
  if (!viewer) return NextResponse.json({ clubs: [] })
  const myClubIds = await getUserClubIds(viewer.id)
  const all = await listAllClubs()
  return NextResponse.json({ clubs: all.filter(c => myClubIds.includes(c.id)) })
}

// POST /att/api/clubs  { name, description? }
// Any signed-in user can create a club. The creator becomes the owner.
export async function POST(req: NextRequest) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  const description = typeof body.description === 'string' ? body.description : ''

  const club = newClub({ name, description, ownerId: user.id })
  await putClub(club)
  await addUserToClubIndex(user.id, club.id)
  return NextResponse.json(club, { status: 201 })
}
