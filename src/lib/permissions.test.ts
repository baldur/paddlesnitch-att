import { describe, it, expect } from 'vitest'
import {
  canViewCourse,
  canViewTrial,
  canManageCourse,
  canManageTrial,
  canSubmitToTrial,
  canManageClub,
  canDeleteClub,
  canViewClub,
  isListedForViewer,
} from './permissions'
import type { CourseMetadata, TrialMetadata, ClubMetadata, AuthUser } from './types'

// Permission matrix lives in docs/features/visibility-clubs-tos.md. Story
// titles below are deliberate — they read as the matrix rows. If you change
// a check, the failing test name should already tell the story.

const owner: AuthUser = { id: 'alice-1', email: 'alice@example.com', displayName: 'Alice' }
const other: AuthUser = { id: 'bob-1', email: 'bob@example.com', displayName: 'Bob' }

function makeCourse(visibility: 'public' | 'private'): CourseMetadata {
  return {
    id: 'c1',
    name: 'C1',
    sport: 'kayak',
    type: 'point_to_point',
    startLine: [[0, 0], [0, 0.001]],
    finishLine: [[0.001, 0], [0.001, 0.001]],
    distanceMetres: 100,
    adminUserId: owner.id,
    visibility,
    createdAt: '2026-01-01T00:00:00Z',
  }
}

function makeTrial(
  visibility: 'public' | 'private' | 'club',
  participation: 'open' | 'invitational' = 'open',
  invitedUserIds: string[] = [],
  visibleToClubId?: string,
): TrialMetadata {
  return {
    id: 't1',
    courseId: 'c1',
    name: 'T1',
    date: '2026-01-01',
    status: 'open',
    adminUserId: owner.id,
    visibility,
    visibleToClubId,
    participation,
    invitedUserIds,
    createdAt: '2026-01-01T00:00:00Z',
  }
}

function makeCourseClub(visibleToClubId: string): CourseMetadata {
  return {
    id: 'c-club',
    name: 'Club-only',
    sport: 'kayak',
    type: 'point_to_point',
    startLine: [[0, 0], [0, 0.001]],
    finishLine: [[0.001, 0], [0.001, 0.001]],
    distanceMetres: 100,
    adminUserId: owner.id,
    visibility: 'club',
    visibleToClubId,
    createdAt: '2026-01-01T00:00:00Z',
  }
}

function makeClub(): ClubMetadata {
  return {
    id: 'club-1',
    name: 'Club 1',
    description: '',
    ownerId: owner.id,
    adminUserIds: ['admin-1'],
    memberUserIds: ['member-1'],
    createdAt: '2026-01-01T00:00:00Z',
  }
}

describe('viewing a public course', () => {
  it('an unauthenticated visitor can see it', () => {
    expect(canViewCourse(makeCourse('public'), null)).toBe(true)
  })
  it('the owner can see it', () => {
    expect(canViewCourse(makeCourse('public'), owner)).toBe(true)
  })
  it('any other signed-in user can see it', () => {
    expect(canViewCourse(makeCourse('public'), other)).toBe(true)
  })
})

describe('viewing a private course', () => {
  it('an unauthenticated visitor cannot see it', () => {
    expect(canViewCourse(makeCourse('private'), null)).toBe(false)
  })
  it('the owner can see it', () => {
    expect(canViewCourse(makeCourse('private'), owner)).toBe(true)
  })
  it('any other signed-in user cannot see it', () => {
    expect(canViewCourse(makeCourse('private'), other)).toBe(false)
  })
})

describe('viewing a public trial', () => {
  it('an unauthenticated visitor can see the leaderboard', () => {
    expect(canViewTrial(makeTrial('public'), null)).toBe(true)
  })
  it('the trial owner can see it', () => {
    expect(canViewTrial(makeTrial('public'), owner)).toBe(true)
  })
  it('any other signed-in user can see it', () => {
    expect(canViewTrial(makeTrial('public'), other)).toBe(true)
  })
})

describe('viewing a private trial', () => {
  it('an unauthenticated visitor cannot see it', () => {
    expect(canViewTrial(makeTrial('private'), null)).toBe(false)
  })
  it('the trial owner can see it', () => {
    expect(canViewTrial(makeTrial('private'), owner)).toBe(true)
  })
  it('a signed-in non-owner cannot see it', () => {
    expect(canViewTrial(makeTrial('private'), other)).toBe(false)
  })
})

