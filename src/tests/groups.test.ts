// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { makeDataDir, cleanDataDir, makeUser, makeCourse } from './helpers'

vi.mock('next/headers', () => ({ cookies: vi.fn() }))

import { GET as listGroups, POST as createGroup } from '@/app/att/api/groups/route'
import { GET as getGroupRoute, PATCH as patchGroup, DELETE as deleteGroupRoute } from '@/app/att/api/groups/[groupId]/route'
import { POST as inviteToGroup, GET as listInvites } from '@/app/att/api/groups/[groupId]/invitations/route'
import { POST as acceptInvite } from '@/app/att/api/groups/[groupId]/invitations/[invitationId]/accept/route'
import { DELETE as kickMember } from '@/app/att/api/groups/[groupId]/members/[userId]/route'
import { GET as getCourse } from '@/app/att/api/courses/[courseId]/route'
import { PATCH as patchCourse } from '@/app/att/api/courses/[courseId]/route'
import { cookies } from 'next/headers'

let dataDir: string
beforeEach(async () => { dataDir = await makeDataDir() })
afterEach(async () => { await cleanDataDir(dataDir) })

function mockAuth(idToken: string | null) {
  vi.mocked(cookies).mockResolvedValue({
    get: (name: string) => name === 'tt_id' && idToken ? { name, value: idToken } : undefined,
  } as ReturnType<typeof cookies> extends Promise<infer T> ? T : never)
}

function jsonReq(method: string, body?: unknown) {
  return new NextRequest('http://x', {
    method,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    headers: { 'Content-Type': 'application/json' },
  })
}

// Story-style permission tests for phase 4 groups.
// docs/features/visibility-groups-tos.md.

describe('creating a group', () => {
  it('any signed-in user can create one and becomes the owner', async () => {
    const founder = await makeUser('Founder')
    mockAuth(founder.idToken)
    const res = await createGroup(jsonReq('POST', { name: 'Founder Group' }))
    expect(res.status).toBe(201)
    const group = await res.json()
    expect(group.ownerId).toBe(founder.id)
    expect(group.name).toBe('Founder Group')
  })

  it('an unauthenticated request gets 401', async () => {
    mockAuth(null)
    const res = await createGroup(jsonReq('POST', { name: 'X' }))
    expect(res.status).toBe(401)
  })

  it('an empty name is rejected', async () => {
    const u = await makeUser('U')
    mockAuth(u.idToken)
    const res = await createGroup(jsonReq('POST', { name: '   ' }))
    expect(res.status).toBe(400)
  })

  it('appears in the creator\'s own /att/api/groups list', async () => {
    const u = await makeUser('U')
    mockAuth(u.idToken)
    await createGroup(jsonReq('POST', { name: 'Mine' }))
    mockAuth(u.idToken)
    const list = await (await listGroups()).json()
    expect(list.groups.map((c: { name: string }) => c.name)).toContain('Mine')
  })

  it('does NOT appear in a stranger\'s list', async () => {
    const u = await makeUser('U')
    const stranger = await makeUser('Stranger')
    mockAuth(u.idToken)
    await createGroup(jsonReq('POST', { name: 'Hidden' }))
    mockAuth(stranger.idToken)
    const list = await (await listGroups()).json()
    expect(list.groups.map((c: { name: string }) => c.name)).not.toContain('Hidden')
  })
})

describe('viewing a group', () => {
  it('a member can view the full payload', async () => {
    const owner = await makeUser('Owner')
    mockAuth(owner.idToken)
    const group = await (await createGroup(jsonReq('POST', { name: 'C' }))).json()
    mockAuth(owner.idToken)
    const res = await getGroupRoute(new NextRequest('http://x'),
      { params: Promise.resolve({ groupId: group.id }) })
    expect(res.status).toBe(200)
  })

  it('a non-member gets 404 (existence hidden)', async () => {
    const owner = await makeUser('Owner')
    const stranger = await makeUser('Stranger')
    mockAuth(owner.idToken)
    const group = await (await createGroup(jsonReq('POST', { name: 'C' }))).json()
    mockAuth(stranger.idToken)
    const res = await getGroupRoute(new NextRequest('http://x'),
      { params: Promise.resolve({ groupId: group.id }) })
    expect(res.status).toBe(404)
  })

  it('an unauthenticated visitor gets 404', async () => {
    const owner = await makeUser('Owner')
    mockAuth(owner.idToken)
    const group = await (await createGroup(jsonReq('POST', { name: 'C' }))).json()
    mockAuth(null)
    const res = await getGroupRoute(new NextRequest('http://x'),
      { params: Promise.resolve({ groupId: group.id }) })
    expect(res.status).toBe(404)
  })
})

