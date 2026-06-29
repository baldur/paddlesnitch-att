# Weather & river flow conditions

**Status:** 🟡 phase 1 shipped (capture + display). Issue #106.

Adds the environmental conditions each entry was set in — **weather** and
**river flow** — to the leaderboard, so a 9:58 set at 8am in a flat calm reads
differently from a 9:58 set at 3pm in a headwind and high water. Both data
sources are **open data with no API key**, so nothing here touches secrets or
billing.

## Sources

| Data | Provider | Endpoint | Key? |
|---|---|---|---|
| Weather (hourly) | [Open-Meteo](https://open-meteo.com/) | `https://api.open-meteo.com/v1/forecast` | No |
| River flow | UK [Environment Agency flood-monitoring](https://environment.data.gov.uk/flood-monitoring/) | `https://environment.data.gov.uk/flood-monitoring` | No |

The EA API is UK-only; weather is global. A course outside the UK simply gets
weather and no flow (a partial capture is still stored).

## Design decisions (from the issue thread)

1. **Station = auto-picked.** No per-course config. We query the EA stations
   endpoint with `parameter=flow` + the course's start-line midpoint + a 25 km
   radius and take the nearest station by great-circle distance. (If this
   proves too coarse for a given river, a per-course station override is the
   obvious next iteration — add `flowStationId?` to `CourseMetadata`.)
2. **Open-Meteo for weather** — free, no key, hourly, global.
3. **Capture at entry upload time; fall back at read time; always persist when
   captured.** Conditions are fetched against the entry's **finish timestamp**
   so each row reflects the conditions that athlete actually raced in.
4. **Both shipped together** (no key needed for either).

## Data model

`EntryConditions` (in `src/lib/types.ts`) hangs off `ProcessedResult.conditions`
(persisted in each entry's `result.json`) and is carried onto
`LeaderboardEntry.conditions` by `rebuildLeaderboard`. Both halves are optional
— a partial capture (weather but no nearby flow station, say) is kept.

```ts
EntryConditions = {
  capturedAt: string        // ISO when we fetched
  location: LatLng          // course start-line midpoint we queried
  weather?: { time, temperatureC, windSpeedKmh, windDirectionDeg, precipitationMm, weatherCode }
  flow?:    { stationId, stationLabel, measureId, flowM3s, time }
}
```

`weatherCode` is a WMO interpretation code; `weatherCodeLabel()` +
`compass8()` (in `src/lib/format.ts`, client-safe) turn the raw numbers into
"Rain", "SW", etc. for display.

## Capture flow

`src/lib/conditions.ts` is the whole feature:

- **Pure, unit-tested helpers** — `midpoint`, `toMs` (treats a zone-less
  Open-Meteo time as UTC), `parseStations` / `nearestStation`,
  `parseReadings` / `nearestReading`, `parseHourly` / `selectHour` (picks the
  hour nearest the target time). The EA API returns a bare object instead of an
  array when there's exactly one `items`/`measures` entry, so the parsers
  normalise that.
- **Network wrappers** — thin, swallow all errors, return `null` on failure.
- **`captureConditions(at, isoTime)`** — orchestrates weather + flow in
  parallel, returns `undefined` only if *both* fail. **No-ops under
  `NODE_ENV=test`** so route/page tests never hit the network.

### Upload time (primary)

The upload route (`trials/[trialId]/upload`) calls `captureConditions` after a
successful match, against `midpoint(course.startLine)` and the result's finish
timestamp, and attaches it to the result before storing. Best-effort: a fetch
failure leaves `conditions` absent and the upload still succeeds.

### Read time (fallback)

`enrichTrialConditions(trialId)` scans a trial's entries, captures conditions
for any that are still missing them (a failed upload-time capture, or an entry
that predates this feature), persists each back to its `result.json`, and
rebuilds the leaderboard if anything changed. It's wired into the trial page
(`/att/trials/[trialId]`) as a best-effort, idempotent, awaited step before the
leaderboard is read — so the first viewer of a trial with un-enriched entries
triggers a one-time backfill; later views find conditions present and skip the
network. No-ops under test (via `captureConditions`).

## Display

The leaderboard's expandable row shows a **CONDITIONS AT FINISH** block —
weather (description, temp, wind speed + compass direction, precipitation) and
flow (m³/s + station name) — above the crew/splits. A row with conditions but
no splits (a sub-500 m course) is now expandable too.

## Tests

`src/tests/conditions.test.ts` — all pure helpers (parsing the real API
payload shapes, nearest-by-distance, nearest-by-time, hour selection, WMO/
compass formatting) plus `enrichTrialConditions` against the real temp
filesystem with an injected capture function (fills + persists + carries to the
leaderboard; skips already-filled entries). The network wrappers themselves are
manual smoke (they hit live third-party APIs).

## Deferred / next iterations

- **Day-level summary while a trial is open** (the issue also asked for this) —
  a single conditions strip on the trial page covering the trial day(s), vs the
  current per-entry detail. Straightforward to add on top of the capture lib.
- **Historical weather** — Open-Meteo's forecast endpoint covers recent dates;
  for trials more than ~3 months old switch to the archive API
  (`archive-api.open-meteo.com`). Not needed yet.
- **Per-course station override** if auto-pick is too coarse on some rivers.
- **Backfill throttling** — `enrichTrialConditions` currently attempts every
  missing entry on first view; if a trial has many legacy entries this could be
  bounded/queued.