describe('managing a course (edit / delete)', () => {
  it('the owner can manage a public course', () => {
    expect(canManageCourse(makeCourse('public'), owner)).toBe(true)
  })
  it('the owner can manage a private course', () => {
    expect(canManageCourse(makeCourse('private'), owner)).toBe(true)
  })
  it('a non-owner cannot manage a public course', () => {
    expect(canManageCourse(makeCourse('public'), other)).toBe(false)
  })
  it('a non-owner cannot manage a private course', () => {
    expect(canManageCourse(makeCourse('private'), other)).toBe(false)
  })
  it('an unauthenticated visitor cannot manage any course', () => {
    expect(canManageCourse(makeCourse('public'), null)).toBe(false)
    expect(canManageCourse(makeCourse('private'), null)).toBe(false)
  })
})

describe('managing a trial', () => {
  it('the owner can manage a public trial', () => {
    expect(canManageTrial(makeTrial('public'), owner)).toBe(true)
  })
  it('the owner can manage a private trial', () => {
    expect(canManageTrial(makeTrial('private'), owner)).toBe(true)
  })
  it('a non-owner cannot manage any trial', () => {
    expect(canManageTrial(makeTrial('public'), other)).toBe(false)
    expect(canManageTrial(makeTrial('private'), other)).toBe(false)
  })
})

describe('submitting to an open trial', () => {
  it('any signed-in viewer can submit', () => {
    expect(canSubmitToTrial(makeTrial('public', 'open'), other)).toBe(true)
  })
  it('the owner can submit', () => {
    expect(canSubmitToTrial(makeTrial('public', 'open'), owner)).toBe(true)
  })
  it('an unauthenticated visitor cannot submit', () => {
    expect(canSubmitToTrial(makeTrial('public', 'open'), null)).toBe(false)
  })
  it('a non-owner cannot submit to a private open trial they cannot see', () => {
    expect(canSubmitToTrial(makeTrial('private', 'open'), other)).toBe(false)
  })
})

describe('submitting to an invitational trial', () => {
  it('an invited user can submit', () => {
    expect(canSubmitToTrial(makeTrial('public', 'invitational', [other.id]), other)).toBe(true)
  })
  it('the owner can submit even when not in invitedUserIds', () => {
    expect(canSubmitToTrial(makeTrial('public', 'invitational', []), owner)).toBe(true)
  })
  it('a non-invited signed-in user cannot submit', () => {
    expect(canSubmitToTrial(makeTrial('public', 'invitational', []), other)).toBe(false)
  })
  it('an unauthenticated visitor cannot submit', () => {
    expect(canSubmitToTrial(makeTrial('public', 'invitational', []), null)).toBe(false)
  })
  it('a private invitational trial: the owner and invitees can submit', () => {
    const invited = { id: 'invited-1', email: 'i@x', displayName: 'I' }
    const trial = makeTrial('private', 'invitational', [invited.id])
    expect(canSubmitToTrial(trial, invited)).toBe(true)
    expect(canSubmitToTrial(trial, owner)).toBe(true)
  })

  it('a private invitational trial: a non-invited signed-in user is still blocked', () => {
    const trial = makeTrial('private', 'invitational', [])
    expect(canSubmitToTrial(trial, other)).toBe(false)
  })
})

describe('an invitee of a private invitational trial', () => {
  // canViewTrial was widened in phase 2 so invitees see the leaderboard of
  // private trials they're racing on. This bracket pins that down.
  const invited: AuthUser = { id: 'invited-2', email: 'inv@x', displayName: 'Inv' }

  it('can see the trial detail', () => {
    const trial = makeTrial('private', 'invitational', [invited.id])
    expect(canViewTrial(trial, invited)).toBe(true)
  })

  it('still cannot manage the trial', () => {
    const trial = makeTrial('private', 'invitational', [invited.id])
    expect(canManageTrial(trial, invited)).toBe(false)
  })

  it('a non-invited signed-in user still gets a flat no', () => {
    const trial = makeTrial('private', 'invitational', [])
    expect(canViewTrial(trial, other)).toBe(false)
  })
})

