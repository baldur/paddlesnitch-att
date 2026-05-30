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
pnpm dev          # local server on :3000, filesystem storage, local auth
# make changes
pnpm test         # must be all green before shipping
pnpm build        # TypeScript compile check — no errors allowed
```

Run `pnpm seed` once after deleting `.local-data/` to get demo data back.

### Before every deploy

Run this checklist in order. If anything fails, fix it first.

**Automated:**
```bash
pnpm test         # 45 tests: geo, GPX, FIT, CSV parsers + auth + upload pipeline
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
- Magic link auth (request + verify)
- Course/trial CRUD API routes
- Map components (UI only — manual)

When fixing a bug in any uncovered area, add a regression test at the same time.

---

## What This Is

**ATT — Automated Time Trials.** A web application for managing GPS-timed river time trials for kayaking and rowing. Organisers define courses by drawing start/finish lines on a map; participants upload GPS traces from fitness apps; the system calculates elapsed time, 500 m splits, and any available biometric data.

---

## Domain Model

### Course
A named stretch of water with:
- **Start line** — exactly 2 lat/lng points defining a straight line across the river
- **Finish line** — exactly 2 lat/lng points defining a straight line across the river
- **Distance** — auto-calculated as the Haversine distance between the midpoints of the start and finish lines. Never asked for manually.
- **Sport** — `kayak` | `rowing` | `both`
- Owned by the user who created it (the **course admin**)

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
- **Heart rate series** — `{ timestamp, bpm }[]` if present in the trace
- **Stroke rate series** — `{ timestamp, spm }[]` if present in the trace (Garmin FIT cadence field)
- **Average heart rate**, **average stroke rate** (derived summaries)

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
| Auth (local dev) | Cookie-based sessions (filesystem) | Password, magic link (15 min email token); `tt_session` httpOnly cookie |
| Auth (production) | AWS Cognito (User Pools) | Not yet wired; stub in `src/lib/auth.ts` |
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
  └─── Next.js (port 3000)
         ├── src/proxy.ts              ← gate: redirect to /att/auth if no tt_session cookie
         ├── app/page.tsx              ← landing page at /
         ├── app/att/                  ← all ATT pages (server + client components)
         └── app/att/api/              ← API route handlers (all under /att/api/)
                ├── auth/signup    POST — create user, set session cookie
                ├── auth/login     POST — verify password, set session cookie
                ├── auth/logout    POST — delete session, clear cookie
                ├── auth/me        GET  — return current user or 401
                ├── courses        GET (list) / POST (create)
                ├── courses/[id]   GET / PATCH
                ├── trials         GET (list, ?courseId=) / POST (create)
                ├── trials/[id]    GET / PATCH (open/close)
                ├── trials/[id]/upload      POST — parse GPX/FIT, process, rebuild leaderboard
                └── trials/[id]/leaderboard GET

Filesystem (.local-data/)
  ├── users/{userId}.json          ← email, displayName, passwordHash
  ├── sessions/{token}.json        ← userId, createdAt
  ├── courses/{courseId}/metadata.json
  ├── trials/{trialId}/metadata.json
  ├── trials/{trialId}/leaderboard.json
  └── trials/{trialId}/entries/{userId}/{entryId}/
        ├── trace.{gpx|fit}
        └── result.json
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

S3 paddlesnitch-data-prod  ← all user data (users, sessions, courses, trials, entries)
```

OpenNext v4 bundles the Next.js server into a single Lambda. No API Gateway — CloudFront routes directly to a Lambda function URL. Static assets (JS/CSS/images) go to S3 and are served by CloudFront with long cache TTLs.

Auth in production: currently uses the same cookie-based session system as local dev (sessions stored in S3). Planned migration to Cognito: swap `src/lib/auth.ts` to verify Cognito JWT from `Authorization: Bearer` header; `getAuthUser()` signature stays the same.

---

## Local Data Layout

```
.local-data/
  users/
    {userId}.json              ← { id, email, displayName, passwordHash, createdAt }
  sessions/
    {token}.json               ← { userId, createdAt }
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
```

---

## Auth System (Local Dev)

Passwords are hashed with HMAC-SHA256 (key: `tt-local-auth`). For production, Cognito handles credentials; the local system is only for dev.

- **Session cookie:** `tt_session` — httpOnly, sameSite=lax, path=/, 30-day maxAge
- **Proxy (`src/proxy.ts`):** Auth is required for `/att/admin/*` routes and all non-GET `/att/api/*` requests (except `/att/api/auth*`). GET requests to non-admin pages (leaderboard, upload form, home) are publicly accessible without a cookie. Unauthenticated requests that need auth redirect to `/att/auth?next={path}`.
- **`getAuthUser()`:** reads cookie → looks up session → looks up user → returns `AuthUser | null`
- **Signup:** `POST /att/api/auth/signup` — creates user + session, sets cookie
- **Login:** `POST /att/api/auth/login` — verifies password, creates session, sets cookie
- **Logout:** `POST /att/api/auth/logout` — deletes session from filesystem, clears cookie
- **Magic link:** `POST /att/api/auth/magic-request` + `GET /att/api/auth/magic-verify?token=` — 15-min single-use token emailed to user; dev mode logs to console

Public pages: home (open trials list), leaderboard, upload form (shows sign-in prompt if no session). Admin pages require login.

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
    auth.ts                    ← getAuthUser(): reads cookie → session → user
    users.ts                   ← createUser, findUserByEmail, findUserById, verifyPassword
    sessions.ts                ← createSession, getSession, deleteSession; SESSION_COOKIE const
    email.ts                   ← sendEmail(): console in dev, TODO SES in prod
    magic-tokens.ts            ← createMagicToken / verifyMagicToken; tokens expire in 15 min
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
pnpm dev        # Next.js on :3000, filesystem storage, local session auth
pnpm seed       # Populate .local-data/ with 8 users, 2 courses, 3 trials, 13 entries
pnpm rivers     # Download Natural Earth river GeoJSON → public/data/rivers.geojson (run once)
pnpm test       # Vitest (45 tests across 6 files)
pnpm test --watch
```

`.env.local`:
```
NODE_ENV=development
USE_LOCAL_STORAGE=true
```

No Docker, no MinIO, no Cognito needed. Sign up via the `/att/auth` page on first run — all data lands in `.local-data/`.

The `.local-data/` directory is gitignored. Delete it to reset all local state.

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

Use **Vitest**. 45 tests across 6 files:
- `src/lib/geo.test.ts` — haversine, line crossing, processTrace, formatTime
- `src/lib/gpx.test.ts` — GPX parser unit tests
- `src/lib/fit.test.ts` — FIT parser unit tests (mocks fit-file-parser)
- `src/lib/csv.test.ts` — CSV parser: flexible columns, all timestamp formats, edge cases
- `src/tests/auth.test.ts` — integration: signup, login, logout, /me (real filesystem, mocked cookies)
- `src/tests/upload.test.ts` — integration: full upload pipeline → leaderboard (real filesystem)

Pattern: pure lib functions get unit tests; API routes get integration tests against a real temp `.local-data/` dir. Only `next/headers` is mocked (Next.js server-only API).

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
