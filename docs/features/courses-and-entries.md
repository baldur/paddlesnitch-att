# Feature spec: Course catalogue + paddler-centric entries

**Status:** draft, in-flight.
**Owners:** Baldur (product), Claude (implementation).
**Tracking:** see GitHub PRs labelled `feature:courses-and-entries`.

## Goals

Two distinct user personas use this app for different things:

- **Organiser** sets up courses (start/finish lines on a stretch of water) and opens time trials on those courses.
- **Paddler** finds an open trial they raced, uploads their GPS trace, sees how they ranked.

The current UX treats both as one flow that starts with "create a course." It should clearly serve both. Specifically:

1. **Courses are a shared resource.** Any signed-in user can browse all courses; they're a catalogue. Only the course's owner can edit/delete the course itself. Any user can open a new trial on any course.
2. **Time trial entries are about racing, not training.** Heart-rate and cadence data is stripped at parse time and never stored — privacy posture matches the public-leaderboard nature of the app.
3. **Boat class is captured per entry.** K1/K2/K4 for kayak; 1X/2X/2-/4X+/4X-/4+/4-/8+ for rowing. Multi-person boats carry a crew list with seat numbers.
4. **Display shows the metrics paddlers actually look at.** Pace in min/500m, km/h, and m/s side-by-side. Date-of-race is explicit, and we warn if the GPS trace's recorded date contradicts what the user picked.

## Non-goals

- Per-class leaderboards as separate pages. The leaderboard is one ranked list; the **UI defaults to a class filter** so paddlers see comparable boats only.
- Crew member account-linking. One person submits on behalf of the boat; other members are named, not registered accounts.
- Retention of HR/cadence as private personal-training data. **Strip at parse time** is final — no opt-in, no hidden storage.
- Migration. Prod has no real users; local seed is regeneratable. Schema-breaking changes are fine; we wipe and re-seed.

## Data model changes

### `TrackPoint` (in `src/lib/types.ts`)

```ts
// before
type TrackPoint = {
  lat: number
  lng: number
  timestamp: Date
  hr?: number      // ← remove
  cadence?: number // ← remove
}

// after
type TrackPoint = {
  lat: number
  lng: number
  timestamp: Date
}
```

### `ProcessedResult`

```ts
// before
type ProcessedResult = {
  startTimestamp: string
  finishTimestamp: string
  totalElapsedSeconds: number
  splits: Split[]
  avgHeartRate?: number       // ← remove
  avgCadence?: number         // ← remove
  hrSeries?: { ... }[]        // ← remove
  cadenceSeries?: { ... }[]   // ← remove
  trackSegment?: LatLng[]
}
```

Splits already carry distance + elapsed time — derive km/h and m/s in display, not storage.

### `BoatClass` (new)

```ts
type KayakClass = 'K1' | 'K2' | 'K4'
type SculClass = '1X' | '2X' | '4X+' | '4X-'
type SweepClass = '2-' | '4+' | '4-' | '8+'
type BoatClass = KayakClass | SculClass | SweepClass

const BOAT_CLASS_INFO: Record<BoatClass, { sport: 'kayak' | 'rowing'; crewSize: number; hasCox: boolean }>
// K1 → { kayak, 1, false }
// K2 → { kayak, 2, false }
// 4X+ → { rowing, 4, true }
// 8+ → { rowing, 8, true }
// etc.
```

### `CrewMember` (new)

```ts
type CrewMember = {
  name: string        // free-text; not a Cognito user
  seat: number | 'C'  // 1 = bow, N = stroke, 'C' = cox
}
```

Validation: seat numbers 1..N are unique within a crew; if the boat has a cox, exactly one 'C' entry exists; the submitter is implicitly one of the crew (their `displayName` populates one seat by default in the UI, editable).

### `EntryStored` (server-side stored record)

```ts
type EntryStored = {
  entryId: string
  userId: string          // submitter (always a paddler account; not necessarily seat 1)
  displayName: string     // submitter display name, denormalised for leaderboard
  submittedAt: string     // ISO; when the upload happened
  filename: string
  raceDate: string        // ISO date; what the user picked, defaulting to today
  traceRecordedDate: string  // ISO date; extracted from the GPX/FIT (UTC date of the first track point)
  dateDiscrepancy?: boolean  // true if raceDate and traceRecordedDate differ by ≥ 1 calendar day
  boatClass: BoatClass
  crew: CrewMember[]      // length === BOAT_CLASS_INFO[boatClass].crewSize + (cox ? 1 : 0); always includes the submitter
  result: ProcessedResult
}
```

### `LeaderboardEntry`

```ts
type LeaderboardEntry = {
  entryId: string
  userId: string          // submitter
  displayName: string     // submitter
  submittedAt: string
  raceDate: string
  dateDiscrepancy?: boolean
  boatClass: BoatClass
  crew: CrewMember[]
  totalElapsedSeconds: number
  splits: Split[]
}
```

(HR/cadence fields removed entirely.)

### `CourseMetadata`

No structural change. Implicit change in the access model:
- API allows reads from any signed-in user.
- API enforces `adminUserId === current.id` only on PATCH/DELETE of the course itself, not on creating a trial against it.

## API changes

