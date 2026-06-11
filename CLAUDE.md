# ATT — Automated Time Trials

## Working with Claude

After completing any task that changes behaviour, adds a feature, or introduces a new convention: update this file and the memory files in `~/.claude/projects/…/memory/` to reflect the new state. Do not wait to be asked.

### General coding guidelines

Behavioral guidelines to reduce common LLM coding mistakes.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

#### 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

#### 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

#### 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it — don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: every changed line should trace directly to the user's request.

#### 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

#### 5. Tests Are Not Optional

**Every behaviour change ships with a test. No exceptions.**

- **New feature** → write tests that would fail without it before writing the implementation.
- **Bug fix** → write a test that reproduces the bug first, then fix it. The test name should describe the bug (e.g. `'returns coordinates in degrees, not semicircles'`).
- **Changed behaviour** → update the existing tests that cover it. A passing test suite after a behaviour change means the tests weren't testing the right thing — fix them.
- **Refactor** → tests must pass before and after with no changes to test assertions.

If a change touches a file that has no tests, flag it and add coverage for the affected logic before shipping. Do not ship untested behaviour changes.

Run `pnpm test` before every commit. If tests fail, fix them — do not disable or delete them to make CI green.

---

## Development Workflow

### Day-to-day

```
pnpm dev          # one command: cognito-local on :9229, init, Next.js on :3000
# make changes
pnpm test         # must be all green before shipping
pnpm build        # TypeScript compile check — no errors allowed
```

Run `pnpm seed` once after deleting `.local-data/` to get demo data back.

### Before every deploy

Run this checklist in order. If anything fails, fix it first.

**Automated:**
```bash
pnpm test         # 145 tests: parsers + Cognito auth + upload + courses + crew + pace/date + GDPR + password-reset + OTP + Lambda triggers + feedback widget
pnpm build        # TypeScript — catches type regressions
```

The test suite covers the full upload pipeline end-to-end (GPX → parse → cross lines → leaderboard) and all auth flows. These are integration tests against a real temp filesystem — no mocks except `next/headers` (Next.js runtime-only).

**Manual smoke test** (run locally against `pnpm dev`; only needed for UI and map flows):

| Flow | When to check |
|---|---|
| Course creation | Any change to DrawingMap or course API |
| Trial open/close UI | Any change to admin pages |
| Leaderboard display | Any change to LeaderboardTable or splits rendering |
| Map dark/light toggle | Any change to map components |

Run the manual steps only for flows affected by your change. The automated tests cover auth, upload, parsing, and the core timing pipeline.

### Deploy sequence

**Normal path — just push:**
```bash
git push origin main   # triggers GitHub Actions: test → build → cdk deploy
```

**Manual deploy** (use if CI is broken or you need to deploy from your machine):
```bash
pnpm build:open-next                  # production bundle (includes OpenNext v4)
cd infra
npx cdk deploy --profile paddlesnitch --require-approval never
```

SSO session expires after ~8 h. If CDK says "Unable to resolve AWS account", run:
```bash
aws sso login --profile paddlesnitch
```

### Test coverage gaps (known)

These flows have no automated tests yet:
- Magic link auth (currently disabled — re-add tests when the Lambda triggers ship)
- Token refresh path in `getAuthUser()` (manual smoke only)
- Course/trial CRUD API routes
- Map components (UI only — manual)

When fixing a bug in any uncovered area, add a regression test at the same time.

---

## What This Is

**ATT — Automated Time Trials.** A web application for managing GPS-timed river time trials for kayaking and rowing. Organisers define courses by drawing start/finish lines on a map; participants upload GPS traces from fitness apps; the system calculates elapsed time, 500 m splits, and any available biometric data.

## In-flight feature work

Active specs live under `docs/features/`. Currently:
- [`courses-and-entries.md`](docs/features/courses-and-entries.md) — make courses a shared catalogue, distinguish organiser/paddler UX, strip personal data from entries, add boat class + crew, add pace variants + date picker. Four-phase plan; each phase is its own PR.

---

## Domain Model

### Course
A named stretch of water with:
- **Start line** — exactly 2 lat/lng points defining a straight line across the river
- **Finish line** — exactly 2 lat/lng points (only for `point_to_point`; omitted for all single-line course types)
- **Course type** — determines how the clock start/stop is detected (see below)
- **Distance** — auto-calculated from start/finish midpoints (`point_to_point`) or entered manually for single-line types
- **Sport** — `kayak` | `rowing` | `both`
- Owned by the user who created it (the **course admin**)

### Course Types

Three canonical types surfaced in the UI:

