# Visibility, Invitations, Clubs, Terms of Service

**Status:** ✅ Shipped. All five phases merged 2026-06-13 (PRs #44–#48); email
invitations to non-account holders followed in #53 (2026-06-14). Retained as a
design record — see CLAUDE.md for the authoritative current behaviour.

Designed 2026-06-13. Phased rollout; each phase is its own PR. Greenfield
schema — `.local-data/` and prod S3 (`paddlesnitch-data-prod`) are wiped on
Phase 1 merge so we don't carry back-compat shims.

## Goals

1. Course / trial owners can keep their work private to themselves or to a defined club.
2. Trials can be **invitational** — only specific people can submit, even if the course is public.
3. **Clubs** as first-class entities with an owner and delegated admins. Courses & trials can be visible to a club's members.
4. Switching a trial from private to public surfaces an acknowledgement, and the ToS spells out that performance times may become public — no per-entry consent gate.
5. A versioned Terms of Service; gated at sign-up; re-acceptance on bump.

## Domain model

### Courses

Always owned by a single user (the creator). Clubs do **not** own courses.

```
CourseMetadata
+ visibility: 'public' | 'club'
+ visibleToClubId?: string         // present iff visibility === 'club'
```

**Modify-creates-copy:** If a course has any entries against it (across any
trial), changes to its geometry (start/finish lines, gates, type) MUST create
a new course rather than mutating the old one. Visibility flips are exempt —
those don't break historical results, only geometry does. Implemented as a
service-layer check inside the PATCH route.

### Trials

Owned by the same model as their course (single user creator). A trial's
visibility scope must be a subset of the course's scope — you cannot publish
a public trial on a club-private course.

```
TrialMetadata
+ visibility:     'public' | 'club'
+ visibleToClubId?: string         // present iff visibility === 'club'
+ participation:  'open'   | 'invitational'
+ invitedUserIds: string[]         // when invitational; resolved from emails at invite time
```

### Entries

Unchanged for now. The trial's visibility controls who sees the leaderboard;
per-entry visibility flags can be added later if the make-public flow grows
beyond the acknowledgement model.

### Clubs

```
Club          (new)
  id, slug, name, description, logo?, createdAt
  ownerId          string
  adminUserIds     string[]        // can manage on behalf of the club, not transfer / delete
  memberUserIds    string[]        // can see club-visibility content

ClubInvitation (new)
  id, clubId, role: 'admin' | 'member', invitedBy, expiresAt
  toUserId?     string             // resolved if the email already has an account
  toEmail?      string             // unresolved; will resolve on signup if a match
  status: 'pending' | 'accepted' | 'declined' | 'expired'
```

Invitations are looked up by either `toUserId` (resolved) or `toEmail`
(unresolved). The inviter only sees a single "invite by email or name" field
— the resolver decides which slot to fill based on whether a matching
account exists.

## Storage layout

```
courses/{courseId}/metadata.json          (existing)
trials/{trialId}/metadata.json            (existing)

clubs/{clubId}/metadata.json              (new)
clubs/{clubId}/invitations/{id}.json      (new)

users/{userId}/clubs.json                 (new — reverse index)
users/{userId}/tos-consent.json           (new — [{ version, consentedAt }, …])

legal/tos-{version}.md                    (new — versioned source, checked into the repo)

pending-invitations/{email-hash}.json     (new — invitations waiting on signup; merged in on signup)
```

## API surface (new + modified)

Visibility additions land on existing routes; club + invitation routes are new.

```
# existing, modified
POST   /att/api/courses              — accepts visibility, visibleToClubId
PATCH  /att/api/courses/{id}         — modify-creates-copy if entries exist
GET    /att/api/courses[/{id}]       — gated by visibility
POST   /att/api/trials               — accepts visibility, participation
PATCH  /att/api/trials/{id}          — owner only
GET    /att/api/trials[/{id}]        — gated by visibility
GET    /att/api/trials/{id}/leaderboard  — gated by trial visibility
POST   /att/api/trials/{id}/upload   — gated by participation (open | invitational)

# new
GET    /att/api/clubs
GET    /att/api/clubs/{id}
POST   /att/api/clubs                — create
PATCH  /att/api/clubs/{id}           — owner / admin
DELETE /att/api/clubs/{id}           — owner only
POST   /att/api/clubs/{id}/invitations
POST   /att/api/clubs/{id}/invitations/{inviteId}/accept
POST   /att/api/clubs/{id}/invitations/{inviteId}/decline
DELETE /att/api/clubs/{id}/members/{userId}

POST   /att/api/trials/{id}/invite              — admin only
POST   /att/api/trials/{id}/make-public         — requires acknowledgement
```

## Permissions matrix

| Action                                       | Owner | Club admin | Club member | Outside |
|----------------------------------------------|:-----:|:----------:|:-----------:|:-------:|
| View public course / trial                   | ✓     | ✓          | ✓           | ✓       |
| View club-visibility course / trial          | ✓     | ✓          | ✓           |         |
| Submit to open trial (course-visible to me)  | ✓     | ✓          | ✓           | ✓       |
| Submit to invitational trial                 | ✓\*   | ✓\*        | ✓\*         | ✓\*     |
| Edit / delete course or trial                | ✓     |            |             |         |
| Invite to a trial                            | ✓     |            |             |         |
| Manage club members / invitations            | ✓     | ✓          |             |         |
| Transfer ownership / delete club             | ✓     |            |             |         |

\* Only if `userId in invitedUserIds`.

## Make-public acknowledgement

Lightweight, not a full consent gate:

1. Owner clicks **Make public** on a trial.
2. Modal: "By making this public, every participant's name and time will be visible to anyone on the internet. The Terms of Service notify them that performance times may become public when an organiser does this."
3. Owner ticks "I acknowledge" → trial flips to `visibility: 'public'`.

The ToS carries the matching disclosure on the participant side, so we never
need to chase individual consents.

## Terms of Service

Versioned text in `legal/tos-{version}.md`. Sign-up requires acceptance of
`current_tos_version`. Stored at `users/{userId}/tos-consent.json` as a list
of `{ version, consentedAt }`.

When `current_tos_version` increments, signed-in users are interrupted on
their next request with a re-accept gate. No retroactive consent assumption.

Topics covered (drafted separately):
- General use, age (16+ for GDPR), acceptable behaviour
- User content: licence to display GPS trace + name on public leaderboards
- Public listings: by submitting to **any** trial, the organiser may at any
  point make it public, and your name + time will then be visible to anyone
  on the internet
- Strava integration disclaimer (linked third party, their ToS applies)
- Liability: amateur timing, not race-officiated
- GDPR rights — link to existing /att/account
- Termination conditions

## Phasing

1. **Visibility flags on courses + trials (public | private)** — schema +
   gating + UI. `private` = "only the owner can see" until clubs ship in
   phase 4. Wipe data on the way in.
2. **Invitational trials** — add `participation: 'open' | 'invitational'`,
   resolve invitees from emails-or-existing-users, gate the upload route.
3. **Modify-creates-copy** for courses with entries.
4. **Clubs** — new entity, owner / admin / member, club invitations,
   visibility scoped to a club replaces the binary `private` flag.
5. **Make-public acknowledgement + ToS** — versioned legal docs, sign-up
   gate, re-accept on bump.

Each phase is independently shippable.

## Test discipline

Story-style permission tests as a standing requirement. Every new
permission check has an `it('<who> <can/cannot> <action> <when>')` case in
the integration suite. The aim is that the test names alone document the
permission matrix and someone touching the code can't accidentally invert a
check without a red test.