describe('inviting and joining', () => {
  it('the owner can invite an existing user; they accept and become a member', async () => {
    const owner = await makeUser('Owner')
    const guest = await makeUser('Guest')
    mockAuth(owner.idToken)
    const group = await (await createGroup(jsonReq('POST', { name: 'C' }))).json()

    mockAuth(owner.idToken)
    const inviteRes = await inviteToGroup(jsonReq('POST', { email: guest.email }),
      { params: Promise.resolve({ groupId: group.id }) })
    expect(inviteRes.status).toBe(201)
    const { invitation, resolved } = await inviteRes.json()
    expect(resolved).toBe(true)

    mockAuth(guest.idToken)
    const acceptRes = await acceptInvite(new NextRequest('http://x', { method: 'POST' }),
      { params: Promise.resolve({ groupId: group.id, invitationId: invitation.id }) })
    expect(acceptRes.status).toBe(200)

    // Guest can now view the group.
    mockAuth(guest.idToken)
    const view = await getGroupRoute(new NextRequest('http://x'),
      { params: Promise.resolve({ groupId: group.id }) })
    expect(view.status).toBe(200)
    const data = await view.json()
    expect(data.memberUserIds).toContain(guest.id)
  })

  it('an unknown email is queued as a pending invitation (not 422)', async () => {
    const owner = await makeUser('Owner')
    mockAuth(owner.idToken)
    const group = await (await createGroup(jsonReq('POST', { name: 'C' }))).json()

    mockAuth(owner.idToken)
    const res = await inviteToGroup(
      jsonReq('POST', { email: `pending-${Date.now()}@example.com` }),
      { params: Promise.resolve({ groupId: group.id }) }
    )
    expect(res.status).toBe(201)
    const { resolved } = await res.json()
    expect(resolved).toBe(false)
  })

  it('a non-admin cannot invite', async () => {
    const owner = await makeUser('Owner')
    const stranger = await makeUser('Stranger')
    mockAuth(owner.idToken)
    const group = await (await createGroup(jsonReq('POST', { name: 'C' }))).json()

    mockAuth(stranger.idToken)
    const res = await inviteToGroup(jsonReq('POST', { email: 'x@example.com' }),
      { params: Promise.resolve({ groupId: group.id }) })
    expect([403, 404]).toContain(res.status)
  })

  it('the invitee, not the inviter, can accept', async () => {
    const owner = await makeUser('Owner')
    const guest = await makeUser('Guest')
    const stranger = await makeUser('Stranger')
    mockAuth(owner.idToken)
    const group = await (await createGroup(jsonReq('POST', { name: 'C' }))).json()
    mockAuth(owner.idToken)
    const inv = await (await inviteToGroup(jsonReq('POST', { email: guest.email }),
      { params: Promise.resolve({ groupId: group.id }) })).json()

    mockAuth(stranger.idToken)
    const stranged = await acceptInvite(new NextRequest('http://x', { method: 'POST' }),
      { params: Promise.resolve({ groupId: group.id, invitationId: inv.invitation.id }) })
    expect(stranged.status).toBe(404)
  })
})

describe('group-scoped visibility', () => {
  it('a group member can view a course scoped to their group', async () => {
    const owner = await makeUser('Owner')
    const guest = await makeUser('Guest')
    mockAuth(owner.idToken)
    const group = await (await createGroup(jsonReq('POST', { name: 'C' }))).json()

    // Invite + accept to seed membership.
    mockAuth(owner.idToken)
    const inv = await (await inviteToGroup(jsonReq('POST', { email: guest.email }),
      { params: Promise.resolve({ groupId: group.id }) })).json()
    mockAuth(guest.idToken)
    await acceptInvite(new NextRequest('http://x', { method: 'POST' }),
      { params: Promise.resolve({ groupId: group.id, invitationId: inv.invitation.id }) })

    // Owner creates a private course, then flips it to group-scope.
    const course = await makeCourse(owner.id, { visibility: 'private' })
    mockAuth(owner.idToken)
    const flipped = await patchCourse(
      jsonReq('PATCH', { visibility: 'group', visibleToGroupId: group.id }),
      { params: Promise.resolve({ courseId: course.id }) }
    )
    expect(flipped.status).toBe(200)
    const got = await flipped.json()
    expect(got.visibility).toBe('group')
    expect(got.visibleToGroupId).toBe(group.id)

    // Guest is a member → can see it.
    mockAuth(guest.idToken)
    const memberView = await getCourse(new NextRequest('http://x'),
      { params: Promise.resolve({ courseId: course.id }) })
    expect(memberView.status).toBe(200)

    // A stranger cannot.
    const stranger = await makeUser('Stranger')
    mockAuth(stranger.idToken)
    const strangerView = await getCourse(new NextRequest('http://x'),
      { params: Promise.resolve({ courseId: course.id }) })
    expect(strangerView.status).toBe(404)
  })

  it('a plain member cannot scope a course to the group (only owner/admin can)', async () => {
    const owner = await makeUser('Owner')
    const member = await makeUser('Member')
    mockAuth(owner.idToken)
    const group = await (await createGroup(jsonReq('POST', { name: 'C' }))).json()
    mockAuth(owner.idToken)
    const inv = await (await inviteToGroup(
      jsonReq('POST', { email: member.email, role: 'member' }),
      { params: Promise.resolve({ groupId: group.id }) })).json()
    mockAuth(member.idToken)
    await acceptInvite(new NextRequest('http://x', { method: 'POST' }),
      { params: Promise.resolve({ groupId: group.id, invitationId: inv.invitation.id }) })

    // The member creates their own course and tries to scope it to the group.
    const memberCourse = await makeCourse(member.id, { visibility: 'private' })
    mockAuth(member.idToken)
    const flipped = await patchCourse(
      jsonReq('PATCH', { visibility: 'group', visibleToGroupId: group.id }),
      { params: Promise.resolve({ courseId: memberCourse.id }) }
    )
    // Should fall back to private — the route doesn't 403, it just refuses
    // to widen the scope (mirrors what UI tests will check).
    expect(flipped.status).toBe(200)
    const got = await flipped.json()
    expect(got.visibility).toBe('private')
  })
})