| Type | Lines | Description |
|---|---|---|
| `point_to_point` | 2 | Start and finish at different locations. Clock starts at start line, stops at finish line. Distance auto-calculated from midpoint to midpoint. |
| `loop` | 1 | Cross the same line twice (any direction). Clock starts on first crossing, stops on second. Use for out-and-back or circular loops. Set `minValidSeconds` to filter warmup false positives. |
| `gate` | 2+ | Ordered gates each with a crossing direction. Athletes must cross every gate in the specified direction, in sequence. Start gate starts the clock; finish gate stops it. Intermediate gates verify route compliance (e.g. turning buoys). |

Legacy aliases (accepted in API, not surfaced in UI): `one_way` = `point_to_point`, `out_and_back` = gate-like, `lap` = loop same-direction, `figure_eight` = three crossings.

**Crossing direction (`rxsSign`)**: `segmentIntersect()` returns `rxs = rx*sy - ry*sx` (r = track segment direction, s = line direction). `rxsSign = Math.sign(rxs)`. The right-hand normal of `line[0]→line[1]` points in the `+1` direction; `gateDirection = 1` means athletes must approach from that side. The direction is shown as a blue filled dot on the active side, hollow gray on the inactive side.

**Multi-gate (`processMultiGate`)**: finds all valid start crossings of `gates[0]` with required direction, then chains through each subsequent gate. Returns the shortest complete run. Lives in `geo.ts`.

**minValidSeconds**: Stored on `CourseMetadata`; any result shorter than this is discarded. Useful for loop courses where warmup crossings can create false positives shorter than any real race time.

**trackSegment**: `ProcessedResult.trackSegment` stores the interpolated lat/lng path from start crossing to finish crossing. Used to plot the leader's track on the leaderboard map.

`processTrace` in `geo.ts` uses the best-effort algorithm: tries every valid start crossing, returns the shortest valid pair.

### Time Trial
An event on a Course with a date. A course can host many time trials. Has a status: `open` | `closed`.

### Entry
A participant's submission for a specific time trial, consisting of:
- A raw GPS trace file (GPX, FIT, or CSV format)
- A processed result (see below)
- The submitting user's identity

### Result
Derived from an Entry by the processing pipeline:
- **Start crossing time** — timestamp when the track first crosses the start line
- **Finish crossing time** — timestamp when the track first crosses the finish line (after the start)
- **Total elapsed time** — finish − start in seconds
- **500 m splits** — array of `{ distance: number, elapsedSeconds: number }` at each 500 m mark

**Heart rate and cadence are intentionally NOT captured.** All three parsers (gpx, fit, csv) discard those fields at parse time even when the source file contains them. See `docs/features/courses-and-entries.md`.

### Boat class
Every entry carries a `boatClass`. Kayak: `K1`, `K2`, `K4`. Sculling: `1X`, `2X`, `4X+`, `4X-`. Sweep: `2-`, `4+`, `4-`, `8+`. Defined in `src/lib/types.ts` (`BoatClass`, `BOAT_CLASSES`, `BOAT_CLASS_INFO`, `isBoatClass`). The leaderboard UI defaults to showing all classes with a filter dropdown — comparing a 1X to an 8+ is not meaningful so users typically filter to their own class. Crew details (per-seat names) are added in a later phase; Phase 1 only stores the class label.

### Line Crossing Detection
Given a GPS track as an ordered array of `[lat, lng, timestamp]` tuples and a line (two `[lat, lng]` points), a crossing is detected when any consecutive pair of track points forms a segment that intersects the line. Intersection uses standard 2D line-segment math (cross-product / parametric form). Haversine is used for distance calculations. All geo math lives in `src/lib/geo.ts`.

**Best-effort / fastest-segment algorithm** (`processTrace` in `geo.ts`): for a full-session upload (warmup + cooldown included), the system finds **all** crossings of the start line in the track, then for each start crossing finds the nearest subsequent finish crossing. The result with the shortest elapsed time is returned — analogous to Strava's "best effort on a segment." This means participants can upload their complete session without trimming; the algorithm automatically extracts the actual racing segment.

### 500 m Split Calculation
Walk the track from the start-crossing point, accumulating Haversine distance between consecutive points. Record the interpolated timestamp each time cumulative distance crosses a 500 m boundary. Continue to the finish crossing.

---

## Tech Stack

