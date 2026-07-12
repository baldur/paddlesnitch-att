# App: paddle analysis

**Status: 💭 ideation (2026-07). This doc is the living spec — we fill it as we iterate.**

Part of the [platform monorepo](platform-monorepo.md). Lives at `apps/analysis`,
`basePath: /analysis`, on `@paddlesnitch/core` (shared users, storage, auth).

## Concept (as described)

> "Analysis of paddles where you can enter your paddle or paddle bits and it will
> generate an analysis."

A tool where a paddler describes their paddle (or its components) and gets back a
generated analysis. A later, separate feature adds **paddle videos** (upload for a
group to review) — tracked apart from the analysis MVP.

## Open questions (drive the ideation — to be answered with Baldur)

**What is a "paddle" here?**
- [ ] Which discipline(s) — sprint/marathon kayak, canoe, SUP, rowing oars, WW?
- [ ] Is a paddle one object, or assembled from **bits** (shaft, blade, length,
      feather/offset, grip, cross-section)? What are the canonical "bits"?
- [ ] Do users pick from a **catalogue** of known paddles/brands, enter custom
      specs, or both?

**What analysis is generated?**
- [ ] Fit/recommendation (is this paddle right for my height / discipline / goal)?
- [ ] Performance characteristics (catch, power, stroke rate implications)?
- [ ] Comparison between two paddles / setups?
- [ ] Is it rule-based, data-driven, or LLM-generated prose (Claude)?
- [ ] Output form — a report page, a score, a chart, a shareable link?

**Inputs**
- [ ] Just the paddle spec, or also the paddler (height, weight, span, discipline,
      goals)? Any tie-in to att data (their times / stroke rate)?

**Audience & sharing**
- [ ] Private to the user, or shareable / group-visible (reuse `groups` from
      `timing`)?

## What it shares vs owns (initial guess — refine)

- **From `core`:** identity (same account as att), storage, auth, metrics, the
  design system.
- **Possibly from `timing`:** `groups` (for the later videos-for-group feature);
  the paddler's stroke-rate data if analysis references att performance.
- **App-owns:** the paddle/bits data model, the analysis engine, its own screens.

## MVP scope — TBD

To be defined once the questions above are answered. Aim: the smallest thing that
lets a paddler enter a paddle and get a useful analysis back.

## Not in the MVP (deliberately deferred)

- Paddle **videos** (upload + group review) — a separate feature after the
  analysis MVP ships.
