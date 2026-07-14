# App: paddle analysis

**Status: 💭 ideation (2026-07). This doc is the living spec — we fill it as we iterate.**

Part of the [platform monorepo](platform-monorepo.md). Lives at `apps/analysis`,
`basePath: /analysis`, on `@paddlesnitch/core` (shared users, storage, auth) and
`@paddlesnitch/timing` (parsers, conditions, geo, map).

## Concept

A **paddling-session analysis** tool. "Paddle" = an outing on the water, not the
equipment. You upload a session (any format the platform parses — GPX / FIT / TCX
/ CSV / NK SpeedCoach — or import from Strava), and the app finds **something
interesting** about it: not just a time, but what actually happened and what it
implies.

The value is in the inference. A raw trace is messy: starts and stops, warmups,
structured pieces, drills where stroke rate is high but speed is low, wind legs,
flow-assisted stretches. The app teases that structure out, cross-references the
day's weather + river flow, and narrates the insight.

## Pipeline (stages)

1. **Ingest** — reuse `@paddlesnitch/timing` parsers → `TrackPoint[]`
   (lat/lng/time + stroke rate when present). Strava import too.
2. **Derive metrics** — per-point / windowed: speed (from GPS), **distance per
   stroke** (speed ÷ stroke rate), acceleration, split, bearing.
3. **Segment** — auto-detect structure: moving vs stopped, warmup, **pieces**
   (efforts), rest, and **drills** (high stroke rate + low speed / low
   distance-per-stroke). This deterministic pre-processing is the algorithmic
   core — it turns 2000 raw points into a handful of labelled segments.
4. **Context** — pull weather + river flow for the day/location (reuse
   `conditions`), and infer effects per segment (headwind leg slower, downstream
   flow-assisted, etc.).
5. **Insight (LLM)** — feed the **compact structured summary** (segments +
   metrics + conditions), NOT raw points, to an LLM that writes the "what's
   interesting" narrative. Grounded + cheap because the input is pre-summarised.
6. **Visualise** — map with the path **colour-coded** by a chosen metric (speed /
   stroke rate / distance-per-stroke / effort), plus **wind direction** and
   **flow** overlays, and a per-segment breakdown.

## LLM strategy

- **Now:** start with whatever runs **locally** (dev machine) behind a small
  abstraction so the app doesn't care which backend.
- **Later:** wire **AWS Bedrock** (Claude) for the deployed app — fits the
  "same infrastructure / leverage AWS" goal. Infra adds `bedrock:InvokeModel`
  IAM + region config; per-token cost applies.
- **Where it lives:** a pluggable `analyze(context) → insight` interface in
  `core` (or a small `packages/llm`) with backends: local + Bedrock. The app
  calls the interface; infra picks the backend by env.
- **Discipline:** deterministic feature-extraction (stages 2–4) produces a small,
  structured summary; the LLM only narrates. Keeps output grounded and token
  cost low; the interesting *metrics* don't depend on the LLM.

## Shares vs owns

- **From `core`:** identity (same account as att), storage, auth, metrics,
  design system, the LLM abstraction.
- **From `timing`:** parsers, `conditions` (weather/flow), geo utils, Leaflet map
  components (path drawing, tile toggle, river overlay).
- **App-owns:** the metric-derivation + segmentation engine, the analysis data
  model, the insight/visualisation screens.

## Open questions (drive the ideation)

- [ ] **Local LLM** — what's on your machine now (Ollama? LM Studio? a local
      Claude)? Sets the dev backend.
- [ ] **Single session vs library** — is each upload a one-off analysis, or do
      you build a history of your paddles with trends over time?
- [ ] **MVP "aha"** — the smallest output that makes this worth using: the
      colour-coded map? the auto-detected pieces? the LLM narrative? all three?
- [ ] **Segment definitions** — how do we define a "piece" vs "drill" vs "rest"
      (speed/stroke-rate thresholds, or learned)? Needs a couple of your real
      traces to calibrate.
- [ ] **Data model** — fresh (analysis sessions, not race entries); store under
      the `analysis/` S3 prefix.

## Later (deferred)

- Paddle **videos** — upload + group review (reuses `groups` from `timing`).
  Separate feature after the analysis MVP.