| Layer | Choice | Notes |
|---|---|---|
| Frontend | Next.js 16 (App Router) + TypeScript | Full-stack, server + client components |
| Styling | Tailwind CSS v4 | No shadcn/ui — custom retro design system |
| Maps | Leaflet + react-leaflet v5 | Free, no API key |
| Map drawing | Custom click-to-place | 2 clicks per line; no Leaflet.draw dependency |
| Auth (local dev) | cognito-local emulator on port 9229 | Same Cognito SDK calls as prod — only the endpoint URL differs |
| Auth (production) | AWS Cognito User Pool `paddlesnitch-users` (eu-west-1_BHyKJ0toh) | Email/password + magic link via SES; Google/Apple ready to wire |
| Storage (local dev) | Filesystem under `.local-data/` | Drop-in abstraction in `src/lib/storage.ts` |
| Storage (production) | Amazon S3 | Same interface, different backing |
| API | Next.js API routes | Same handlers used in local dev and prod |
| Processing | Inline in the upload API route | No Lambda trigger in local dev |
| IaC | AWS CDK (TypeScript) | `infra/` — OpenNext v4, CloudFront + Lambda |
| CDN | CloudFront + S3 OAC | Deployed — `d1745e47jh0mdf.cloudfront.net` (eu-west-1) |
| CI/CD | GitHub Actions | Push to `main` → test → build → CDK deploy (OIDC, no stored creds) |

---

## Architecture (Local Dev)

```
Browser
  │
  └─── Next.js (port 3000)         ← src/proxy.ts gates protected routes
         │
         ├──► cognito-local (port 9229)
         │       └── .cognito-local/db/     ← users + tokens (JSON files)
         │
         └──► Filesystem (.local-data/)
                ├── courses/{courseId}/metadata.json
                ├── trials/{trialId}/metadata.json
                ├── trials/{trialId}/leaderboard.json
                └── trials/{trialId}/entries/{userId}/{entryId}/
                      ├── trace.{gpx|fit}
                      └── result.json
```

API routes (under `/att/api/`):
```
auth/signup           POST — Cognito SignUp + AdminConfirmSignUp, sets tt_id + tt_refresh
auth/login            POST — Cognito InitiateAuth (USER_PASSWORD_AUTH), sets tt_id + tt_refresh
auth/logout           POST — clears cookies, revokes refresh token
auth/me               GET  — returns claims from current ID token or 401
auth/magic-request    POST — 501 Not Implemented (deferred follow-up; see Auth System)
auth/magic-verify     GET  — redirects to /att/auth?error=magic_disabled (deferred follow-up)
courses               GET / POST
courses/[id]          GET / PATCH
trials                GET (?courseId=) / POST
trials/[id]           GET / PATCH (open/close)
trials/[id]/upload    POST — parse GPX/FIT/CSV (or Strava import via {stravaActivityId}), process, rebuild leaderboard
trials/[id]/leaderboard GET
strava/connect        GET  — sets state cookie, 302 to Strava authorize URL
strava/callback       GET  — verifies state, exchanges code, persists tokens, redirects to /att/account?strava=connected
strava/status         GET  — { connected, athlete? }
strava/disconnect     POST — revokes on Strava, deletes local tokens
strava/activities     GET  — recent water-sport activities, refreshes token if needed
feedback              POST — files a customer-reported GitHub issue (anti-bot: honeypot + 2s minimum)
account/export        GET  — JSON archive of the signed-in user's data (GDPR Art. 15)
account               DELETE — full account erasure (GDPR Art. 17)
```

**Note on trial path:** Trials are stored flat (`trials/{trialId}/`) not nested under courseId. The `courseId` is stored inside `metadata.json`. This simplifies lookups by trialId.

---

## Architecture (Production)

```
Browser
  │
  └─── CloudFront (d1745e47jh0mdf.cloudfront.net)
         ├──► S3 paddlesnitch-assets-prod  (static assets, served via OAC)
         └──► Lambda (server function)     (Next.js SSR + API routes via OpenNext v4)
                ├──► Cognito paddlesnitch-users (eu-west-1) ← users + tokens
                ├──► S3 paddlesnitch-data-prod              ← courses, trials, entries
                └──► SES (noreply@paddlesnitch.com)         ← magic-link emails
```

OpenNext v4 bundles the Next.js server into a single Lambda. No API Gateway — CloudFront routes directly to a Lambda function URL. Static assets (JS/CSS/images) go to S3 and are served by CloudFront with long cache TTLs.

Cognito is the identity store. The server function has IAM permission to call `cognito-idp:*` against the user pool and `ses:SendEmail` for the `paddlesnitch.com` identity. The S3 data bucket holds *only* course/trial/entry data — no user records, no sessions.

---

## Local Data Layout