describe('viewing a club-scoped course', () => {
  const clubId = 'club-1'

  it('a viewer who is in the club can see it', () => {
    const course = makeCourseClub(clubId)
    expect(canViewCourse(course, other, new Set([clubId]))).toBe(true)
  })

  it('a viewer who is NOT in the club gets a flat no', () => {
    const course = makeCourseClub(clubId)
    expect(canViewCourse(course, other, new Set())).toBe(false)
  })

  it('an unauthenticated visitor cannot see it', () => {
    const course = makeCourseClub(clubId)
    expect(canViewCourse(course, null)).toBe(false)
  })

  it('the owner can always see their own club-scoped course', () => {
    const course = makeCourseClub(clubId)
    expect(canViewCourse(course, owner, new Set())).toBe(true)
  })

  it('a stale viewerClubIds with the wrong club id does NOT widen access', () => {
    const course = makeCourseClub(clubId)
    expect(canViewCourse(course, other, new Set(['some-other-club']))).toBe(false)
  })
})

describe('viewing a club-scoped trial', () => {
  const clubId = 'club-1'

  it('a viewer who is in the club can see it', () => {
    const trial = makeTrial('club', 'open', [], clubId)
    expect(canViewTrial(trial, other, new Set([clubId]))).toBe(true)
  })

  it('a viewer who is NOT in the club cannot see it', () => {
    const trial = makeTrial('club', 'open', [], clubId)
    expect(canViewTrial(trial, other, new Set())).toBe(false)
  })

  it('a club member can submit to a club-scoped open trial', () => {
    const trial = makeTrial('club', 'open', [], clubId)
    expect(canSubmitToTrial(trial, other, new Set([clubId]))).toBe(true)
  })

  it('a non-member cannot submit to a club-scoped open trial', () => {
    const trial = makeTrial('club', 'open', [], clubId)
    expect(canSubmitToTrial(trial, other, new Set())).toBe(false)
  })

  it('a club member who is NOT in the invitee list cannot submit to a club-scoped invitational trial', () => {
    const trial = makeTrial('club', 'invitational', [], clubId)
    expect(canSubmitToTrial(trial, other, new Set([clubId]))).toBe(false)
  })

  it('a club member who IS in the invitee list can submit to a club-scoped invitational trial', () => {
    const trial = makeTrial('club', 'invitational', [other.id], clubId)
    expect(canSubmitToTrial(trial, other, new Set([clubId]))).toBe(true)
  })
})

describe('managing a club', () => {
  it('the owner can manage', () => {
    expect(canManageClub(makeClub(), owner)).toBe(true)
  })
  it('an admin can manage', () => {
    const admin: AuthUser = { id: 'admin-1', email: 'a@x', displayName: 'A' }
    expect(canManageClub(makeClub(), admin)).toBe(true)
  })
  it('a plain member cannot manage', () => {
    const member: AuthUser = { id: 'member-1', email: 'm@x', displayName: 'M' }
    expect(canManageClub(makeClub(), member)).toBe(false)
  })
  it('a non-member cannot manage', () => {
    expect(canManageClub(makeClub(), other)).toBe(false)
  })

  it('only the owner can delete', () => {
    const admin: AuthUser = { id: 'admin-1', email: 'a@x', displayName: 'A' }
    expect(canDeleteClub(makeClub(), owner)).toBe(true)
    expect(canDeleteClub(makeClub(), admin)).toBe(false)
  })

  it('any member can view a club', () => {
    const member: AuthUser = { id: 'member-1', email: 'm@x', displayName: 'M' }
    expect(canViewClub(makeClub(), member)).toBe(true)
  })

  it('a non-member cannot view a club', () => {
    expect(canViewClub(makeClub(), other)).toBe(false)
  })

  it('an unauthenticated visitor cannot view a club', () => {
    expect(canViewClub(makeClub(), null)).toBe(false)
  })
})

describe('listing courses and trials', () => {
  it('a public course is listed for an unauthenticated visitor', () => {
    expect(isListedForViewer(makeCourse('public'), null)).toBe(true)
  })
  it('a private course is hidden from non-owners in the listing', () => {
    expect(isListedForViewer(makeCourse('private'), other)).toBe(false)
  })
  it('a private course appears in the listing for its owner', () => {
    expect(isListedForViewer(makeCourse('private'), owner)).toBe(true)
  })
})
