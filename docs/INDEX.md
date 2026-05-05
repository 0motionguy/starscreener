---
last-verified: 2026-05-05
verified-by: claude
status: living
---

# STARSCREENER / trendingrepo.com -- Documentation Index

This is the canonical map of every markdown document in the repository,
classified by trust level. Built 2026-05-05 as part of the Phase 1 docs
restructure (see `docs/archive/drift-report-2026-05-05.md`).

Inventory scope: 862 markdown files across the working tree, excluding
`node_modules/`, `.next/`, `.git/`, `.stryker-tmp/`, `awesome-codex-skills/`
(vendored), `starscreener-inspection/` and `starscreener-fix/` (sibling
checkouts), and `.claude/worktrees/` (separate branches). The index links
in-repo docs only; secondary archives are summarized as counts.

## How to use this index

1. **First stop for any question** -- find the topic, jump to a `living` doc.
2. **Snapshot docs** are dated and should be treated as historical reference,
   not current state. They will be rewritten or retired (see `tasks/BACKLOG.md`
   "Phase 1 Follow-Up Rewrites").
3. **Archive docs** are read-only -- do not consult them to understand current
   code. Useful only for archaeology.
4. **Path-scoped CLAUDE.md** files load on demand when Claude reads files in
   that subdirectory; they are not for human onboarding.

## Trust legend

- `living` -- verified <=90 days ago, kept current, safe to trust
- `snapshot` -- accurate at audit-date; may be stale; do not rely on for current state
- `needs-verification` -- not yet drift-audited
- `archive` -- read-only history
- `pointer` -- thin redirect to another doc
- `worklog` -- ticket-bound progress log; trust ends at ticket close

---

## Root-level files

| Path | Purpose | Status |
|---|---|---|
| `CLAUDE.md` | Session opening protocol + project conventions (the front door) | living |
| `CLAUDE.local.md` | Personal operator rules (gitignored) | living |
| `AGENTS.md` | Pointer to CLAUDE.md for cross-tool compatibility (Cursor, Codex CLI) | pointer |
| `README.md` | Public repo readme | living |
| `CHANGELOG.md` | Release changelog | living |
| `CONTRIBUTING.md` | Contributor guide | living |
| `CODE_OF_CONDUCT.md` | Contributor Covenant | living |
| `SECURITY.md` | Security disclosure policy | living |
| `CONTEXT.md` | Project glossary -- shared language between code and people | living |
| `DEVELOPMENT.md` | Local dev notes | needs-verification |
| `SPRINTS.md` | Tech debt sprint plan | needs-verification |
| `TECH_DEBT_AUDIT.md` | Top10Page.tsx refactor architecture review | snapshot |
| `AGN-217-VITO-ARCH-REVIEW.md` | Typed-error envelope review on mutating routes | worklog |
| `AGN-703-SUMMARY.md` | Mobile overflow audit summary | worklog |
| `AGN-703-mobile-overflow-audit.md` | Mobile overflow audit (390px) | worklog |
| `AGN-761-BLOCKER.md` | Visual proof blocker (2026-05-04) | worklog |
| `AGN-790-SEO-AUDIT.md` | SEO-001 inside-out audit | worklog |
| `AGN-791-WORKLOG.md` | SEO-002 why-narrative engine | worklog |
| `AGN-792-BLOCKER.md` | AISO API rate limit blocker | worklog |
| `AGN-792-WORKLOG.md` | SEO-003 AISO scan + lowest-dimension fix | worklog |
| `AGN-795-COVERAGE-REPORT.md` | Coverage report | worklog |
| `AGN-795-SITEMAP-AUDIT.md` | Sitemap freshness + completeness audit | worklog |
| `AGN-797-AISO-PATCHSET.md` | aiso.tools dogfood patchset | worklog |
| `AGN-797-WORKLOG.md` | SEO-009 pluggable AISO-fix protocol | worklog |
| `AGN-798-WORKLOG.md` | SEO-007 recurring monthly self-scan routine | worklog |
| `AGN-799-BLOCKER-NOTE.md` | AGN-799 push blocker (2026-05-05) | worklog |
| `AGN-833-WORKLOG.md` | AGN-833 heartbeat | worklog |
| `AGN-851-WORKLOG.md` | OBS-6 long-tasks profiler | worklog |
| `AGN-911-WORKLOG.md` | AGN-911 worklog | worklog |
| `AGN-912-WORKLOG.md` | AGN-912 worklog | worklog |
| `AGN-915-WORKLOG.md` | AGN-915 worklog | worklog |
| `AGN-924-WORKLOG.md` | AGN-924 worklog (2026-05-05) | worklog |
| `AGN-930-WORKLOG.md` | Font loading audit (preload + display:swap) | worklog |
| `AGN-1239-ROUTE-STATE-AUDIT.md` | Frontend route-state drift audit | worklog |
| `AGN-1263-WORKLOG.md` | SEO-007 monthly AISO self-scan regression watcher | worklog |

