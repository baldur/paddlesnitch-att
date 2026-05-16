# Time Trials — Project Guide

## What This Is

A web application for managing GPS-timed river time trials for kayaking and rowing. Organisers define courses with drawn start/finish lines; participants upload GPS traces from fitness apps; the system calculates elapsed time, 500 m splits, and any available biometric data.

---

## Domain Model

### Course
A named stretch of water with:
- **Start line** — exactly 2 lat/lng points defining a straight line across the river
- **Finish line** — exactly 2 lat/lng points defining a straight line across the river
- **Distance** — total course length in metres (used to generate 500 m split markers)
- **Sport** — `kayak` | `rowing` | `both`
- Owned by the user who created it (the **course admin**)

### Time Trial
An event on a Course with a date/window. A course can host many time trials. Has a status: `open` | `closed`.

### Entry
A participant's submission for a specific time trial, consisting of:
- A raw GPS trace file (GPX or FIT format)
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
Given a GPS track as an ordered array of `[lat, lng, timestamp]` tuples and a polyline (array of `[lat, lng]` segments), a crossing is detected when any consecutive pair of track points forms a segment that intersects any segment of the polyline. Intersection uses standard 2D line-segment math (cross-product / parametric form). Haversine is used for distance calculations. All geo math lives in `src/lib/geo.ts`.

### 500 m Split Calculation
Walk the track from the start-crossing point, accumulating Haversine distance between consecutive points. Record the interpolated timestamp each time cumulative distance crosses a 500 m boundary. Continue to the finish crossing.

---

## Tech Stack

| Layer | Choice | Reason |
|---|---|---|
| Frontend | Next.js (App Router) + TypeScript | Full-stack, Claude knows it deeply |
| Styling | Tailwind CSS + shadcn/ui | Productive UI from plain English specs |
| Maps | Leaflet + react-leaflet | Free, no API key, good drawing plugin |
| Map drawing | Leaflet.draw | Admin draws start/finish polylines |
| Auth | AWS Cognito (User Pools) | Serverless, free tier 50k MAU, JWT |
| Storage | Amazon S3 | All data — traces, results, course defs |
| API | AWS Lambda + API Gateway HTTP API | Serverless, cheap at low scale |
| Processing | AWS Lambda (S3-triggered) | GPX/FIT parsing on upload |
| CDN | CloudFront + S3 OAC | Serve static assets + public JSON |
| IaC | AWS CDK (TypeScript) | All infrastructure as code |

---

## Architecture

```
Browser
  │
  ├─── CloudFront ──► S3 (frontend bundle)
  │
  ├─── CloudFront ──► S3 (public data: courses/*.json, results/*.json)  [cache-friendly reads]
  │
  └─── API Gateway HTTP API
         ├── POST /courses            → Lambda (write course JSON to S3)
         ├── POST /trials             → Lambda (write trial JSON to S3)
         ├── GET  /upload-url         → Lambda (returns S3 presigned PUT URL)
         └── GET  /entries/{id}       → Lambda (return entry/result JSON)

S3 Upload (participant) ──► S3 Event ──► Processing Lambda
                                            ├── Parse GPX/FIT
                                            ├── Detect start/finish crossings
                                            ├── Calculate splits + metrics
                                            └── Write result.json to S3
```

All Lambdas are authenticated via Cognito JWT (API Gateway authorizer). Upload presigned URLs are scoped to the participant's prefix.

---

## S3 Data Layout

```
s3://{data-bucket}/
  courses/
    {courseId}/
      metadata.json          ← course definition (start line, finish line, distance, sport, adminUserId)
  trials/
    {courseId}/
      {trialId}/
        metadata.json        ← trial definition (date, status, name)
        leaderboard.json     ← sorted array of result summaries (regenerated after each entry)
        entries/
          {userId}/
            {entryId}/
              trace.gpx      ← raw uploaded file (or .fit)
              result.json    ← processed result (splits, crossings, metrics)
```

**Public read via CloudFront OAC:** `courses/*/metadata.json`, `trials/*/metadata.json`, `trials/*/leaderboard.json`

**Private (Lambda-only access):** `trials/*/entries/*`

---

## AWS CDK Stack Layout

```
infra/
  bin/
    app.ts                   ← CDK app entry point
  lib/
    storage-stack.ts         ← S3 buckets (data + frontend)
    auth-stack.ts            ← Cognito User Pool + Client
    api-stack.ts             ← API Gateway + Lambda functions
    cdn-stack.ts             ← CloudFront distributions (frontend + data)
    processing-stack.ts      ← S3-triggered processing Lambda
```

All stacks are in TypeScript. Lambda functions live in `lambda/` at the repo root and are bundled with esbuild via CDK's `NodejsFunction`.

---

## Frontend Structure

```
src/
  app/
    page.tsx                 ← Home / list of open trials
    auth/                    ← Sign in / sign up (Cognito hosted UI or custom)
    admin/
      courses/
        new/page.tsx         ← Create course (map + fields)
        [courseId]/page.tsx  ← Manage course
      trials/
        new/page.tsx         ← Create trial
        [trialId]/page.tsx   ← Manage trial (open/close)
    trials/
      [trialId]/
        page.tsx             ← Public leaderboard
        upload/page.tsx      ← Participant upload
  lib/
    geo.ts                   ← All geospatial math (crossing detection, haversine, splits)
    gpx.ts                   ← GPX parser
    fit.ts                   ← FIT file parser
    s3.ts                    ← S3 client helpers
    cognito.ts               ← Auth helpers
  components/
    map/
      CourseMap.tsx          ← Read-only Leaflet map showing course
      DrawingMap.tsx         ← Admin map with Leaflet.draw for polylines
    leaderboard/
      LeaderboardTable.tsx
      SplitChart.tsx
```