| Route | Change |
|---|---|
| `GET /att/api/courses` | Already public-ish (any caller). No change. |
| `GET /att/api/courses/[id]` | No change. |
| `PATCH /att/api/courses/[id]` | Already owner-only. No change. |
| `POST /att/api/trials` | **Drop course-owner check**. Any signed-in user can open a trial on any course. Trial's `adminUserId` is the trial creator (who can open/close), not the course owner. |
| `PATCH /att/api/trials/[id]` | Trial admin (creator) only — already does this. |
| `POST /att/api/trials/[id]/upload` | **Accept new fields** in the multipart form: `boatClass`, `crew` (JSON), `raceDate`. Validate. Strip HR/cadence at parse before processing. Compute `dateDiscrepancy`. |
| `GET /att/api/trials/[id]/leaderboard` | Returns the new shape (no HR/cadence; with boatClass + crew). |

## UX flows

### Paddler

1. Sign in (or browse trials anonymously). Home `/att` lists open trials.
2. Tap a trial → leaderboard page `/att/trials/[id]`.
3. Tap "UPLOAD MY ENTRY" → upload form `/att/trials/[id]/upload`.
4. Upload form fields:
   - GPS file (or Strava/.gpx URL)
   - **Boat class** dropdown (grouped: Kayak / Sculling / Sweep)
   - **Crew list** — appears for multi-person boats only. Pre-populated with the submitter at seat 1 (editable). Seat selector limited to `1..crewSize` plus 'C' if cox.
   - **Race date** picker, defaulting to today.
5. Submit. Result shows totalElapsedSeconds + splits with pace in min/500m, km/h, m/s.

### Organiser

1. Sign in. Home `/att` lists open trials and links to course catalogue.
2. Tap "+ NEW TRIAL" → trial creation flow `/att/admin/trials/new`.
3. Flow:
   - Pick existing course (catalogue, with search/filter), OR
   - Tap "+ NEW COURSE" → existing course-creation flow → returns to trial form with course pre-selected.
4. Fill trial details: name, date (defaults to today), open/closed.
5. Submit. Trial appears on the home page (if open).

### Course catalogue

New page `/att/courses`:
- List of all courses with filter (sport, course type, owner, name).
- Each row shows: name, sport, type, distance, # of trials run on it.
- Tap a course → course detail page `/att/courses/[id]` (existing admin/courses/[id] page made viewable to any signed-in user; edit/delete buttons hidden unless the viewer is the owner).

## Display: speed and pace

Three side-by-side metrics on every split row and on the total:

| Indicator | Formula | Format |
|---|---|---|
| Pace per 500m | `(elapsedSeconds / distanceMetres) * 500` | `m:ss.s / 500m` |
| Speed (km/h) | `(distanceMetres / 1000) / (elapsedSeconds / 3600)` | `12.4 km/h` |
| Speed (m/s) | `distanceMetres / elapsedSeconds` | `3.45 m/s` |

Implemented as helper functions in `src/lib/format.ts` (new); display utilities only, no storage impact.

## Phasing

Implementation breaks down to four PRs that can each ship independently:

| Phase | PR scope | Risk |
|---|---|---|
| **1: HR strip + boat class scaffold** | Parser changes drop HR/cadence; `BoatClass` type added; entry storage extended; upload form gets boat class dropdown; leaderboard table removes HR/cadence columns; seed updated. | Low. Schema break confined to types + seed; prod is empty. |
| **2: Course catalogue + organiser UX** | New `/att/courses` page + course detail viewer; trial creation moved to `/att/admin/trials/new` (picks course); API permission relax. | Medium. Touches multiple pages but no algorithm changes. |
| **3: Crew + seat numbers** | Upload form crew editor; crew validation; leaderboard rows show crew expandable; seed adds crews to multi-person entries. | Low. Additive on top of Phase 1. |
| **4: Pace variants + date picker + discrepancy** | `format.ts` helpers; leaderboard display variants; upload form date picker; discrepancy detection at parse time; leaderboard annotation badge. | Low. Mostly display + UI. |

Each phase ships its own PR with its own tests, runs through CI to green, gets reviewed and merged. The work is sequenced so that Phase 2 isn't blocked on Phase 1 internals (different files); Phase 3 and 4 build on Phase 1's data shape.

## Testing strategy

For each phase:

- **Parser changes** → unit tests assert HR/cadence are absent from parsed output even when present in the input fixture.
- **Type changes** → tests use the new types; old fixtures regenerated.
- **API changes** → integration tests covering: any user can open a trial on any course; only owner can PATCH a course; upload requires boatClass; crew validation rejects duplicate seats; date discrepancy is flagged when expected.
- **Display** → component tests for the leaderboard table covering pace formatting at sane and edge values (very short, very long results), date-discrepancy badge rendering.
- **Seed** → re-runnable; produces realistic data for all boat classes.

Target: 70+ tests after Phase 4 (up from 55 today).

## Known unknowns / open questions

- **Lightweight Strava integration on upload?** Out of scope for now — paddlers paste a Strava URL today, that keeps working. Deferred to a future spec.
- **Per-class leaderboards UI**: starting with a class-filter dropdown is the right MVP. If user feedback wants persistent per-class pages, we'll add later.
- **Editing or deleting your own entry**: existing UI doesn't expose this. Out of scope for this spec.

## CLAUDE.md updates

Each phase's PR updates the relevant sections of `CLAUDE.md`:
- Domain model section gets boat class + crew descriptions.
- Routes table updates for relaxed permissions and upload form fields.
- Local data layout reflects the entry shape changes.
- Test count and coverage gaps updated.