```
.local-data/                   ← course / trial / entry data (S3 mirror)
  courses/
    {courseId}/
      metadata.json            ← CourseMetadata type
  trials/
    {trialId}/
      metadata.json            ← TrialMetadata type
      leaderboard.json         ← LeaderboardEntry[] sorted by totalElapsedSeconds
      entries/
        {userId}/
          {entryId}/
            trace.{ext}        ← raw uploaded file
            result.json        ← { entryId, userId, displayName, submittedAt, filename, result: ProcessedResult }

.cognito-local/                ← cognito-local emulator state (users + tokens)
  db/
    local_xxx.json             ← user pool (users, password hashes, attributes)
```

**Reset both** (no migration — users are test accounts only): `rm -rf .local-data .cognito-local` then `pnpm seed`.

---

## Auth System

### Identity store

All users live in a Cognito User Pool — no user records in S3 or the filesystem.

- **Local dev**: cognito-local emulator on port 9229 (`pnpm cognito`). Stores users in `.cognito-local/db/`.
- **Production**: AWS Cognito pool `paddlesnitch-users` — `eu-west-1_BHyKJ0toh` (eu-west-1).

App code never branches on environment. Only the Cognito SDK endpoint differs:
- dev → `COGNITO_ENDPOINT=http://localhost:9229`
- prod → endpoint unset; SDK hits AWS directly

### Sign-in flows

1. **Email + password** — Cognito `USER_PASSWORD_AUTH` flow. Cognito enforces the password policy (8+ chars, mixed case, digit).
2. **Email OTP** — Cognito `CUSTOM_AUTH` flow. Our three Lambda triggers generate a 6-digit code, email it via SES, and verify it. See `infra/lambdas/cognito-auth/`.
3. **Sign in with Strava** — server-driven OAuth. Routes: `/att/api/auth/strava/init` sets a CSRF state cookie and 302s to `strava.com/oauth/authorize` with `scope=read,activity:read_all,profile:read_all`. `/att/api/auth/strava/callback` exchanges the code, fetches the authenticated athlete's profile (`/api/v3/athlete` — gives the verified email, which token exchange does not), then resolves the Cognito user by trying in order: (a) `strava-athletes/{athleteId}.json` index, (b) `cognito ListUsers` with `email = ...` (auto-link to an existing email account), (c) `AdminCreateUser` with a random unused password. Sign-in goes through the existing `CUSTOM_AUTH` flow with a server-generated one-time token passed via `ClientMetadata.preset_otp` — the `CreateAuthChallenge` Lambda detects it, stashes it as the expected answer, and skips sending an email. Only the server can do both halves of that dance, so the path is server-trusted.
4. **Magic link** — server generates a one-time token (stored 15 min), emails it via SES (prod) or console (dev). On click, the verify endpoint looks up the Cognito user by email and issues an ID-token cookie. Uses Cognito's `AdminInitiateAuth` under the hood — no Lambda triggers required.
5. **Social (Google, Apple)** — not yet wired. When added: Cognito hosted UI handles OAuth, callback lands in `/att/auth/oauth-callback`.

### Session mechanics

- **Cookies**: two httpOnly cookies, sameSite=lax, path=/.
  - `tt_id` — Cognito **ID token** (JWT). 24h maxAge, matches Cognito ID-token validity.
  - `tt_refresh` — Cognito **refresh token**. 30d maxAge.
- **`getAuthUser()`** (`src/lib/auth.ts`): reads `tt_id` → verifies the JWT signature against the pool's JWKS (`https://cognito-idp.<region>.amazonaws.com/<poolId>/.well-known/jwks.json`, cached) → returns `{ id, email, displayName }` from claims (`sub`, `email`, `name`). If the ID token is expired and the context is mutable (Route Handler / Server Action), silently exchanges `tt_refresh` for a fresh ID token and updates the cookie.
- **No server-side session store.** The cookies are the session — verification is local once the JWKS is cached.
- **Logout**: clear both cookies; call Cognito `RevokeToken` on the refresh token.

### Environment variables

| Var | Local dev | Production |
|---|---|---|
| `COGNITO_ENDPOINT` | `http://localhost:9229` | (unset) |
| `COGNITO_USER_POOL_ID` | `local_xxx` (from cognito-local) | `eu-west-1_BHyKJ0toh` |
| `COGNITO_CLIENT_ID` | (from cognito-local) | `svs358h7ii10o1jktvg57798m` |
| `COGNITO_REGION` | `eu-west-1` | `eu-west-1` |

### Routes