Recommendation: AGN-* worklogs at root are temporary. Sweep into
`docs/archive/worklogs/` after their tickets close (target: Phase 1.4).

---

## Living docs (kept current; safe to trust)

These have `status: living` frontmatter and were drift-audited 2026-05-05.
Count: 27 (per `node scripts/check-docs-freshness.mjs`).

| Path | Topic | Last verified |
|---|---|---|
| `docs/INDEX.md` | this file | 2026-05-05 |
| `docs/API.md` | Public API surface | 2026-05-05 |
| `docs/ARCHITECTURE.md` | Redis 3-tier read order, namespaces, compute lanes, error categories | 2026-05-05 |
| `docs/DEPLOY.md` | Vercel + Railway deploy paths, env wiring, Node 22.x | 2026-05-05 |
| `docs/ENGINE.md` | 85 workflows + 16 cron routes + 52 worker fetchers + ~85 env vars | 2026-05-05 |
| `docs/INGESTION.md` | Scraper cadence, dual-write helper, Redis-as-truth | 2026-05-05 |
| `docs/OPERATOR.md` | Operator situational awareness (single source of truth) | 2026-05-05 |
| `docs/RUNBOOK-internal-agent-token-rotation.md` | Internal agent token rotation | 2026-05-05 |
| `docs/SITE-WIREMAP.md` | Every route -> data -> collector -> external API | 2026-05-05 |
| `docs/SOURCE_DISCOVERY.md` | Query families and discovery slices for new sources | 2026-05-05 |
| `docs/TWITTER_SIGNAL_LAYER.md` | Apify provider, 4-query bundle, ingest auth, leaderboards | 2026-05-05 |
| `docs/perf/AGN-852-heap-snapshot-drill-2026-05-04.md` | Heap snapshot drill (AGN-852) | 2026-05-05 |
| `docs/protocols/mcp.md` | MCP integration protocol | 2026-05-05 |
| `docs/protocols/portal.md` | Portal protocol | 2026-05-05 |
| `docs/protocols/skills.md` | Skills protocol | 2026-05-05 |
| `docs/runbook-aiso-operator-checklist.md` | AISO operator checklist | 2026-05-05 |
| `docs/runbook-heap-leak.md` | Heap leak (AGN-852 / OBS-7) | 2026-05-05 |
| `docs/runbook-redis-oom.md` | Redis OOM / writes failing | 2026-05-05 |
| `docs/runbook-scrape-trending-stuck.md` | scrape-trending stuck | 2026-05-05 |
| `docs/runbook-stripe-secret-rotation.md` | Stripe webhook secret rotation | 2026-05-05 |
| `docs/runbooks/apify-down.md` | Twitter signal stop -- Apify provider down | 2026-05-05 |
| `docs/runbooks/github-pool-exhausted.md` | Token pool exhausted recovery (canonical) | 2026-05-05 |
| `docs/runbooks/redis-full.md` | Redis full / write failure | 2026-05-05 |
| `docs/runbooks/rollback.md` | General rollback procedure | 2026-05-05 |
| `docs/runbooks/vercel-deploy-failing.md` | Vercel deploy failing | 2026-05-05 |
| `docs/security/encryption-at-rest.md` | Encryption at rest | 2026-05-05 |
| `docs/security/x-forwarded-for-trust-contract.md` | X-Forwarded-For trust contract | 2026-05-05 |

---

## Snapshot docs (dated; reference only)

These were accurate at audit-date but may have drifted. Do not cite as current
state. Rewrites tracked under `tasks/BACKLOG.md` "Phase 1 Follow-Up Rewrites".
Count: 11 with `status: snapshot` frontmatter (per freshness check). The
ENGINE/DATABASE/SCORING entries called out in the original 2026-05-02 audit
have since been split: ENGINE rewritten to living (2026-05-05); DATABASE +
SCORING remain snapshot pending Phase 1.5 follow-up rewrite.