describe('membership lifecycle', () => {
  it('the owner can kick a member', async () => {
    const owner = await makeUser('Owner')
    const guest = await makeUser('Guest')
    mockAuth(owner.idToken)
    const group = await (await createGroup(jsonReq('POST', { name: 'C' }))).json()
    mockAuth(owner.idToken)
    const inv = await (await inviteToGroup(jsonReq('POST', { email: guest.email }),
      { params: Promise.resolve({ groupId: group.id }) })).json()
    mockAuth(guest.idToken)
    await acceptInvite(new NextRequest('http://x', { method: 'POST' }),
      { params: Promise.resolve({ groupId: group.id, invitationId: inv.invitation.id }) })

    mockAuth(owner.idToken)
    const res = await kickMember(new NextRequest('http://x', { method: 'DELETE' }),
      { params: Promise.resolve({ groupId: group.id, userId: guest.id }) })
    expect(res.status).toBe(200)
    const updated = await res.json()
    expect(updated.group.memberUserIds).not.toContain(guest.id)
  })

  it('a member can leave themselves', async () => {
    const owner = await makeUser('Owner')
    const guest = await makeUser('Guest')
    mockAuth(owner.idToken)
    const group = await (await createGroup(jsonReq('POST', { name: 'C' }))).json()
    mockAuth(owner.idToken)
    const inv = await (await inviteToGroup(jsonReq('POST', { email: guest.email }),
      { params: Promise.resolve({ groupId: group.id }) })).json()
    mockAuth(guest.idToken)
    await acceptInvite(new NextRequest('http://x', { method: 'POST' }),
      { params: Promise.resolve({ groupId: group.id, invitationId: inv.invitation.id }) })

    mockAuth(guest.idToken)
    const res = await kickMember(new NextRequest('http://x', { method: 'DELETE' }),
      { params: Promise.resolve({ groupId: group.id, userId: guest.id }) })
    expect(res.status).toBe(200)
  })

  it('the owner cannot be kicked from their own group', async () => {
    const owner = await makeUser('Owner')
    mockAuth(owner.idToken)
    const group = await (await createGroup(jsonReq('POST', { name: 'C' }))).json()

    mockAuth(owner.idToken)
    const res = await kickMember(new NextRequest('http://x', { method: 'DELETE' }),
      { params: Promise.resolve({ groupId: group.id, userId: owner.id }) })
    expect(res.status).toBe(400)
  })
})

describe('deleting a group', () => {
  it('the owner can delete', async () => {
    const owner = await makeUser('Owner')
    mockAuth(owner.idToken)
    const group = await (await createGroup(jsonReq('POST', { name: 'C' }))).json()

    mockAuth(owner.idToken)
    const res = await deleteGroupRoute(new NextRequest('http://x', { method: 'DELETE' }),
      { params: Promise.resolve({ groupId: group.id }) })
    expect(res.status).toBe(200)

    mockAuth(owner.idToken)
    const view = await getGroupRoute(new NextRequest('http://x'),
      { params: Promise.resolve({ groupId: group.id }) })
    expect(view.status).toBe(404)
  })

  it('a non-owner cannot delete', async () => {
    const owner = await makeUser('Owner')
    const stranger = await makeUser('Stranger')
    mockAuth(owner.idToken)
    const group = await (await createGroup(jsonReq('POST', { name: 'C' }))).json()

    mockAuth(stranger.idToken)
    const res = await deleteGroupRoute(new NextRequest('http://x', { method: 'DELETE' }),
      { params: Promise.resolve({ groupId: group.id }) })
    expect([403, 404]).toContain(res.status)
  })
})
