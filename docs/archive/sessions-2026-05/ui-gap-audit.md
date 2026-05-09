# UI Gap Audit — 2026-04-28

Audit of `src/lib/*.ts` modules with weak or no UI consumer, and routes
that render placeholder content. Goal: surface things we built but never
showed users.

## Method

For each top-level `src/lib/*.ts` module (79 total, excluding subdirs and
infrastructure like `data-store`, `constants`, `env`, `types`, `bootstrap`):
count import references inside `src/app/` and `src/components/`. Modules
with **zero** consumers downstream of UI are flagged for review. Then
grep `src/app/` for "coming soon" / "placeholder" / TODO markers to
catch routes that exist but render nothing real.

## Findings

### A. Filled this session

| Module | Prior status | Action |
| --- | --- | --- |
| `/research` page | Static "coming soon" placeholder. Promised arXiv + Papers With Code + HuggingFace, no collectors existed. | Replaced with live page reading `huggingface-trending.json` + `arxiv-recent.json` from the data-store. Two new collectors (`scripts/scrape-huggingface.mjs`, `scripts/scrape-arxiv.mjs`) and two GH workflow crons (3h cadence). |

### B. Zero-reference lib modules — all correctly server-only

| Module | Why no UI is fine |
| --- | --- |
| `src/lib/github-token-pool.ts` | PAT pool / rate-limit accounting. Used by `pipeline/adapters/github-adapter.ts`, `pipeline/adapters/social-adapters.ts`, `pipeline/ingestion/events-backfill.ts`. Pure infra. |
| `src/lib/manual-repos.ts` | Manual repo allowlist loader. Used by `derived-repos.ts` and `repo-intake.ts`. Pure infra. |
| `src/lib/npm-dependents.ts` | Server-side npm dependents-count loader. Used by `api/repo-profile.ts`. Pure infra. |
| `src/lib/scoring.ts` | Momentum scoring. Used by `lib/twitter/service.ts`. Pure algorithm. |

No action — all four are correctly UI-agnostic infrastructure.

### C. Stale "coming soon" notes

| File | Line | Note | Action |
| --- | --- | --- | --- |
| `src/app/news/_tabs/devto.tsx` | 141 | "dedicated /devto page coming soon" | Stale — `/devto` already exists at `src/app/devto/page.tsx`. **Recommend:** remove the ComingSoonNote and link directly to `/devto`. (Out of scope this session.) |

### D. Out-of-scope candidates noted, not built

These have UI surfaces but the surface is thinner than the lib supports.
Logging here as future-session candidates; nothing is broken today.

| Module | UI today | Possible expansion |
| --- | --- | --- |
| `src/lib/predictions-calibrator.ts` | Cron route only (`api/cron/predictions/calibrate`) + raw JSON at `api/predict/calibration`. | A dashboard page showing calibration curve + Brier score over time would be a natural addition once the calibration data has a few months of history. |
| `src/lib/source-health-tracker.ts` | Health endpoints (`api/health`, `api/health/sources`) emit JSON. | An admin-side per-source health board (uptime % + last failure window) would surface ingest-pipeline state to operators without curl. |

## Summary

The audit's biggest gap — `/research` — was the target of this session and
is now filled with live data. Remaining "zero-ref" lib modules are
correctly infrastructure-only, not orphaned features. Two future-session
expansion candidates noted in section D, but neither is broken today.
