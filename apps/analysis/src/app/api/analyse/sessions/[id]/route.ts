import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@paddlesnitch/core/auth'
import { getSession, updateSessionNote, deleteSession } from '@/lib/analysis-store'

type Params = { params: Promise<{ id: string }> }

// GET — full saved session (result + note + insight), owner only.
export async function GET(_req: NextRequest, { params }: Params) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const session = await getSession(user.id, id)
  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ session })
}

// PATCH { note } — set/clear the diary note (feature 4). Owner only.
export async function PATCH(req: NextRequest, { params }: Params) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const note = typeof body.note === 'string' ? body.note : ''
  const session = await updateSessionNote(user.id, id, note)
  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ session })
}

// DELETE — remove a saved paddle. Owner only.
export async function DELETE(_req: NextRequest, { params }: Params) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  await deleteSession(user.id, id)
  return NextResponse.json({ ok: true })
}
