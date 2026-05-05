# Drift Audit Report - 2026-05-05

Consolidated audit findings from Phase 1.0 of `structuring-a-repository-silly-frost.md`. Three Explore agents drift-checked the highest-stakes candidate-living docs against current code on 2026-05-05; this report captures the findings and the resulting action per doc.

The plan rule that drove this pass: the INDEX must NEVER bless stale docs as `status: living`. Every doc that gets that label must first be verified against current code and refreshed where it has drifted. Stamping a stale doc as living poisons Claude's context worse than the sprawl does.

---

## Bucket A - ACCURATE (stamp `status: living`, no body edits)

These docs were verified clean against current code. Frontmatter prepended; body untouched.

| Doc | Verification basis |
|-----|--------------------|
| `docs/ARCHITECTURE.md` | 27/27 claims verified - Redis 3-tier read order, namespace `ss:data:v1:<key>`, three compute lanes, error categories all match `src/lib/data-store.ts` and `src/lib/errors.ts` |
| `docs/DEPLOY.md` | 16/16 verified - env var names, Vercel/Railway project names, Node 22.x match `.env.example` and `package.json#engines` |
| `docs/INGESTION.md` | Scraper cadence at `:07`, dual-write via `scripts/_data-store-write.mjs`, Redis-as-truth phase 4 all verified against current `.github/workflows/scrape-trending.yml` and the writer helper |
| `docs/TWITTER_SIGNAL_LAYER.md` | Nitter provider, 4-query bundle, ingest auth, leaderboard routes all match current code; this doc is correct - the stale claim was in `CLAUDE.md` (see Bucket E) |
| `docs/SOURCE_DISCOVERY.md` | Query families and discovery slices match `scripts/_source-watchers.mjs` |
| `docs/openapi.yaml` | In sync with `docs/openapi.json` (regenerated via `@redocly/cli bundle --ext json`); YAML is canonical, JSON is build artifact |

Action this PR: prepended `last-verified: 2026-05-05` / `verified-by: claude` / `status: living` frontmatter. For `openapi.yaml` (already YAML), added a 3-line `# last-verified` / `# verified-by` / `# status` comment block above the `# ----` banner; `openapi.json` deliberately untouched (it is a regenerated artifact).

---

## Bucket B - REFRESHABLE (small inline edits, then stamp living)

Three docs with <15 lines of drift each. Edited in place, then frontmatter stamped.

### `docs/SITE-WIREMAP.md`

- Route count `78` -> `93` (matches actual `src/app/**/page.tsx` count post-2026-05-04 wave)
- Skills cadence row clarified: `refresh-skill-install-snapshot` is daily 03:00 UTC, but other skill collectors remain on 6h / 12h cadences (`refresh-skill-derivatives` `7 */12 * * *`, `refresh-skill-lobehub` `45 */12 * * *`, plus daily refresh-skill-claude / -smithery / -skillsmp)
- Model-usage row: added note that `cron-mcp-usage-rotate` runs monthly `0 3 1 * *` alongside daily `refresh-mcp-usage-snapshot` at `30 3 * * *`
- Section 4 (reverse map) gained 3 missing internal collector rows: `cron-github-pool-budget` (every 5 min), `cron-subdomain-takeover` (weekly Mon `20 3 * * 1`), `sre-actions-visibility` (every 15 min). The other 3 names from the audit (`cron-mcp-usage-rotate`, `refresh-reddit-baselines`, `refresh-skill-forks-snapshot`) were already present in the table, so no action needed for those

### `docs/OPERATOR.md`

- Hourly cron table: `audit-freshness` row `:00` -> `:08` (actual cron is `8 * * * *`)
- Aggregations bullet list: added explicit `snapshot-consensus` row showing daily @ 23:55 UTC (cron `55 23 * * *`); `consensus-trending` (hourly @ :50) was already correct
- Workflow count `62` -> `83` in the engine-geography ASCII art and in the references list at the bottom; the references-list entry also gained a `[snapshot 2026-05-02]` tag pointing readers to ENGINE.md's snapshot label
- `Last refreshed` line refreshed to `2026-05-05 (Phase 1.0 docs-drift verification pass)`

### `docs/API.md`

- New section `## Admin / Cron`: documents the existence of `src/app/api/admin/*` and `src/app/api/cron/*` route groups, plus their auth model (`verifyAdminSession` and `verifyCronAuth` from `src/lib/api/auth.ts`). Per-route schemas deferred. Cron schedules pointed to SITE-WIREMAP.md section 4.
- New section `## Agent Commerce`: lists the 5 routes added in PRs #96-97 (`/api/agent-commerce`, `/[slug]`, `/categories`, `/signals`, `/trending`); notes they are public read with no auth gate; schemas TBD; upstream collector is `cron-agent-commerce` (daily `31 4 * * *`)

Action this PR: above edits applied, then frontmatter stamped `living` on all three.

---

## Bucket C - NEEDS-REWRITE (stamp `status: snapshot`, defer rewrite to backlog)