---

## GPS File Formats

### GPX
XML format. Extract `<trkpt lat="" lon=""><time>` elements. Heart rate in Garmin extensions: `<gpxtpx:hr>`. Cadence (stroke rate): `<gpxtpx:cad>`.

### FIT (Flexible and Interoperable Data Transfer)
Binary format. Use the `fit-file-parser` npm package. Fields: `position_lat`, `position_long` (semicircles — divide by 11930465 for degrees), `timestamp`, `heart_rate`, `cadence`.

Accept any file extension on upload — unknown formats are stored raw and skipped silently during processing. Parsing attempted by file extension: `.gpx` → GPX parser, `.fit` → FIT parser, `.csv` → TBD (examples needed).

### CSV
Format TBD — real examples needed before implementing. Files stored; processing skipped for now.

---

## Roles & Permissions

| Action | Who |
|---|---|
| Create a course | Any authenticated user |
| Edit/delete a course | Course admin (creator) only |
| Create a time trial on a course | Course admin only |
| Open / close a time trial | Course admin only |
| Upload a trace | Any authenticated user (when trial is open) |
| View leaderboard | Anyone (public) |
| View other participants' raw traces | Course admin only |

Enforced in Lambda via Cognito JWT `sub` claim matched against `adminUserId` stored in `metadata.json`.

---

## Map Notes

- **Leaflet.draw** is used in the admin interface for drawing start/finish polylines. Each polyline is stored as an array of `[lat, lng]` pairs in the course `metadata.json`.
- **react-leaflet** wraps Leaflet for React. Use dynamic imports (`next/dynamic`) with `{ ssr: false }` for all map components — Leaflet requires `window`.
- The public leaderboard page shows the course on a read-only map with start line (green), finish line (red), and 500 m markers.
- Base tiles: OpenStreetMap (free). For river detail, consider adding an Esri satellite layer toggle.

---

## Local Development

Local dev uses the **filesystem** as a drop-in for S3. No Docker or MinIO required.

`src/lib/storage.ts` exports `getObject`, `putObject`, `listObjects` — backed by `.local-data/` in dev (`NODE_ENV=development`) and the AWS S3 SDK in prod. Same interface, zero divergence in application code.

Auth in dev: `NEXT_PUBLIC_DEV_MODE=true` bypasses Cognito entirely. A hardcoded dev user (`dev@local`, role selectable via env) is injected. Production always uses Cognito JWT.

```bash
# Start local dev
pnpm dev        # Next.js on :3000, filesystem storage, mock auth

# Run all tests
pnpm test       # Vitest

# Deploy to AWS (later)
cd infra && pnpm cdk deploy
```

---

## Testing

Every feature gets tests. No exceptions. Use **Vitest**.

- `src/lib/geo.test.ts` — unit tests for crossing detection, haversine, splits (pure functions, no I/O)
- `src/lib/gpx.test.ts`, `fit.test.ts` — parser unit tests with fixture files in `src/lib/__fixtures__/`
- `src/app/api/**/route.test.ts` — API route integration tests using filesystem storage
- No mocking of storage — tests use a temp dir, cleaned up after each test

Run: `pnpm test` (watch: `pnpm test --watch`)

---

## Design System

**Aesthetic: retro timing board — dark, monospaced, neon amber**

- Background: `#0a0a0a`
- Surface: `#141414`
- Primary accent: `#f59e0b` (amber — old LED display)
- Secondary accent: `#06b6d4` (cyan — splits, secondary data)
- Text: `#e5e5e5`
- Muted: `#525252`
- Font: `IBM Plex Mono` (Google Fonts) — all UI text, headers, numbers
- Numbers/times: large, monospaced, tabular figures (`font-variant-numeric: tabular-nums`)
- Borders: thin `1px solid #262626`
- No rounded corners on data elements — sharp, precise
- Subtle scanline texture on hero areas (CSS `repeating-linear-gradient`)
- Mobile-first responsive — all tap targets min 44px

---

## Key Conventions

- All IDs are `nanoid()` (URL-safe, short).
- Timestamps stored as ISO 8601 strings in JSON.
- Times (splits, elapsed) stored as seconds (float) in JSON, formatted for display in the UI as `m:ss.t` (e.g. `3:42.1`).
- All geo coordinates stored as `[lat, lng]` number pairs (NOT GeoJSON `[lng, lat]` — be careful).
- Start/finish lines stored as exactly `[[lat, lng], [lat, lng]]` — two points, one straight line.
- No Lambda for local dev — Next.js API routes call the same handler functions.
- CDK environment values passed to the frontend at build time via environment variables.
- YAGNI: don't build what isn't needed for the current spec. KISS: simplest thing that works.
- Never commit AWS credentials. Use IAM roles for Lambda; use `aws sso` locally.
- Target domain: `rrc-tt.snitchmedia.com`

---

## Cost Model (Low Scale)

At low scale (< 1000 entries/month):
- S3 storage + requests: < $1/month
- CloudFront: free tier / cents
- Lambda: free tier covers ~1M invocations
- API Gateway: $1/million requests
- Cognito: free up to 50,000 MAU

Migration path to add a database: replace S3 JSON reads with DynamoDB queries; processing Lambda writes to both S3 (raw) and DynamoDB (indexed results). The leaderboard query becomes a DynamoDB scan/query instead of reading `leaderboard.json` from S3.
