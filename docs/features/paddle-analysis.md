# App: paddle analysis

**Status: 🚧 built, not yet deployed (2026-07-16). Living locally; PR #156 → main
deploys it to `paddlesnitch.com/analyse`.** The design sections below are retained;
the "Implementation status" block is the authoritative *current* state.

Part of the [platform monorepo](platform-monorepo.md). Lives at `apps/analysis`,
`basePath: /analyse` (British spelling — the live URL), on `@paddlesnitch/core`
(users, storage, auth, strava) and `@paddlesnitch/timing` (parsers, conditions,
geo). Map components are app-local (not shared).

## Implementation status (2026-07-16)

**Built & working locally** (`apps/analysis`, its own Next app at `basePath:/analyse`):
- Sources: file upload **and** Strava import (`/analyse/api/strava/activities`).
- Engine (`src/lib/analysis.ts`): speed + distance-per-stroke, **baseline+departures**
  segmentation (rests down / surges up — NOT session-type classification),
  per-effort trend (`held`/`built`/`faded`/`negative-split`), set grouping,
  SUP→kayak **×2** stroke-rate toggle.
- Conditions: real wind (Open-Meteo) + river flow (EA) via `@paddlesnitch/timing`.
- Immersive full-screen **Leaflet** view (`AnalysisView` + `AnalysisMap`): path
  coloured by speed/stroke-rate, surge glow, rest rings, wind rose, flow badge,
  hover tooltips, replay scrubber.
- **Auto-saves per user** → `analysis/{userId}/{id}/session.json` (`src/lib/analysis-store.ts`).
- **My Paddles** library (`/analyse/library`), **saved view** (`/analyse/[id]`),
  **compare** (`/analyse/compare?a=&b=` — deterministic diff, no LLM call),
  **diary notes** (PATCH `.../sessions/[id]`).
- **History-aware insight**: last ~8 saved paddles' stats + notes + prior insights
  feed the prompt (`buildHistory` in `src/lib/llm.ts`).
- **LLM** (`makeInsighter`): **Ollama local / Bedrock prod**, env-only — **no UI or
  per-request model selection** (removed deliberately). Model = `LLM_MODEL`; prod is
  hard-pinned to Bedrock (never the Anthropic quota). No backend / failure →
  deterministic templated insight (`buildInsight`), so it never breaks.

**Prod model decision:** **`mistral.mixtral-8x7b-instruct-v0:1`** (`LLM_MODEL` in
`infra/lib/att-stack.ts` `AnalysisFn`). Chosen because eu-west-1 Bedrock has **no
Llama/Gemma**; Mixtral is **ON_DEMAND** (auto-enables on first invoke — the console
"Model access" page is retired), cheap (~370 tok/paddle), and shares its base with
the local Ollama **`dolphin-mixtral:8x7b`** for prompt-tuning parity. Verified via
the real adapter (~1.8s). NB: Mixtral rejects a separate Converse `system` message,
so `BedrockInsighter` folds system into the user turn. Newer Claude/Nova in
eu-west-1 are **inference-profile only** (`eu.…` ids).

**Infra** (A5, synth-verified, **NOT deployed**): `AnalysisFn` Lambda + CloudFront
`/analyse/*` → server, `/analyse/_next/*` → assets under `_analyse-assets/analyse`
prefix, `bedrock:InvokeModel` IAM. See [platform-monorepo](platform-monorepo.md).

**Not done / risks:** not deployed (merging #156 deploys straight to prod — no
staging); the `/analyse` CloudFront asset routing is synth-verified but never
runtime-tested (basePath asset prefixes are fiddly — smoke-test assets load on
first deploy); the analysis app's own vitest tests aren't run by CI's `pnpm test`
(which is att-only). Deferred: paddle **videos** app; a local gateway to serve both
apps on one origin.

### Resume after a machine reboot
Branch `analysis-playable-slice` (PR #156). Local data (saved paddles, cognito
users) persists in gitignored `apps/att/.local-data` + `.cognito`. To restart:
`pnpm install` → `pnpm dev` (att :3000, regenerates att `.env.local` + cognito) →
`pnpm dev:analysis` (analysis :3001, regenerates `apps/analysis/.env.local` with
`LLM_BACKEND=ollama`, `LLM_MODEL=llama3.2:3b`, shared `DATA_DIR`). Log in on
:3000, then `localhost:3001/analyse`. Needs local **Ollama** running for LLM
insights (else template fallback).

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