- `POST /att/api/auth/signup` — Cognito `SignUp` + `AdminConfirmSignUp`, signs in, sets `tt_id` + `tt_refresh`
- `POST /att/api/auth/login` — Cognito `InitiateAuth` (USER_PASSWORD_AUTH), sets `tt_id` + `tt_refresh`
- `POST /att/api/auth/logout` — clears both cookies, calls Cognito `RevokeToken`
- `GET  /att/api/auth/me` — verifies JWT (and silent-refreshes if expired), returns user claims or 401
- `GET  /att/api/auth/strava/init` — Strava sign-in: state cookie + redirect to Strava with `profile:read_all`
- `GET  /att/api/auth/strava/callback` — finds/creates Cognito user, runs `CUSTOM_AUTH` with preset token, sets `tt_id` + `tt_refresh`, redirects to `next`
- `POST /att/api/auth/magic-request` — disabled in v1 (returns 501 with friendly message)
- `GET  /att/api/auth/magic-verify` — disabled in v1 (redirects to `/att/auth?error=magic_disabled`)

### Access control

- **Proxy (`src/proxy.ts`)**: cheap cookie-presence check at the edge — does NOT verify the JWT (keeps middleware fast). Redirects to `/att/auth?next={path}` if absent. Real verification happens in API/page handlers via `getAuthUser()`.
- Public without login: home (open trials list), leaderboard, upload form (shows sign-in prompt).
- Admin pages require login.

### Adding Google/Apple OAuth (future)

User pool is already deployed. Steps when ready:
1. Register OAuth client in Google Cloud Console / Apple Developer portal
2. Add identity provider to the pool in CDK (`cognito.UserPoolIdentityProviderGoogle`)
3. Add a Cognito domain (`userPool.addDomain(...)`) and callback URL
4. Add "Sign in with Google" button to `/att/auth` (redirects to hosted UI)
5. Build `/att/auth/oauth-callback/route.ts` to exchange the code for tokens, set cookie

---

## Strava integration

Users can connect their Strava account once and then import any recent water-sport activity straight into a time trial — no GPX export required. Implementation:

- **Lib**: `src/lib/strava.ts` (OAuth + read-only API wrapper, no SDK) and `src/lib/strava-storage.ts` (per-user token persistence).
- **Token storage**: `users/{userId}/strava.json` in S3 (or `.local-data/` in dev). `getValidStravaTokens()` refreshes silently when the access token is within 2 minutes of expiry and re-persists.
- **OAuth scopes**: `read,activity:read_all` — enough to list recent activities and pull lat/lng + time streams. Never `write` — we don't post to anyone's Strava feed.
- **CSRF**: state cookie `strava_state` (httpOnly, 10 min) set on `/strava/connect`, verified on `/strava/callback`.
- **Activity filter**: the picker shows only `Kayaking`, `Canoeing`, `Rowing`, `StandUpPaddling`, `VirtualRow` — see `WATER_SPORT_TYPES` in `strava.ts`. Other sports can still be imported via the URL tab.
- **Streams → TrackPoint**: `streamsToTrack(latlng, time, startDate)` joins parallel arrays + the activity's start date into the same `TrackPoint[]` shape that GPX/FIT/CSV parsers produce, so `processTrack()` is sport-agnostic.
- **Persisted "raw trace"**: Strava imports save a JSON snapshot (`strava-{id}.json`) instead of a GPX file. Same directory layout (`trials/{trialId}/entries/{userId}/{entryId}/trace.json`), same audit story.

### Env vars

| Var | Where | Notes |
|---|---|---|
| `STRAVA_CLIENT_ID` | `.env.local` (dev only) | Direct override for local dev. Public — appears in every authorize URL. |
| `STRAVA_CLIENT_ID_PARAM` | env (prod, set by CDK) | Name of SSM String parameter to fetch at runtime: `/att/strava-client-id`. |
| `STRAVA_CLIENT_SECRET` | `.env.local` (dev only) | Direct override for local dev. |
| `STRAVA_CLIENT_SECRET_PARAM` | env (prod, set by CDK) | Name of SSM SecureString to fetch at runtime: `/att/strava-client-secret`. |

