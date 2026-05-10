# StarScreener — Prompt 2 Hardening Plan

**Branch:** `fix/starscreener-hardening-2026-04-18`
**Base:** `main @ 8771186` (post pre-flight-2 warm-cron fix)
**Author:** Claude Opus 4.7 via auditor chain
**Date:** 2026-04-18

---

## Re-triage (post-cron, post-gate-4)

Pre-flight unfroze the pipeline. Gate 4 ran against fresh data. Three findings were *hidden* while the pipeline was frozen and now surface as locked P0s — they're in addition to the original 20 audit findings, not replacements.

### New locked P0s from post-cron observation

| # | Finding | Evidence | Workstream |
|---|---|---|---|
| N1 | Classifier mis-tags canonical AI coding agents as `devtools` with empty tag arrays | `cline/cline` primary=`devtools`, tags=`[]` (60k⭐, canonical). Pattern corroborated by `letta-ai/letta` and `huggingface/smolagents` → primary=`ai-ml` when they should be `ai-agents`. | **P0.4** (ESCALATED from conditional) |
| N2 | `tier=hot` returns 0 repos under current `assignTier` filter | `curl /api/cron/ingest?tier=hot` → `processed:0` in 5ms. Every `*/15` workflow was failing verify until interim warm-routing shipped (`8771186`). | **P0.3** (absorbed — hot tier gets populated from `WATCHLIST_SEED.md`) |
| N3 | `All-Hands-AI/OpenHands` missing from seed DB in any casing | `/api/repos/All-Hands-AI/OpenHands` → 404. Lowercase also 404. Canonical AI agent, appears in `WATCHLIST_SEED.md` tier A. | **P1 seed-hygiene** (new — wedged into P1.6) |

### Other re-triaged items (carry over from REPORT.md)

