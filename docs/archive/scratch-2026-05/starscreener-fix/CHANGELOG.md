# Changelog — `fix/starscreener-hardening-2026-04-18`

**Base:** `main @ 8771186` (post pre-flight-2 warm-cron fix)
**Branch HEAD moves forward as commits land below.**

---

## Shipped in this PR

### `3c4a221` — fix(cron): route */15 GH Actions to warm until hot tier is populated *(pre-flight-2, already on main)*

One-line YAML change in `.github/workflows/pipeline.yml`. `*/15` schedule
arm changed from `tier=hot` to `tier=warm`. Revert the first arm back to
`hot` once P0.3 lands on production (see below).

### `P0.4` — classifier devtools-fallback fix + pre-release tag rejection

**Files:**
- `src/lib/pipeline/classification/rules.ts` — ai-agents rule broadened: +5 topics, +10 keywords, +25 owner prefixes. Weight 1.5→1.6.
- `src/lib/pipeline/reasons/detectors.ts` — `isMajorVersionTag` rewritten to normalize the tag and reject any non-`[0-9.]` remainder.
- `src/lib/pipeline/__tests__/classification.test.ts` — +7 regression tests.
- `src/lib/pipeline/__tests__/reasons.test.ts` — +4 regression tests.

**Gate-4 repos now classify correctly:**
- `cline/cline`: `devtools` (fallback) → `ai-agents` ✓
- `continuedev/continue`: unknown → `ai-agents` ✓
- `Aider-AI/aider`: unknown → `ai-agents` ✓
- `letta-ai/letta`: `ai-ml` → `ai-agents` ✓
- `huggingface/smolagents`: `ai-ml` → `ai-agents` ✓
- `All-Hands-AI/OpenHands`: (not seeded — seed gap covered by P1) → `ai-agents` (once seeded)

**Pre-release tag rejection:**
- `1.3.0a3` (PEP 440 alpha) — was firing `release_major` in `.data/reasons.jsonl` line 2 per audit finding #8. Now rejected. ✓
- `v1.0.0-rc1`, `v2.0.0+build.42` — rejected. ✓
- Clean majors (`v2.0`, `3.0.0`, `release-4.0`, `15.0`) — still fire. ✓

**Test suite:** 100 → 111 pass (+11). No deletes.

### `P0.3` — wire curated AI watchlist → hot-tier candidate set

**Files:**
- `src/lib/pipeline/ingestion/watchlist.ts` (NEW) — 122 slugs from `WATCHLIST_SEED.md` tiers A–J (flagged entries excluded). Case-insensitive membership.
- `src/app/api/cron/ingest/route.ts` — per-repo `TierContext` now populates `isWatchlisted` from the watchlist module and `isBreakout` from `movementStatus === "hot"`.
- `src/lib/pipeline/__tests__/watchlist.test.ts` (NEW) — 6 tests.

**Fixes:** The `tier=hot` cron no-op surfaced by gate 4 (processed:0 in 5ms). Hot tier now includes every watchlist repo.

**Test suite:** 111 → 117 pass (+6). No deletes.

**Deferred to P0.3-followup:**
- z-score (7d/30d windows)
- anti-spam (>50% stars from <7d-old accounts)
- `/api/emerging` route
- median-detection-lead-time measurement (requires P1.8 backtest harness)

### Documentation

- `starscreener-fix/PLAN.md` — re-triaged Prompt 2 scope + 3 new post-cron findings
- `starscreener-fix/CHANGELOG.md` — this file
- `starscreener-fix/ROLLBACK.md` — per-commit revert steps
- `starscreener-fix/BACKTEST.md` — harness spec for P1.8

---

## NOT shipped in this PR (explicit non-goals for the initial-ship shape)

| Workstream | Why not in this PR | Next step |
|---|---|---|
| **P0.1 alert-delivery** | ~1000+ LOC across Resend SDK + React Email + 4 MCP tools + Paperclip YAML + Registry PR. Also blocked on DNS propagation (`alerts.starscreener.dev` DKIM/SPF/DMARC) that takes hours regardless. | Follow-up PR; shippable independently once DNS records live. |
| **P0.2 dual-ended fetch port** | License check green (MIT © Emanuele Fumagalli). Implementation is 200-400 LOC of adapter code + integration tests against 3 known-good repos (ollama, langchain, next.js). Out of scope for this PR's size. | Follow-up PR — retain MIT attribution header in the ported file. |
| **P1.5 source-swapper** | Multi-day: typed interface + ClickHouse/OSSInsight/GH Archive adapters + chaos test + 30d mirror plan. | Prompt 3. |
| **P1.6 pipeline-reliability-medic** | Cross-cutting: 18 bare-catch cleanup, freshness gates on every endpoint, circuit breakers everywhere, OpenHands seed-gap fix. | Prompt 3. |
| **P1.7 observability-medic** | Sentry release/env/user/tenant tags + OTel end-to-end tracing + dashboard contract tests. New Sentry dep. | Prompt 3. |
| **P1.8 backtest-harness-shipper** | 50-repo ground truth + ClickHouse demo wiring + CI gate on PR-regression. Harness spec written in BACKTEST.md. | Prompt 3. |

---

## Production effect after this PR merges

1. `/api/cron/ingest?tier=hot` will process ~60-100 repos per call (up from 0).
2. `.github/workflows/pipeline.yml` should be reverted to `*/15 → tier=hot` in a follow-up one-line PR so the curated watchlist gets its sub-15min cadence.
3. Classifier re-runs on next ingest will re-tag `cline`, `letta`, `smolagents`, `aider`, `continue`, etc. as `ai-agents` (was `devtools`/`ai-ml`).
4. `release_major` reason stops falsely firing on `.0a3`/`.0rc1`/etc.

No user-visible breaking changes. No schema changes. No new runtime dependencies.