Both SSM parameters are set once with the AWS CLI:
```bash
aws ssm put-parameter --name /att/strava-client-id --type String --value '<id>' --overwrite --profile paddlesnitch --region eu-west-1

# IMPORTANT: write the secret to a tempfile with `printf '%s'` so there is
# NO trailing newline. `grep ... > file` or `echo ... > file` both append
# a \n, which AWS CLI stores verbatim via `file://`. The Lambda then ships
# a 41-char "secret" to Strava and gets back 401 Application/""/invalid.
# Bash $(...) strips trailing newlines on read, so length checks via
# ${#VAL} will lie. Verify with `wc -c < file`.
SECRET_FILE=$(mktemp)
printf '%s' '<the 40-char hex secret>' > "$SECRET_FILE"
aws ssm put-parameter --name /att/strava-client-secret --type SecureString --value "file://$SECRET_FILE" --overwrite --profile paddlesnitch --region eu-west-1
rm "$SECRET_FILE"
```

The Lambda IAM role has `ssm:GetParameter` on the parameter ARNs **and** `kms:Decrypt` on `alias/aws/ssm` (scoped via `kms:ViaService = ssm.<region>.amazonaws.com`). Without the KMS grant, SSM **silently returns the encrypted ciphertext blob** (`AQICAH...`, ~240 chars) instead of failing — which the runtime would then forward to Strava as the "secret".

### Redirect URIs

| Env | URI |
|---|---|
| Local | `http://localhost:3000/att/api/strava/callback` |
| Prod | `https://paddlesnitch.com/att/api/strava/callback` |

Both must be allow-listed in the Strava API app at https://developers.strava.com.

---

## Frontend Structure

```
src/
  proxy.ts                     ← Next.js 16 proxy (auth gate, replaces middleware)
  app/
    layout.tsx                 ← Root layout (IBM Plex Mono font, white background)
    page.tsx                   ← Landing page at / — link to /att
    globals.css                ← Tailwind + design tokens
    att/
      page.tsx                 ← ATT home — server component, lists open trials
      auth/
        page.tsx               ← Sign in / sign up (tabbed, client component)
      admin/
        courses/
          new/page.tsx         ← Create course (DrawingMap + form, client component)
          [courseId]/page.tsx  ← Manage course + create trials; date field defaults to today (client component)
        trials/
          [trialId]/page.tsx   ← Manage trial: open/close, view entries (client component)
      trials/
        [trialId]/
          page.tsx             ← Public leaderboard + course map (server component)
          upload/page.tsx      ← Upload trace (client component); on success redirects to leaderboard; shows sign-in prompt if unauthenticated
      api/
        auth/{signup,login,logout,me,magic-request,magic-verify}/route.ts
        courses/route.ts
        courses/[courseId]/route.ts
        trials/route.ts
        trials/[trialId]/route.ts
        trials/[trialId]/upload/route.ts
        trials/[trialId]/leaderboard/route.ts
  lib/
    types.ts                   ← All shared types (CourseMetadata, TrialMetadata, etc.)
    geo.ts                     ← Haversine, line-segment intersection, processTrace, formatTime
    gpx.ts                     ← GPX parser (regex-based, no dependencies)
    fit.ts                     ← FIT parser (fit-file-parser package)
    csv.ts                     ← CSV parser (flexible column names, unix/ISO timestamps)
    parse.ts                   ← Dispatcher: parseTrace(filename, buffer) → ParseResult
    storage.ts                 ← getObject/putObject/deleteObject/listKeys/getJson/putJson
    auth.ts                    ← getAuthUser(): reads tt_id, verifies JWT, silent-refreshes via tt_refresh
    cognito.ts                 ← Cognito SDK wrapper: signUp, signIn, refresh, revoke, verifyIdToken
  components/
    AuthNav.tsx                ← Client component: shows user name + logout, or "SIGN IN" link
    map/
      DrawingMap.tsx           ← Click-to-place start/finish lines on Leaflet map
      CourseMap.tsx            ← Read-only map: start (green), finish (red), auto-fit bounds
      CourseMapClient.tsx      ← Thin 'use client' wrapper enabling ssr:false from Server Components
    leaderboard/
      LeaderboardTable.tsx     ← Ranked table; per-row expandable 500 m splits (▼/▲ toggle); entries shorter than 500 m show no splits
```

---

## GPS File Formats

### GPX
XML. Extract `<trkpt lat="" lon=""><time>`. Heart rate: `<gpxtpx:hr>`. Cadence: `<gpxtpx:cad>`. Parser: `src/lib/gpx.ts` (regex, no XML library).

### FIT
Binary. `fit-file-parser` npm package. Returns `position_lat`/`position_long` already in degrees (no semicircle conversion needed). Fields: `timestamp`, `heart_rate`, `cadence`. Parser: `src/lib/fit.ts`.

### CSV
Comma-separated. Flexible column detection (case-insensitive, ignores spaces/underscores): lat/latitude, lon/lng/longitude, time/timestamp/datetime (unix seconds, unix ms, ISO 8601, `YYYY-MM-DD HH:MM:SS`). Optional: hr/heartrate/bpm, cadence/cad/strokerate. Parser: `src/lib/csv.ts`.

