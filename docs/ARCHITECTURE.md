---
status: living
last-verified: 2026-05-05
verified-by: claude (drift audit, 3 Explore agents — 27/27 claims verified against current code)
---

# ARCHITECTURE.md - STARSCREENER system overview

Last updated: 2026-05-04
Audience: new contributors onboarding to the live `trendingrepo.com` stack

This document explains how the system is wired today, where data is produced, how it is served, and where to make safe changes.

## 1) System shape in one screen

```text
External APIs
  GitHub, OSS Insight, Reddit, HN, Bluesky, DevTo, ProductHunt,
  Hugging Face, npm, arXiv, Apify, funding sources
        |
        v
Collectors + Schedulers
  A) GitHub Actions workflows (.github/workflows/*.yml)
  B) Railway worker (apps/trendingrepo-worker)
        |
        v
Data-store writes
  scripts/_data-store-write.mjs -> Redis (primary) + file mirror (transition)
        |
        v
Runtime reads (Next.js 15 on Vercel)
  src/lib/data-store.ts read path:
    Redis -> bundled data/*.json fallback -> in-memory last-known-good
        |
        v
UI + APIs
  src/app/** pages and route handlers via refreshXxxFromStore() patterns
```

## 2) Compute lanes and ownership

There are three active compute lanes:

1. Runtime lane (Vercel / Next.js App Router)
- Handles page renders and API requests.
- Must read through `src/lib/data-store.ts` or `refreshXxxFromStore()` wrappers.
- Key code: `src/app/**`, `src/lib/*`.

2. Cron lane (GitHub Actions)
- Runs scheduled collectors and snapshots.
- Writes payloads (and metadata) through data-store helpers.
- Key code: `.github/workflows/*.yml`, `scripts/*.mjs`, `scripts/*.ts`.

3. Worker lane (Railway service)
- Runs fetchers not ideal for Vercel runtime and some overlapping feeds.
- Shares Redis namespace with app runtime.
- Key code: `apps/trendingrepo-worker/src/**`.

## 3) Source of truth and fallback model

Primary truth is Redis, accessed through `src/lib/data-store.ts`.

Read order is intentionally resilient:
1. Redis value for key
2. bundled file fallback (`data/*.json` or `.data/*.jsonl` depending on source)
3. in-memory last-known-good cache

Operational implication: HTTP 200 from a page does not guarantee fresh data. ISR + fallback can hide source freshness failures.

## 4) Runtime data contract

For server pages and backend routes, the standard contract is:

1. `await refreshXxxFromStore()` at the top of request/render path.
2. Use synchronous getters after refresh to read in-memory data.

Examples:
- `src/app/page.tsx`
- `src/app/repo/[owner]/[name]/page.tsx`
- `src/lib/trending.ts` (`refreshTrendingFromStore`)

Do not introduce new direct `readFileSync` JSON reads in request paths.

## 5) Current high-fanout surfaces

A small number of joins fan out into many routes:

- `getDerivedRepos()` in `src/lib/derived-repos.ts`
- `buildCanonicalRepoProfile()` in `src/lib/api/repo-profile.ts`
- `getSkillsSignalData()` and `getMcpSignalData()` in `src/lib/ecosystem-leaderboards.ts`

If one upstream source breaks, these joins can degrade many pages at once.

## 6) GitHub token pool architecture

GitHub API usage in runtime should flow through pooled token logic:

- `src/lib/github-token-pool.ts`
- Admin visibility: `/admin/pool`, `/admin/pool-aggregate`

Goals:
- spread quota load
- quarantine invalid tokens
- surface exhaustion/low-quota states for operators

Do not add new runtime GitHub calls that bypass pool abstractions.

## 7) Error model expectations

Backend/platform paths should use typed engine errors:

- `src/lib/errors.ts`
- categories: `recoverable`, `quarantine`, `fatal`

Guidelines:
- avoid introducing raw `throw new Error(...)` in backend/platform paths
- do not swallow errors silently
- attach source/category metadata when reporting

## 8) Freshness and health signals

Primary local operator check:

- `npm run freshness:check`

What it tests:
- local health/freshness endpoints (expects localhost server reachability)
- per-source freshness state

Failure interpretation rule:
- localhost timeout/refused/500/401 is local runtime or auth-path failure
- source stale/dead rows with healthy localhost indicate product freshness failure

## 9) Directory guide for new contributors

- `src/app/` : Next.js routes, pages, and API handlers
- `src/lib/` : data adapters, refresh readers, joins, scoring, errors
- `scripts/` : collectors, snapshots, audits, freshness tooling
- `.github/workflows/` : scheduler + CI behavior
- `apps/trendingrepo-worker/` : Railway worker fetchers
- `docs/` : architecture/engine/wiremap/audit/forensics
- `tasks/` : sprint + backlog execution state

## 10) Safe-change checklist

Before merging data or platform changes:

1. Verify read path still goes through data-store/refresh wrappers.
2. Verify new GitHub calls do not bypass token pool.
3. Verify errors are typed/categorized for backend/platform code.
4. Run minimal validation for touched scope (at least freshness or targeted command).
5. Update docs if a workflow cadence, source owner, or key data path changed.

## 11) Related docs

- `docs/ENGINE.md` : engine-level service and workflow registry
- `docs/SITE-WIREMAP.md` : route-to-data mapping
- `docs/AUDIT-2026-05-04.md` : latest verified operational gaps
- `docs/forensic/00-INDEX.md` : forensic report index
- `CLAUDE.md` : mandatory operating protocol and guardrails