| Path | Topic | Audit date | Reason / known drift |
|---|---|---|---|
| `docs/DATABASE.md` | Database schema and Redis namespaces | 2026-05-05 | Predates Redis-as-primary + Supabase data-lake (ADR 0001) |
| `docs/SCORING.md` | Scoring algorithms and weights | 2026-05-05 | Describes deprecated v1/v2; current is 8-source v3 + Kimi K2.6 (PR #52) |
| `docs/RUNBOOK.md` | Catch-all operator runbook (legacy) | 2026-05-05 | Largely superseded by `docs/OPERATOR.md` + `docs/runbooks/` |
| `docs/RUNBOOK-secret-rotation.md` | Quarterly secret rotation runbook | 2026-05-05 | References non-existent `src/lib/cron-auth.ts`; ProductHunt cron drift |
| `docs/runbook-github-pool-exhausted.md` | Duplicate of canonical | 2026-05-05 | Duplicate of `docs/runbooks/github-pool-exhausted.md`; canonicalize |
| `docs/protocols/DEPLOY_RUNBOOK.md` | Deploy runbook protocol | 2026-05-05 | Hardcoded "215/215 pass" likely stale; paths still valid |
| `docs/protocols/PAPERCLIP-AGENT-ONBOARDING-CHECKLIST.md` | Paperclip agent onboarding | 2026-05-05 | Step 2 omits `docs/INDEX.md` + `docs/OPERATOR.md` from session-open list |
| `docs/perf/2026-05-04-bundle-report.md` | Bundle report 2026-05-04 | 2026-05-04 | -- |
| `docs/perf/AGN-150-api-route-profile-2026-05-04.md` | API route profile (AGN-150) | 2026-05-04 | -- |
| `docs/perf/AGN-191-api-route-investigation-2026-05-04.md` | API route investigation (AGN-191) | 2026-05-04 | -- |
| `docs/perf/agn-926-proof-2026-05-05.md` | AGN-926 proof | 2026-05-05 | -- |

### Other dated reference docs (unlabeled / needs-verification)

These docs predate the Phase 1 frontmatter sweep. Treat as snapshot-equivalent
until labeled. Phase 1.5 will classify or rewrite.

| Path | Topic | Reason / known drift |
|---|---|---|
| `docs/REPO-OVERVIEW.md` | One-page repo overview | Pre-restructure; verify before citing |
| `docs/STORYBOOK_COMPONENT_LIBRARY.md` | Storybook setup and components | -- |
| `docs/DESIGN_SYSTEM_V3.md` | Design system V3 reference | Superseded by `design/v4/DESIGN_SYSTEM.md` (living) |
| `docs/BUNDLE.md` | Bundle size baseline + heavy modules | -- |
| `docs/CORS-POLICY.md` | CORS policy | -- |
| `docs/KEY-ROTATION.md` | Production secret rotation runbook | Cross-reference with `docs/RUNBOOK-secret-rotation.md` |
| `docs/slo.md` | SLO + error budget policy | -- |
| `docs/regression-map.md` | Regression map | -- |
| `docs/seo-route-class-policy.md` | Per-route-class SEO policy (AGN-915) | -- |
| `docs/sergio-pluggable-protocol.md` | AISO-fix protocol (AGN-797) | -- |
| `docs/aiso-free-scan-contract.md` | AISO free scanner contract | Body says "Verified 2026-05-05"; missing frontmatter |
| `docs/openapi.yaml` | OpenAPI spec (canonical) | Frontmatter set 2026-05-05 |
| `docs/openapi.json` | OpenAPI spec (regenerated artifact) | Build output |

---

## Pointer / redirect docs (status: pointer)

These files exist only to redirect inbound links to the canonical doc. Do not
add content here -- update the target instead.

| Path | Redirects to |
|---|---|
| `docs/DESIGN_SYSTEM.md` | `design/v4/DESIGN_SYSTEM.md` |
| `docs/RUNBOOK.md` | `docs/OPERATOR.md` |
| `docs/runbook-github-pool-exhausted.md` | `docs/runbooks/github-pool-exhausted.md` |

---

## Generated docs (do not hand-edit)

These are produced by `scripts/derive-engine-inventory.mjs` and
`scripts/check-internal-doc-links.mjs`. Refresh via `npm run engine:derive`
(or the weekly `engine-inventory-refresh.yml` workflow) -- do not edit by hand.

| Path | Producer | Refresh command |
|---|---|---|
| `docs/_generated/engine.json` | `scripts/derive-engine-inventory.mjs` | `npm run engine:derive` |
| `docs/_generated/engine.md` | `scripts/derive-engine-inventory.mjs` | `npm run engine:derive` |
| `docs/_generated/broken-links.md` | `scripts/check-internal-doc-links.mjs` | `node scripts/check-internal-doc-links.mjs` |

---

## Audit + readiness snapshots

Time-boxed audit reports. Treat as historical unless explicitly current.

| Path | Topic | Date |
|---|---|---|
| `docs/AUDIT_COMPLETE.md` | Tech-debt audit final closure | snapshot |
| `docs/audit-bundle-2026-05-02.md` | Bundle audit | 2026-05-02 |
| `docs/audit-a11y-2026-05-02.md` | Accessibility audit | 2026-05-02 |
| `docs/ultra-audit-2026-05-02.md` | Ultra audit | 2026-05-02 |
| `docs/ui-gap-audit.md` | UI gap audit | 2026-04-28 |
| `docs/SENTRY-READINESS-CHECKLIST-2026-05-04.md` | Sentry readiness + DSN exposure (AGN-269) | 2026-05-04 |
| `docs/API_SNAPSHOT_2026-04-27.md` | API snapshot | 2026-04-27 |
| `docs/SESSION_HANDOFF.md` | Session handoff | 2026-04-27 |
| `docs/NEXT_SESSION.md` | Next-session handoff | 2026-04-20 |
| `docs/release-validation-agn-98-2026-05-04.md` | Release validation AGN-98 | 2026-05-04 |

---

## Architecture Decision Records (`docs/decisions/`)

| Number | Title | Status |
|---|---|---|
| 0001 | Supabase append-only data lake | accepted |
| 0002 | Multi-tier cache architecture (CDN / KV / Redis / in-memory / browser) | accepted |
| 0003 | Cache tiers decision matrix (AGN-670) | accepted |
| README | ADR conventions + index | living |

---

## Path-scoped CLAUDE.md (load-on-demand context)

These files are picked up automatically by Claude when reading files in the
matching subtree. They are scoped operator notes, not human onboarding docs.

| Path | Scope |
|---|---|
| `src/app/api/cron/CLAUDE.md` | Cron route conventions |
| `src/lib/CLAUDE.md` | Data-store + token pool |
| `src/lib/redis/CLAUDE.md` | Redis keys + backends |
| `apps/trendingrepo-worker/CLAUDE.md` | Sister Railway worker service |
| `.github/workflows/CLAUDE.md` | GH Actions workflow conventions |

---

## Runbooks

Curated runbooks under `docs/runbooks/` are the canonical set. Loose
runbook-* files at `docs/` root predate the move and overlap; rationalize
under Phase 1.4.

### Canonical (`docs/runbooks/`)

| Path | Operation |
|---|---|
| `docs/runbooks/apify-down.md` | Twitter signal stop -- Apify provider down |
| `docs/runbooks/github-pool-exhausted.md` | Token pool exhausted recovery |
| `docs/runbooks/redis-full.md` | Redis full / write failure |
| `docs/runbooks/rollback.md` | General rollback procedure |
| `docs/runbooks/vercel-deploy-failing.md` | Vercel deploy failing |

### Loose runbooks at `docs/` root (sweep candidates)

| Path | Operation |
|---|---|
| `docs/runbook-aiso-operator-checklist.md` | AISO operator checklist |
| `docs/runbook-github-pool-exhausted.md` | Duplicate of canonical |
| `docs/runbook-heap-leak.md` | Heap leak (AGN-852 / OBS-7) |
| `docs/runbook-redis-oom.md` | Redis OOM / writes failing |
| `docs/runbook-scrape-trending-stuck.md` | scrape-trending stuck |
| `docs/RUNBOOK-secret-rotation.md` | Quarterly secret rotation |
| `docs/runbook-stripe-secret-rotation.md` | Stripe webhook secret rotation |
| `docs/RUNBOOK-internal-agent-token-rotation.md` | Internal agent token rotation |

---

## Protocols (`docs/protocols/`)

| Path | Protocol |
|---|---|
| `docs/protocols/DEPLOY_RUNBOOK.md` | Deploy runbook protocol |
| `docs/protocols/mcp.md` | MCP integration protocol |
| `docs/protocols/portal.md` | Portal protocol |
| `docs/protocols/skills.md` | Skills protocol |
| `docs/protocols/PAPERCLIP-AGENT-ONBOARDING-CHECKLIST.md` | Paperclip agent onboarding |

---

## Refactor plans (`docs/refactor-plans/`)

| Path | Subject |
|---|---|
| `docs/refactor-plans/agent-commerce-split.md` | Agent commerce split |
| `docs/refactor-plans/all-trending-tabs-split.md` | All-trending tabs split |
| `docs/refactor-plans/live-top-table-split.md` | Live top table split |
| `docs/refactor-plans/subreddit-mindshare-split.md` | Subreddit mindshare split |

---

## Performance reports (`docs/perf/`)

| Path | Subject |
|---|---|
| `docs/perf/2026-05-04-bundle-report.md` | Bundle report 2026-05-04 |
| `docs/perf/AGN-150-api-route-profile-2026-05-04.md` | API route profile (AGN-150) |
| `docs/perf/AGN-191-api-route-investigation-2026-05-04.md` | API route investigation (AGN-191) |
| `docs/perf/AGN-852-heap-snapshot-drill-2026-05-04.md` | Heap snapshot drill (AGN-852) |
| `docs/perf/agn-926-proof-2026-05-05.md` | AGN-926 proof |

---

## Security (`docs/security/`)

| Path | Subject |
|---|---|
| `docs/security/encryption-at-rest.md` | Encryption at rest |
| `docs/security/x-forwarded-for-trust-contract.md` | X-Forwarded-For trust contract |

---

## Legal (`docs/legal/`)

| Path | Subject |
|---|---|
| `docs/legal/terms.md` | Terms |

---

## Code review reports (`docs/review/`)

All entries stamped `status: archive` on 2026-05-05 -- review reports of past
code state, references may not resolve to current files. Treat as read-only
history.

| Path | Subject | Status |
|---|---|---|
| `docs/review/AGN-502-TEST-REVIEW.md` | AGN-502 test review | archive |
| `docs/review/AGN-503-TEST-REVIEW.md` | AGN-503 test review | archive |
| `docs/review/AGN-504-VITO-REVIEW.md` | AGN-504 Vito review | archive |
| `docs/review/AGN-507-TEST-REVIEW.md` | AGN-507 test review | archive |
| `docs/review/AGN-624-PR-DRAFT-CHECKLIST-2026-05-05.md` | AGN-624 PR draft checklist | archive |
| `docs/review/CODEX_REVIEW_LOG.md` | Codex review log | archive |
| `docs/review/CODEX_REVIEW_SYSTEM.md` | Codex review system | archive |
| `docs/review/HARDENING_90D.md` | 90-day hardening plan | archive |
| `docs/review/PATCH_PLAN.md` | Patch plan | archive |
| `docs/review/REVIEW_REPORT.md` | Review report | archive |

---

## Release validation (`docs/release-validation/`)

42 dated artifacts under `docs/release-validation/` (2026-05-04 wave +
follow-ups). Treat as worklogs bound to their AGN ticket. Naming convention
`YYYY-MM-DD-agn-NNN-<slug>.md`. Full enumeration omitted from this index;
list with:

```
ls docs/release-validation/
```

Highlights:

| Path | Subject |
|---|---|
| `docs/release-validation/2026-05-04-agn-151-redis-namespace-inventory-orphan-scan.md` | Redis namespace inventory + orphan scan |
| `docs/release-validation/2026-05-04-agn-163-qa-matrix-source-freshness-critical-paths.md` | QA matrix: source freshness on critical paths |
| `docs/release-validation/2026-05-04-agn-164-browser-smoke-failure-taxonomy-update.md` | Browser smoke failure taxonomy |
| `docs/release-validation/2026-05-04-agn-183-railway-redis-drift-check.md` | Railway Redis drift check |
| `docs/release-validation/2026-05-04-agn-193-read-only-redis-key-families.md` | Read-only Redis key families |

---

## Forensic (`docs/forensic/`)

Live forensic root. Bulk pre-2026-05 entries are archived (see Archive
section).

| Path | Subject |
|---|---|
| `docs/forensic/00-INDEX.md` | Forensic index (pointer to archive) |
| `docs/forensic/AGN-1490-CRON-OVERLAP-DUPLICATE-DRIFT-RECHECK-2026-05-05.md` | Cron overlap drift recheck |
| `docs/forensic/AGN-1524-SIDEBAR-ROUTE-VISIBILITY-PARITY-RECHECK-2026-05-05.md` | Sidebar route-visibility parity recheck |

---

## Tasks + sprint planning (`tasks/`)

| Path | Purpose |
|---|---|
| `tasks/CURRENT-SPRINT.md` | Sprint 1: Pool verification + source activation (in-progress) |
| `tasks/BACKLOG.md` | Items deferred from current sprint |
| `tasks/HANDOFF.md` | Session handoff log (auto-appended on Stop) |
| `tasks/data-api.md` | Data terminal API plan + provisioning roadmap |
| `tasks/lessons.md` | Lessons learned |
| `tasks/sprint-6-vultr-migration-plan.md` | Sprint 6 -- Vultr migration plan |
| `tasks/sprint-7-auth-profiles-plan.md` | Sprint 7 -- auth + profiles plan |
| `tasks/workflow-strip-rollout.md` | Workflow strip rollout plan |
| `tasks/brand-cutover-followups.md` | Brand cutover followups |
| `tasks/agent-commerce/STATUS.md` | Agent commerce status |
| `tasks/agent-commerce/phase-a1-aiso-spec.md` | A1 AISO spec |
| `tasks/agent-commerce/phase-a2-ticker-status.md` | A2 ticker status |
| `tasks/agent-commerce/phase-a3-solana-spec.md` | A3 Solana spec |
| `tasks/agent-commerce/phase-e-design-audit.md` | Phase E design audit |
| `tasks/AUDIT_TRENDINGREPO_2026-04-28.md` | Audit (2026-04-28) | 
| `tasks/MAIN_TEST_FAILURES_2026-04-28.md` | Main test failures (2026-04-28) |
| `tasks/PR7_SUPABASE_CI_FAILURE_2026-04-28.md` | PR7 Supabase CI failure |
| `tasks/RATE_LIMIT_HARDENING_FOLLOWUP_2026-04-28.md` | Rate-limit hardening followup |
| `tasks/SESSION-SUMMARY-2026-04-26.md` | Session summary 2026-04-26 |
| `tasks/SETTINGS_CUT_LIST_2026-04-28.md` | Settings cut list |
| `tasks/WORKTREE_DISPOSITION_2026-04-28.md` | Worktree disposition |
| `tasks/WORKTREE_HOLD_FOR_REVIEW_DISPOSITIONS_2026-04-28.md` | Worktree hold-for-review dispositions |

---

## Project-local skills (`.claude/skills/project/`)

| Skill | Purpose |
|---|---|
| `audit-repair` | Walk and repair audit-table items |
| `deploy-checklist` | Pre-deploy checklist (git push / ship / release) |
| `forensic-prune` | Prune stale forensic artifacts |
| `new-cron-route` | Add a new cron route |
| `redis-key-design` | Redis key design and schema migration |

Project-local subagents under `.claude/agents/project/`:
`audit-repairer.md`, `cron-route-builder.md`, `redis-schema-reviewer.md`.

---

## Other code-tree READMEs and docs

| Path | Subject |
|---|---|
| `apps/trendingrepo-worker/README.md` | Sister Railway worker readme |
| `apps/trendingrepo-worker/docs/outreach-vercel-labs.md` | Outreach Vercel Labs |
| `apps/trendingrepo-worker/src/fetchers/_template/README.md` | Fetcher template |
| `cli/README.md` | CLI readme |
| `mcp/README.md` | MCP server readme |
| `src/portal/schema/README.md` | Portal schema readme |
| `data/briefs/D4Vinci-Scrapling.md` | Generated repo brief |
| `data/briefs/TauricResearch-TradingAgents.md` | Generated repo brief |
| `data/briefs/vercel-next.js.md` | Generated repo brief |
| `data/collections/NOTICE.md` | Collections notice |
| `data/collections/README.md` | Collections readme |
| `design/v4/COMPONENT_INVENTORY.md` | V4 component inventory |
| `design/v4/DESIGN_SYSTEM.md` | V4 design system |
| `design/v4/MIGRATION_PLAN.md` | V4 migration plan |
| `skills/investigate-maintainer/SKILL.md` | Investigate-maintainer skill |
| `skills/screen-trending-repos/SKILL.md` | Screen-trending-repos skill |
| `skills/weekly-report/SKILL.md` | Weekly-report skill |
| `.github/PULL_REQUEST_TEMPLATE.md` | PR template |
| `docs/00-INDEX.md` | Legacy 11-line stub; superseded by this INDEX |

---

## Archive (DO NOT use to understand current code)

A summary, not an exhaustive list. Read-only history.

| Path | Count | Note |
|---|---|---|
| `docs/archive/forensic-2026-05-pre/` | 379 | Pre-restructure forensic reports (auto-archived) |
| `docs/archive/forensic-2026-05-03/` | 5 | 2026-05-03 forensic snapshot |
| `docs/archive/AUDIT-2026-05-04.md` | 1 | Source pipeline audit (drives the audit table below) |
| `docs/archive/AUDIT_HANDOFF.md` | 1 | Audit handoff |
| `docs/archive/audit-api-zod-typed-errors-AGN-88.md` | 1 | API Zod typed-errors audit |
| `docs/archive/audit-misleading-indicators-2026-05-02.md` | 1 | Misleading indicators audit |
| `docs/archive/drift-report-2026-05-05.md` | 1 | Phase 1.0 drift report (this restructure) |
| `docs/archive/HANDOFF_2026-04-27_V3.md` | 1 | Handoff 2026-04-27 V3 |
| `docs/archive/OPENCLAW_TWITTER_AGENT_INSTRUCTIONS.md` | 1 | OpenClaw Twitter agent (legacy) |
| `docs/archive/rollout-plan-2026-05-02.md` | 1 | Rollout plan 2026-05-02 |
| `docs/archive/ultra-audit-2026-05-01.md` | 1 | Ultra audit 2026-05-01 |
| `docs/archive/V2_HANDOFF.md` | 1 | V2 handoff |

---

## Audit table

Source: `docs/archive/AUDIT-2026-05-04.md` (sidebar reality + critical-gaps
narrative). The audit is narrative, not a numbered finding table; the rows
below distill its critical gaps so they can be tracked here.

| ID | Finding | Status | Reference |
|---|---|---|---|
| A1 | Twitter persistence path inconsistent (bundled JSONL latest 2026-04-23 vs. workflow last success 2026-05-01) | open | `docs/archive/AUDIT-2026-05-04.md`, `tasks/CURRENT-SPRINT.md` |
| A2 | `Refresh dev.to signals` failing 3 runs + dual-writer ambiguity vs. Redis | open | `docs/archive/AUDIT-2026-05-04.md` |
| A3 | `trending-mcp` data-store stale 2026-04-29; side keys null | open | `docs/archive/AUDIT-2026-05-04.md` |
| A4 | `Cron - freshness check`, `Audit - source freshness`, `Source health watch`, `Refresh fast discovery`, `Refresh collection rankings` failing | open | `docs/archive/AUDIT-2026-05-04.md` |
| A5 | No unified per-repo mentions store across all sources | open | `docs/archive/AUDIT-2026-05-04.md` |
| P1.1 | Drift-audit candidate-living docs against current code | done | `docs/archive/drift-report-2026-05-05.md` |
| P1.2 | Build comprehensive `docs/INDEX.md` | done | this file |
| P1.3 | Sweep root AGN-* worklogs into `docs/archive/worklogs/` | open | `tasks/BACKLOG.md` |
| P1.4 | Rationalize loose `docs/runbook-*` files into `docs/runbooks/` | open | `tasks/BACKLOG.md` |
| P1.5 | Rewrite snapshot docs (`ENGINE.md`, `DATABASE.md`, `SCORING.md`) to living | partial | ENGINE rewritten 2026-05-05 (commit `e4737757`); DATABASE + SCORING still snapshot |

---

## Workflow inventory

Current ground truth at 2026-05-05: 85 `.github/workflows/*.yml` files (per
`docs/_generated/engine.json`, derived from filesystem), 16 cron API routes
under `src/app/api/cron/`, 52 worker fetchers in the sister Railway worker
(`apps/trendingrepo-worker/`), and ~85 env vars. Re-derive with
`npm run engine:derive`. See `docs/ENGINE.md` (now `status: living`) for the
human-readable narrative; `docs/_generated/engine.md` for the auto-derived
digest.