### Unknown formats
Returns `{ ok: false, reason: 'unknown_format' }` — the upload API surfaces this as a 422 to the user. Future formats can be added to `src/lib/parse.ts` without touching any other file.

---

## Roles & Permissions

| Action | Who |
|---|---|
| Access any page | Any signed-in user |
| Create a course | Any signed-in user |
| Edit/delete a course | Course admin (creator) only |
| Create a time trial on a course | Course admin only |
| Open / close a time trial | Course admin only |
| Upload a trace | Any signed-in user (when trial is open) |
| View leaderboard | Any signed-in user |
| View other participants' raw traces | Course admin only (not yet surfaced in UI) |

Enforced in two layers:
1. `src/proxy.ts` — rejects unauthenticated requests at the edge (cookie check only)
2. API route handlers — call `getAuthUser()` and check `adminUserId` for write operations

---

## Map Notes

- **Drawing**: `DrawingMap.tsx` uses click-to-place. Click "SET START LINE", click 2 points across the river, line is drawn. Repeat for finish. Lines can be reset. No Leaflet.draw dependency.
- **SSR**: All Leaflet components are `'use client'`. Server Components that need a map use `CourseMapClient.tsx` which wraps `CourseMap` in `next/dynamic` with `{ ssr: false }`. Direct `ssr: false` in Server Components is not allowed in Next.js 16.
- **Icons**: Leaflet default marker icon URLs are patched on import (webpack breaks the default paths).
- **Tiles**: Default is CartoDB Voyager (light). A toggle button lets users switch to CartoDB Dark Matter (`dark_all`). River layer recolours to match: cyan neon on dark, blue on light.
- **River overlay**: `RiverLayer.tsx` fetches `/data/rivers.geojson` (OSM UK data, downloaded once via `pnpm rivers`) and renders it as non-interactive cyan (`#06b6d4`) lines with a neon glow behind the course lines. Line weight/opacity scales by waterway type (`w` property: `river` | `canal`). Fails silently if file is missing.
- **Coordinates**: `[lat, lng]` throughout — NOT GeoJSON order.

### River data
`public/data/rivers.geojson` is gitignored (16.5 MB raw, ~3.3 MB gzipped). Regenerate with `pnpm rivers`.

Source: OpenStreetMap via Overpass API — UK rivers and canals (60,065 features). Streams omitted (visible on the dark base tile). Simplified at 0.001° tolerance (~100 m) for browser performance. The `w` property is `river` or `canal`.

The script requires a `User-Agent` header; Overpass blocks the default Node.js UA.

---

## Local Development

```bash
pnpm dev        # starts cognito-local + creates pool/client + starts Next.js, all in one terminal
pnpm seed       # wipes .local-data + Cognito users; reseeds 8 users / 2 courses / 3 trials / 13 entries
pnpm rivers     # downloads UK river GeoJSON → public/data/rivers.geojson (run once)
pnpm test       # Vitest, 145 tests across 14 files (spawns its own cognito-local on :9230)
pnpm test:watch
```

`pnpm dev` (`scripts/dev.ts`) orchestrates the stack: if cognito-local is already running on `:9229` it reuses it, otherwise it spawns one. Then runs `pnpm cognito:init` (idempotent — creates pool/client + writes `.env.local`), then starts `next dev`. Ctrl+C cleans up both processes. Output is tagged `[cognito]` / `[next]` / `[info]`.

Other scripts:
- `pnpm cognito` — bare cognito-local (use if you want to run it in a separate terminal)
- `pnpm cognito:init` — re-run pool/client init (rarely needed; `pnpm dev` does this)
- `pnpm next` — bare `next dev` (assumes cognito-local is already up)

`.env.local` is written by `pnpm cognito:init`. You can edit it but the COGNITO_* vars will be overwritten if you re-run init:
```
NODE_ENV=development
USE_LOCAL_STORAGE=true
COGNITO_ENDPOINT=http://localhost:9229
COGNITO_USER_POOL_ID=local_xxx
COGNITO_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxx
COGNITO_REGION=eu-west-1
```

The pool ID and client ID are stable across restarts as long as you don't delete `.cognito/`.

**Reset everything**: `rm -rf .local-data .cognito` then `pnpm dev` (recreates pool), then `pnpm seed` (creates users + demo data).

No Docker, no AWS creds needed for normal dev.

### Seed data (pnpm seed)
Creates deterministic demo data in `.local-data/`. Safe to re-run (nanoid IDs differ each run, so re-running adds duplicate data — delete `.local-data/` first if you want a clean reset).