These docs would actively mislead Claude if labeled living. Each gets `status: snapshot` with the audit date and a one-line reason. NO body edits; the doc stays at its current path so existing links don't break, but the frontmatter warns Claude / readers that the body is stale. A rewrite task is added to `tasks/BACKLOG.md`.

| Doc | Snapshot reason |
|-----|-----------------|
| `docs/ENGINE.md` | predates 2026-05-04 workflow expansion; 26% workflow undercount (claims 62, actual ~83), 3 wrong cron schedules (HuggingFace claimed `*/3` actual `*/6`; `enrich-arxiv` claimed `*/6` actual `*/12`; `refresh-mcp-smithery-rank` claimed `*/6` actual daily `11 3 * * *`), 21 SRE / infra workflows entirely absent from the section-4 inventory |
| `docs/DATABASE.md` | predates Redis-as-primary + Supabase-as-data-lake architecture; reads as a "proposed Postgres migration" plan; doesn't reference ADR 0001 (`docs/adr/0001-supabase-append-only-data-lake.md`) which is the actual current model |
| `docs/SCORING.md` | describes deprecated v1/v2 3-source consensus (ours/oss/trendshift weights 0.45/0.25/0.30 with `consensus_pick` / `external_breakout` etc. badges); current production is 8-source v3 + Kimi K2.6 AI Analyst (PR #52, commit 9a72f772, weights gh=0.20 / hf=0.18 / hn=0.16 / x=0.14 / r=0.10 / pdh=0.08 / dev=0.08 / bs=0.06; coverage bonus, concordance multiplier, verdict bands); zero mention of Kimi integration in the doc |

Action this PR: snapshot frontmatter prepended. Rewrite tasks queued in BACKLOG.md (see "Phase 1 Follow-Up Rewrites" section).

---

## Bucket D - UNVERIFIABLE this pass (deferred to backlog)

Out of budget for this PR. Tagged for a follow-up sweep:

- `tasks/CURRENT-SPRINT.md` (639 lines), `tasks/BACKLOG.md` (now 450+ lines) - too long for the per-doc verification budget; needs a manual scan against recent `git log` to mark closed items
- `docs/runbooks/*` (5 files), `docs/protocols/*` (5 files), `docs/RUNBOOK-secret-rotation.md`, `docs/DESIGN_SYSTEM.md` - not yet drift-audited

Action this PR: BACKLOG entry "Phase 1.0.D verification sweep" added so a future Explore agent picks these up.

---

## Bucket E - CLAUDE.md drift

The audit caught one stale claim in the project's own `CLAUDE.md`:

- BEFORE: "Twitter uses Apify `apidojo~tweet-scraper` actor. Cookie-based providers are dead post-2026 anti-bot. Apify actor runs 4 query templates per tracked repo per scan."
- AFTER: "Twitter uses Nitter as the current provider (see docs/TWITTER_SIGNAL_LAYER.md and `scripts/check-nitter-health.mjs` for the live health probe). Cookie-based scrapers and the previous Apify `apidojo~tweet-scraper` path are dead/deprecated - do not revert."

Reality check: `scripts/check-nitter-health.mjs` exists; no live Apify references in current scripts; `docs/TWITTER_SIGNAL_LAYER.md` correctly says provider is `nitter`.

The note remains in the Anti-Patterns context so it still warns against reverting to the Apify cookie-based path; it just no longer claims Apify is what's running.

---

## Action Summary

### Changed in this PR

- 6 ACCURATE docs stamped `status: living` (frontmatter only; bodies untouched). Note: 5 of the 6 markdown docs already had frontmatter from a prior pass; only `docs/openapi.yaml` was stamped fresh in this PR via comment-block.
- 3 REFRESHABLE docs (`SITE-WIREMAP.md`, `OPERATOR.md`, `API.md`) received small inline drift fixes plus living-frontmatter
- 3 NEEDS-REWRITE docs (`ENGINE.md`, `DATABASE.md`, `SCORING.md`) stamped `status: snapshot` with audit date and reason; bodies untouched
- `CLAUDE.md` Twitter-provider line corrected (Apify -> Nitter, with anti-pattern context preserved)
- `tasks/BACKLOG.md` gained a "Phase 1 Follow-Up Rewrites" section with 4 tasks
- This drift report committed at `docs/archive/drift-report-2026-05-05.md`

### Deferred to follow-up backlog

- ENGINE.md full rewrite (re-derive from `.github/workflows/` glob)
- DATABASE.md full rewrite (Redis + Supabase duality, reference ADR 0001)
- SCORING.md full rewrite (v3 8-source + Kimi K2.6)
- Phase 1.0.D verification sweep (sprint, backlog, runbooks, protocols, RUNBOOK-secret-rotation, DESIGN_SYSTEM)

### Not fixable in this pass

- None of the bucket-A or bucket-B docs hit any drift the editor couldn't fix in <15 lines
- Bucket-C drift is by definition out-of-scope for inline edits; rewrites are queued
- The plan also called for a `docs/INDEX.md` manifest (Phase 1.2) and a `git mv` of historical docs into `docs/archive/` (Phase 1.3); those are downstream of this verification pass and live in their own sub-phases of the plan
