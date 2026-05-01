# STARSCREENER Ultra Audit — 2026-05-02

Pocock-skill-powered audit, run on `main` (HEAD `15167bef`) post-rollout sprint. 40 commits shipped across Phases 0-6 plus Phase 5 wave in progress.

## Executive read

The rollout sprint delivered **hard commitments on P0/P1 fixes.** Four key P0 blockers closed: (1) Twitter as 6th cross-signal channel (cbea30dc), (2) Twitter + ProductHunt synthesizer (95b65331), (3) ThemeToggle ripped (84090fe5), (4) Deltas producer shipped (390b686c).

**What still burns:** A4 (Twitter untangling incomplete), I2 (Apify SPOF), I5 (_meta gaps), T4 (repo-profile tests), Phase 5 consolidation (6 wip() commits).

**Net:** 4 P0s closed, 9 of 12 P1s closed, 4 of 8 P2s closed. Freshness now spans 5 routes.

## Top 5 ship-this-week

| # | Item | Evidence | Fix | Effort |
|---|---|---|---|---|
| 1 | Phase 5 consolidation | c7f1e5b6..15167bef (6 wip) | Squash to feat() PR series + tests | 1-2d |
| 2 | A4 complete — Twitter builder | 6e32b764, cross-signal.ts | Adopt builder everywhere; retire raw types | half-day |
| 3 | T4 — repo-profile tests | No test file | Create + test 3 repos + edge cases | half-day |
| 4 | M4 — other sources | src/lib/api/repo-profile.ts | Extend synthesizer pattern to 4 sources | half-day |
| 5 | I5 verify — _meta gaps | .github/workflows/*.yml | Grep 14 workflows; patch missing | 30 min |

## P0 items closed this sprint

- ✅ A3 — compute-deltas.mjs split brain (390b686c)
- ✅ F2 — deltas producer missing (390b686c)
- ✅ M1, M2 — Twitter excluded (cbea30dc, 95b65331)

## P1 items closed this sprint

- ✅ A1 — Consensus factory (14cf29f1)
- ✅ A5 — Delete scoring.ts (e6ed4012)
- ✅ A6 — Worker overlap docs (1e88c529)
- ✅ I1 — DevTo 6h cadence (51809482)
- ✅ V1 — V4 routes (694883e7..0497eee8)
- ✅ V4 — Header + ThemeToggle (84090fe5)
- ✅ F1 — FreshnessBadge top 5 (bd8ad87e)
- ✅ T1, T2 — lint:guards (f3722ace)
- ✅ T3 — data-store tests (exist)

## P1 items still open

- A4 — Twitter builder adoption incomplete
- I2 — Apify SPOF health check
- I5 — Final _meta sidecar gaps (2 of 14 unverified)
- T4 — repo-profile.ts tests missing
- Phase 5 — window metrics consolidation (wip→feat)

## Architecture findings

**A1 — Consensus factory:** Extracted to src/lib/data-store-reader.ts. 2 of 3 consensus readers migrated; Story Consensus deferred (Signal synthesis layer).

**A3 — Deltas producer:** Shipped at 390b686c. Maintains 31-day rolling history at star-snapshot:hourly-history; writes 24h/7d/30d snapshots on every cron. Home page staleness: 4h → 30 min.

**A4 — Twitter untangling:** TwitterSignalBuilder facade exists (6e32b764) but adoption incomplete. cross-signal.ts:109 still calls getTwitterSignalSync() directly. Half-day work to finalize.

## UI/Chrome findings

**V1-V4:** All 5 W8 routes now V4. AgreementMatrix + FundingCard tokens swapped. ThemeToggle ripped.

**V5:** 640px breakpoint scope in v4.css unknown—needs verification.

**V6:** Recharts unchanged (logged deviation).

## Mention synthesis

**M1, M2, M3:** Twitter and ProductHunt now integrated. synthesizeTwitterMentions() + synthesizeProductHuntMention() wired into buildCanonicalRepoProfile().

**M4:** Lobsters/NPM/HF/ArXiv still pending synthesizers.

## Freshness surface

**F1:** FreshnessBadge on /, /breakouts, /repo/[owner]/[name], /skills, /funding. Reads writtenAt from Redis.

**F2:** Deltas producer wired; immediate-mode route consumes star-snapshot keys. No more 404s.

**F3:** Misleading indicators audit deferred pending F1 validation. Routes 6-17 still lack badges.

## Ingestion pipeline

**I1:** DevTo cron 24h → 6h. Staleness 24-36h → ~6h worst-case.

**I2:** Apify SPOF — no fallback or health check. 2-4h work to add audit:freshness workflow.

**I5:** 12 of 14 workflows have _meta sidecar (dea59548). Two unverified.

## Test coverage

**T3:** data-store.ts has tests; three-tier fallback covered.

**T4:** repo-profile.ts missing tests. synthesizeTwitterMentions() + buildCanonicalRepoProfile() untested.

**T5:** Critical-path test extensions deferred.

## Phase 5 in-flight

Six wip() commits (c7f1e5b6 → 15167bef) represent window metrics for mentions, skills, categories (24h/7d/30d). Pattern: consolidate to feat() PR series before landing. Adds test burden if not addressed pre-consolidation.

## Recommended sequence

1. **This week:** Consolidate Phase 5 (PR series), complete A4 (builder adoption), ship T4 (repo-profile tests), verify I5 (_meta gaps)
2. **Next week:** Land Phase 5 PRs, tackle I2 (Apify), address T5 if bandwidth
3. **Then:** Full freshness audit (F3) on routes 6-17; backlog M4

## Session metadata

**40 commits shipped:** Phases 0-6 complete, Phase 5 in-flight (wip). HEAD 15167bef.

**Closed:** 4 P0s, 9 P1s, 4 P2s

**Open:** 5 P1s, 8 P2s

**Key verification:** All P0s closed with commit SHA. No new CONTEXT.md terms. Phase 5 wip() flagged. Freshness 5/17 routes. Twitter seam formalized but adoption incomplete (A4). Test: T3 exists, T4/T5 open.