- Social mentions persistence (finding #11) → P1.6 scope
- Rank-climber badge vs filter mismatch (finding #10) → P1 nice-to-have
- `RepoChart` synthetic forks/contributors (finding #14) → defer
- Pre-release tags firing `release_major` (finding #8) → P0.4 scope (fits naturally with classifier work)
- Cooldown rule-global vs per-repo (finding #15) → P0.1 scope (alert delivery must be correct before scaling)

---

## Workstream specs

### P0.1 — alert-delivery (HEADLINE)

**Scope:** Resend integration, React Email templates, 4 `starscreener.*` MCP tools, Registry PR, Paperclip fleet wiring.

**Files touched:**
- NEW: `src/lib/email/resend-client.ts`, `src/lib/email/templates/breakout-alert.tsx`, `src/lib/email/templates/daily-digest.tsx`, `src/lib/email/templates/watchlist-spike.tsx`
- `src/lib/pipeline/alerts/engine.ts` (wire email sender after rule fire)
- `src/lib/pipeline/alerts/triggers.ts` (cooldown scope fix: rule-global → per-(rule, repo))
- NEW: `mcp/src/tools/trending.ts`, `mcp/src/tools/emerging.ts`, `mcp/src/tools/repo_signal.ts`, `mcp/src/tools/subscribe.ts`
- `mcp/src/server.ts` (register 4 new tools alongside existing 8)
- NEW: `.data/api-keys.jsonl` (runtime, gitignored)
- NEW: `src/lib/api-keys/issue.ts`, `src/lib/api-keys/verify.ts`

**Dedup policy:** (user_id, repoId, trigger_code) within 7d — one JSONL index `.data/alert-delivery-log.jsonl`, one-line-per-send.

**Tier gating:** anonymous → trending/emerging/repo_signal (60/hr IP); keyed free → +subscribe (1000/hr, 5 concurrent).

**Acceptance:**
- [ ] First real alert email delivered via Resend within 48h of merge (blocked on DNS)
- [ ] MCP Registry PR filed at `modelcontextprotocol/servers`
- [ ] Paperclip fleet (Andy, Sentinel) config shows starscreener MCP subscribed
- [ ] Dedup test: same (user, repo, signal) within 7d = single send

**New deps (allowed — P0, no stdlib alternative):**
- `resend` (email API SDK)
- `@react-email/components`, `@react-email/render` (templates)

### P0.2 — dual-ended-fetch-port

**Scope:** Port `emanuelef/daily-stars-explorer` dual-ended fetch technique to break the 40k-star cap. License-gated.

**Pre-check (blocking):** WebFetch `https://github.com/emanuelef/daily-stars-explorer/blob/main/LICENSE`. Must find explicit MIT/Apache/BSD. If missing → re-implement from algorithm description only, no copy-paste.

**Files touched:**
- `src/lib/pipeline/adapters/events-backfill.ts` (current 40k-cap workaround lives here)
- NEW: `src/lib/pipeline/adapters/dual-ended-stargazers.ts`
- `src/lib/pipeline/ingestion/stargazer-backfill.ts` (call new adapter for >40k repos)

**Acceptance:**
- [ ] License file check green (or re-implement path taken)
- [ ] <5 flat sparklines across the 354-repo seed (baseline: 296/309 flat per original audit)
- [ ] Full daily star history returns correct curve for 3 known-good repos (ollama, langchain, next.js) — verified against OSSInsight known-good values

### P0.3 — watchlist-latency

**Scope:** Load `WATCHLIST_SEED.md`, populate hot tier, z-score trend scoring + anti-spam, emerging feed.

**Files touched:**
- NEW: `src/lib/pipeline/ingestion/watchlist.ts` (parse WATCHLIST_SEED.md, dedupe against existing seed)
- `src/lib/pipeline/ingestion/scheduler.ts` (watchlist → hot tier assignment)
- NEW: `src/lib/pipeline/scoring/z-score.ts` (7d / 30d windows)
- NEW: `src/lib/pipeline/scoring/anti-spam.ts` (drop repos where >50% of today's stars from accounts <7d old — requires stargazer account-age fetch, new cost)
- NEW: `src/app/api/emerging/route.ts`
- `src/lib/pipeline/queries/*.ts` (add `findEmerging` query)

**Explicit non-goals (per user guardrail):** no Kalman, no peak detection, no webhooks yet (preferred but not blocking for v1 — 1-min polling is acceptable).

**Acceptance:**
- [ ] Hot tier populated: >100 watchlist repos in hot after ingest
- [ ] `/api/cron/ingest?tier=hot` → `processed > 0` (fix for N2)
- [ ] Emerging feed surfaces ≥1 repo/day that GitHub Trending misses (measured after 24h data)
- [ ] Median detection lead time <2h vs GH Trending (requires backtest — deferred to P1.8 measurement)

### P0.4 — ai-classifier-fixer (ESCALATED from conditional)

**Scope:** Two-stage classifier per original Prompt 2 Prompt 2 scope.

**Stage 1:** Keyword-based (current), with expanded rules to catch the failure mode: AI coding agents without "agent" in the repo name.
**Stage 2:** Haiku LLM for borderline cases (keyword-stage confidence 0.4–0.8). Gate on `confidence > 0.8` to commit to primary.

**Files touched:**
- `src/lib/pipeline/classification/rules.ts` (broaden ai-agents keyword patterns — add "ide coding", "autonomous coding", "coding assistant", owner-prefix boosts for cline/continuedev/aider)
- NEW: `src/lib/pipeline/classification/llm-stage.ts` (Haiku integration)
- `src/lib/pipeline/classification/classifier.ts` (wire stage 2 + confidence gating)
- `src/lib/pipeline/classification/tag-rules.ts` (fix pre-release tag regex — finding #8 folds in here)
- NEW: `src/lib/pipeline/classification/__tests__/classifier.test.ts`

**Ground truth set (for F1):** WATCHLIST_SEED.md tier A–F repos (133) as positive `ai-*` labels. Non-AI seed repos (221) as negative labels.

**Acceptance:**
- [ ] F1 ≥ 0.85 against the ground-truth set
- [ ] `cline/cline` classifies as primary=`ai-agents` with tags including `coding-agent`
- [ ] `letta-ai/letta` primary=`ai-agents`
- [ ] `huggingface/smolagents` primary=`ai-agents`
- [ ] `MAJOR_VERSION_RE` rejects `1.3.0a3`, `2.0.0-rc1` (finding #8)

**New deps (allowed — P0):**
- `@anthropic-ai/sdk` (already likely available; check package.json)

---

## P1 — FOUNDATION (after all P0 green)

### P1.5 — source-swapper

Typed `StarEventSource` interface; ClickHouse + OSSInsight + GH Archive adapters; cross-check >5% disagreement → Sentry warn; chaos test.

### P1.6 — pipeline-reliability-medic

Close 18 bare `catch {}` sites with typed errors; freshness gates on every user-facing endpoint; circuit breakers + jitter on every external call; also folds: OpenHands seed gap (N3), `.data/mentions.jsonl` empty (finding #11), `/api/search` O(n) scan (finding #6).

### P1.7 — observability-medic

Sentry release/env/user/tenant tags; OTel trace source → score → alert → UI; dashboard contract tests.

### P1.8 — backtest-harness-shipper

50-repo ground truth (WATCHLIST_SEED + OSSInsight AI Agents 90d); ClickHouse demo as source; CI gate on PR regressing >2/50.

---

## Dispatch order & collision map

```
P0.4  (classification/**)       ← serial start, smallest scope
P0.3  (ingestion/** + scoring/**)
P0.2  (adapters/events-backfill.ts + new dual-ended)
P0.1  (alerts/** + mcp/** + NEW email/**)  ← longest, last

P1.5  (adapters/** typed interface — may conflict with P0.2)
P1.6  (cross-cutting catch-cleanup — touches everything)
P1.7  (cross-cutting sentry + otel)
P1.8  (NEW backtest/** + CI gate)
```

P0.4 runs first — tightest scope, locked acceptance, no external blockers.
P0.1 runs last — needs DNS propagation that will take hours in parallel with the code work.

---

## Guardrail checklist (per commit)

- [ ] Diff ≤ 50 lines OR behind a feature flag
- [ ] No new deps outside P0 alert/classifier stack
- [ ] Tests preserved + new tests added
- [ ] Failing test → patch → passing test → rollback note in `ROLLBACK.md`
- [ ] If a fix needs a big refactor: STOP, flag in PLAN.md revision, escalate to user

---

## What does NOT ship in this branch

- Paperclip fleet deployment (their YAML, not mine)
- Resend DNS records (DNS ops on user side)
- UptimeRobot / BetterStack wiring (done out-of-band)
- MCP Registry PR (drafted, filed manually after branch merges)
- Smithery / mcp.so secondary registrations
- Postgres migration from JSONL (P1.5 scaffold only)