| Account | Email | Password |
|---|---|---|
| Admin (course owner) | admin@paddlesnitch.com | Password123 |
| All others | {name}@example.is | Password123 |

Courses: **Elliðaár 1000m Sprint** (both sports) · **Reykjavik Harbour 500m** (kayak)
Trials: Spring Sprint 2025 (closed) · Summer Championships 2025 (closed) · Harbour Race 2025 (open)

### Example trace files
`examples/traces/` — drop `.gpx`, `.fit`, or `.csv` files here as reference inputs. Not uploaded automatically; use the upload UI against an open trial.

---

## Testing

Use **Vitest**. 145 tests across 14 files. Vitest `globalSetup` spawns its own cognito-local on :9230 so auth/upload/courses tests run against the real Cognito SDK surface (no mocks except `next/headers`).
- `src/lib/geo.test.ts` — haversine, line crossing, processTrace, formatTime
- `src/lib/gpx.test.ts` — GPX parser unit tests
- `src/lib/fit.test.ts` — FIT parser unit tests (mocks fit-file-parser)
- `src/lib/csv.test.ts` — CSV parser: flexible columns, all timestamp formats, edge cases
- `src/tests/auth.test.ts` — integration: signup, login, logout, /me against cognito-local (mocked cookies only)
- `src/tests/upload.test.ts` — integration: full upload pipeline → leaderboard (real filesystem + cognito-local)
- `src/tests/cognito-test-server.ts` + `src/tests/global-setup.ts` — spawn the test cognito-local instance, create pool/client, set env

Pattern: pure lib functions get unit tests; API routes get integration tests against real temp filesystem + real cognito-local. Only `next/headers` is mocked (Next.js server-only API). No SDK mocks.

Run: `pnpm test`

---

## Design System

**Aesthetic: minimal, data-centric, light background — dense tables, IBM Plex Mono, single blue accent**

| Token | Value | Usage |
|---|---|---|
| Background | `#ffffff` | `<body>` |
| Surface | `#f8fafc` | cards, form fields |
| Surface-2 | `#f1f5f9` | hover states |
| Border | `#e2e8f0` | all dividers |
| Primary | `#0369a1` | times, CTAs, active links |
| Split | `#6d28d9` | split times, HR/cadence data |
| Green | `#15803d` | start line, open status |
| Red | `#b91c1c` | finish line, close/delete |
| Text | `#0f172a` | body |
| Muted | `#64748b` | labels, secondary text |
| Font | IBM Plex Mono | everything — loaded via `next/font/google` |

CSS utilities in `globals.css`:
- `.tabular` — `font-variant-numeric: tabular-nums` for times

Maps default to light (CartoDB Voyager) with a toggle to dark. All other UI is always light.
No rounded corners on data elements. Sharp, precise. Mobile-first; tap targets ≥ 44px.

---

## Key Conventions

- All IDs: `nanoid()` — URL-safe, short.
- Timestamps: ISO 8601 strings in JSON.
- Times: stored as seconds (float), displayed as `m:ss.t` via `formatTime()` in `geo.ts`.
- Coordinates: always `[lat, lng]` — never GeoJSON `[lng, lat]` order.
- Start/finish lines: exactly `[[lat, lng], [lat, lng]]`.
- Course distance: auto-calculated (Haversine between midpoints of start and finish lines). Not stored as user input.
- `next/dynamic` with `{ ssr: false }` must only appear inside `'use client'` components. Use `CourseMapClient.tsx` pattern.
- **Never store `useSearchParams()` values in `useState`** — the state initialises before the effect that reads params, causing race conditions. Derive values directly: `const next = searchParams.get('next') ?? '/att'`.
- **Route prefix `/att` is baked into the source** (`src/app/att/`) — no Next.js `basePath` config. All `href`, `fetch()`, and `router.push()` calls include `/att` explicitly.
- YAGNI + KISS: don't build what isn't needed; simplest thing that works.
- Never commit AWS credentials. IAM roles for Lambda; `aws sso` locally.
- Target domain: `paddlesnitch.com` — app at `paddlesnitch.com/att`, landing at `paddlesnitch.com/`

---

## Cost Model (Production, Low Scale)

< 1000 entries/month:
- S3 storage + requests: < $1/month
- CloudFront: free tier / cents
- Lambda: free tier covers ~1M invocations
- API Gateway: $1/million requests
- Cognito: free up to 50,000 MAU

Migration path to add a database: replace S3 JSON reads with DynamoDB; processing Lambda writes to both S3 (raw) and DynamoDB (indexed). Leaderboard becomes a DynamoDB query instead of reading `leaderboard.json`.
