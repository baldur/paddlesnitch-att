# Feature spec: Groups own courses & trials (creation gating)

**Status:** ✅ shipped 2026-06-29. Designed 2026-06-28; rolled out in 5 PRs (#117 club→group rename, #118 creation gating, #119 member-gated submission, #120 self-serve join, + this FAQ/finalise PR). This file is now a design record; current behaviour lives in CLAUDE.md.
**Owners:** Baldur (product), Claude (implementation).

## Why

The app serves two personas but shows both sets of controls to everyone:

- **Organisers** (few) — define courses, open time trials.
- **Paddlers** (the majority) — find a trial, upload a trace, see their result.

Surfacing "create a course / create a trial" to a paddler who just wants to
submit is confusing. The fix: **gate creation behind a group-admin role** so the
default experience is "browse trials → upload entry," while organisers go through
an explicit "create a group" door that most users never open. Creation stays
*possible* for anyone (create a group → you're its admin), just not *prominent*.

## Settled decisions

1. **Rename `club` → `group`** everywhere (UI **and** code). Broader/lighter than
   "club" — covers a formal club, a coaching squad, or a solo organiser.
2. **Group-owned creation.** Every course and trial belongs to a group
   (`groupId`); only that group's **owner/admins** can create or manage them.
3. **Explicit on-ramp.** A user with no group sees a "Create a group to start
   organising" CTA (no auto/magic group). Creating a group makes them its admin
   and unlocks course/trial creation.
4. **Member-gated submission, per-trial scope.** Submission requires group
   involvement by default. Trial `participation` becomes:
   - `members` — any group member can submit (**new default**)
   - `invitational` — only `invitedUserIds` (existing mechanism; can invite
     non-members by email)
   - `public` — anyone who can view can submit (escape hatch for an open
     community race)
5. **Joining = invite + self-serve request.** Admins invite (existing flow) AND
   a paddler can request to join (or use a join link). Per-group `joinPolicy`
   controls whether requests need approval or auto-accept.
6. **Migrate existing data** into per-owner personal groups (no legacy
   special-casing).

## Domain model changes

### Group (was Club)

```
GroupMetadata  (renamed from ClubMetadata; storage groups/{id}/metadata.json)
  id, slug, name, description, logo?, createdAt
  ownerId         string
  adminUserIds    string[]
  memberUserIds   string[]
+ joinPolicy:     'invite_only' | 'request' | 'open'   // default 'request'
+ joinLinkToken?: string                               // for join-by-link
```

`users/{userId}/clubs.json` → `users/{userId}/groups.json` (reverse index, same
shape). `/att/clubs` → `/att/groups`. `visibleToClubId` → `visibleToGroupId`.

### JoinRequest (new)

```
groups/{groupId}/join-requests/{id}.json
  id, userId, requestedAt, status: 'pending' | 'accepted' | 'declined'
```

Auto-accepted instantly when `joinPolicy === 'open'`; otherwise pending until an
admin acts. Mirrors the existing invitation pattern.

### Course / Trial

```
CourseMetadata + groupId: string   // the owning group; manage authority
TrialMetadata  + groupId: string
TrialMetadata.participation: 'members' | 'invitational' | 'public'   // was 'open' | 'invitational'
```

`adminUserId` is retained as **created-by** (audit) but is no longer the manage
authority — that moves to the group's admins.

## Permissions (`src/lib/permissions.ts` — single source of truth)

- `canCreateCourseInGroup(viewer, group)` / `canCreateTrialInGroup` — viewer is
  owner/admin of `group`.
- `canManageCourse(course, viewer, viewerGroups)` / `canManageTrial` — viewer is
  owner/admin of the resource's group.
- `canSubmitToTrial(trial, viewer, viewerGroupIds)` by `participation`:
  - `public` → anyone who passes `canViewTrial`
  - `members` → owner/admin/member of the trial's group (or an invitee)
  - `invitational` → in `invitedUserIds`
- `canManageGroupMembers` (owner/admin), `canRequestToJoin` (any signed-in
  non-member).

Private resources still return **404** (not 403) to non-viewers; invitational
trials return 404 to non-invitees — unchanged no-leak rule. Every new check
gets a story-style test.

## UX flows

- **Nav / home:** hide `+ NEW TRIAL` / `+ NEW COURSE` for non-admins. Add a
  "Run your own trials? Create a group →" entry. A group admin sees create
  options scoped to their group(s).
- **Group page (`/att/groups/[id]`):** members list; admin sees pending join
  requests (accept/decline) + invite; a non-member sees Join / Request to join;
  admin sets `joinPolicy` + manages the join link.
- **Course/trial create:** only reachable as a group admin; trial form gains the
  `participation` scope selector (members / invitational / public).
- **Upload page:** if the viewer can't submit (not a member of a `members`
  trial's group), show "Join this group to submit" → links to the group page,
  instead of the upload form.

## Phasing

| Phase | Scope | Risk |
|---|---|---|
| **1: Rename club → group** | Mechanical: `ClubMetadata`→`GroupMetadata`, `clubs/`→`groups/` storage, `/att/clubs`→`/att/groups`, `clubs.json`→`groups.json`, `visibleToClubId`→`visibleToGroupId`, all copy. Migrate existing `clubs/` keys → `groups/`. **No behaviour change.** | Low risk, wide blast radius (many files). |
| **2: Creation gating + groupId** | Add `groupId` to courses/trials; gate create/manage on group admin; hide create UI for non-admins; the "create a group" on-ramp. **Migrate** each individually-owned course/trial into a per-owner personal group ("{name}'s group"). | Medium. |
| **3: Member-gated submission** | `participation: members\|invitational\|public`; rework `canSubmitToTrial`; upload-page join CTA. Migrate existing trials `open`→`public` (preserve current open submission for existing events; new trials default `members`). | Medium. |
| **4: Self-serve join** | `joinPolicy`, join requests + approve/decline, join link, request-to-join UI. | Low–medium. |
| **5: FAQ + copy + finalise** | User-facing FAQ entries (below), final copy pass, mark spec shipped, update CLAUDE.md. | Low. |

## Migration (prod is small — baldur + kconnormartin + a few courses)

- Phase 1: copy `clubs/*` → `groups/*`, `users/*/clubs.json` → `groups.json`.
- Phase 2: for each distinct course/trial owner, create a personal group
  `"{displayName}'s group"` (admin = owner) and set `groupId` on their items.
- Phase 3: existing trials `participation: open` → `public` (don't retroactively
  lock out current participants). New default is `members`.
- Local dev: wipe + reseed; the seed produces groups owning the demo courses.

## FAQ changes (ship in phase 5; `/att/faq`)

- **"How do I run a time trial?"** → Create a group, then create a course and a
  trial inside it.
- **"Why don't I see a 'create trial' button?"** → Creating courses/trials is for
  group admins. Create a group (you become its admin) or ask an admin of yours.
- **"How do I submit my result?"** → Join the group running the trial (or use
  your invite), then upload your trace on the trial page.
- **"What's a group?"** → A club, squad, or just you — whoever runs the trials.
- **"How do I join a group?"** → Request to join from the group's page (or use a
  join link / invite); an admin approves unless the group is open.

## Testing

Story-style permission tests are the regression net: only group admins can
create; a non-member can't submit to a `members` trial; a `public` trial still
accepts anyone; an invitee can submit to an `invitational` trial; request-to-join
→ approve → can submit; private/invitational still 404 to outsiders. Plus
migration tests (individually-owned course → personal group; `open` → `public`).

## CLAUDE.md updates (per phase)

- Roles & permissions matrix rewritten around group-admin creation +
  per-trial submission scope.
- "Clubs" section → "Groups" (+ joinPolicy, join requests).
- Domain model: `groupId` on courses/trials; `participation` values.
- Route table: `/att/clubs*` → `/att/groups*`; new join-request routes.
