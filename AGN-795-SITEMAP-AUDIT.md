# AGN-795 — Sitemap Freshness + Completeness Audit

Audit date: 2026-05-04  
Scope: `/sitemap.xml`, `/sitemap-pages.xml`, `/sitemap-repos.xml`, `/sitemap-news.xml`, `/sitemap-digest.xml`, and sitemap SEO regression tests.

## What I checked
- Read all sitemap route handlers and XML helper code.
- Compared static page coverage in `sitemap-pages.xml` against current `src/app/**/page.tsx` public static routes.
- Reviewed freshness semantics for `lastmod`, `revalidate`, and data-backed timestamps.
- Checked e2e sitemap/robots test assertions for coverage regressions.

## Findings

### 1) Completeness gap: `sitemap-pages.xml` omits multiple public routes
Evidence snapshot from route inventory:
- Public non-dynamic pages found: 60
- Static hubs included in sitemap-pages: 29
- Candidate public routes not listed in sitemap-pages: 29

Notable missing routes (high confidence):
- `/about`, `/privacy`, `/terms`
- `/agent-commerce`, `/agent-repos`
- `/mcp`, `/skills`, `/research`, `/mindshare`
- `/githubrepo`, `/predict`, `/npm`, `/ideas`

Likely intentional omissions still need explicit policy decision (index vs noindex):
- `/alerts`, `/alerts/new`, `/tools/*`, `/submit/revenue`, `/design-lab/primitives`, `/demo`

Impact:
- Discoverability depends on internal links only for omitted indexable pages.
- Coverage is currently hand-maintained and prone to drift when new routes are added.

### 2) Freshness signal quality is mixed
- `sitemap-repos.xml`: good freshness signal (`lastCommitAt || lastReleaseAt || createdAt`), hourly revalidate.
- `sitemap-news.xml`: good freshness guard (48h window), 30-min revalidate.
- `sitemap-digest.xml`: acceptable (today + dated snapshots), hourly revalidate.
- `sitemap-pages.xml`: weak freshness signal; all URLs use `lastmod = now` each build cycle.
- `sitemap.xml` (index): all child sitemap `lastmod` values are always `now`, not source-driven.

Impact:
- Crawlers receive noisy `lastmod` changes even when static pages did not change.
- Can waste crawl budget and reduce trust in `lastmod` as a useful hint.

### 3) Regression guardrail gap in tests (fixed in this heartbeat)
Before this heartbeat, `tests/e2e/sitemap-and-robots.spec.ts`:
- Still described sitemap index as "three buckets".
- Did not assert `sitemap-digest.xml` inclusion in `/sitemap.xml`.
- Had no direct test for `/sitemap-digest.xml` response shape.

## Change made in this heartbeat
Updated `tests/e2e/sitemap-and-robots.spec.ts` to:
- Assert sitemap index references all four buckets.
- Assert `sitemap-digest.xml` is present in index output.
- Add dedicated `/sitemap-digest.xml` status/body smoke test.

## Recommended next actions
1. Define an explicit sitemap inclusion policy by route class:
- `indexable`: must be in sitemap-pages.
- `noindex`: must be excluded from sitemap-pages and declare robots noindex in metadata.

2. Implement a generator-based page sitemap source:
- Build entries from route inventory + allow/deny policy map to reduce manual drift.

3. Improve freshness semantics for static hubs and sitemap index:
- Replace blanket `lastmod = now` with stable build/deploy timestamp or per-source file/data timestamp.
- Keep data-driven `lastmod` for repos/news/digest as-is.

4. Add a CI audit script:
- Fail when indexable public routes are missing from `sitemap-pages.xml`.
- Fail when sitemap index omits known child sitemap routes.
