# GEO Answer-Surfaces — playbook

**Goal:** make trendingrepo the page users land on — and the source AI engines
cite — for "AI tech / GitHub repo" queries. GEO (Generative Engine
Optimization) = structure content so generative engines (Google AI Overview,
Perplexity, ChatGPT, Claude) can crawl, understand, and **quote** it.

> A local Claude skill mirrors this doc at `.claude/skills/geo-answer-surfaces/`
> (skills are gitignored in this repo; this doc is the version-controlled
> source of truth). Adopted 2026-05-28.

## The one rule that governs everything: the citation contract must resolve to 200s

[src/app/llms.txt/route.ts](../src/app/llms.txt/route.ts) tells AI engines which
URL to cite for which question. Every URL it names — and every URL in the
sitemaps — MUST return **200**, not a redirect or 429. The single biggest GEO
failure in this repo's history was the v6 cutover 302'ing `/categories/*` to the
homepage and 308'ing `/mcp` into a crawler-429 wall (`/agent-commerce`) while
`llms.txt` still advertised them — every "cite us" instruction resolved to a
dead end. **Before claiming any GEO work done, follow the cited URLs and confirm
200** via `node scripts/geo-citation-probe.mjs`.

Per-surface ship order (never reorder — flipping causes live 404s):
1. Build the page (returns 200).
2. Add schema + OG + sitemap entry.
3. *Then* remove any `next.config.ts` redirect shadowing it.
4. *Then* point `llms.txt` at it.

## Reuse these primitives — do not rebuild

- [src/lib/seo.ts](../src/lib/seo.ts) — `SITE_URL`, `SITE_NAME`, `absoluteUrl()`,
  `safeJsonLd()` (XSS-safe `</script>` escaping), `OG_COLORS`, `OG_CACHE_HEADERS`.
- [src/lib/seo/structured-data.ts](../src/lib/seo/structured-data.ts) —
  `buildBreadcrumbJsonLd`, `buildItemListJsonLd`, `buildFaqJsonLd` (returns null
  when empty — honesty rule), `buildOrganizationJsonLd`.
- [src/components/seo/JsonLd.tsx](../src/components/seo/JsonLd.tsx) —
  `<JsonLd data={...} />` (renders nothing for null).
- [src/components/seo/SeoFaq.tsx](../src/components/seo/SeoFaq.tsx) — native
  `<details>` FAQ (zero JS, crawlable). Pass the SAME `FaqEntry[]` to
  `buildFaqJsonLd` so DOM text == schema text.
- [src/components/seo/RankedRepoList.tsx](../src/components/seo/RankedRepoList.tsx)
  — verdict-forward editorial `<ol>` for listicles.
- Repo schema reference: [src/lib/seo/repo-jsonld.ts](../src/lib/seo/repo-jsonld.ts).
- Data: `getDerivedRepos()` ([@/lib/derived-repos](../src/lib/derived-repos.ts),
  filter by `categoryId`), `getDerivedRepoByFullName`, `getConsensusItemReport`
  ([@/lib/consensus-verdicts](../src/lib/consensus-verdicts.ts) — the LLM verdict
  prose), `CATEGORIES` ([@/lib/constants](../src/lib/constants.ts)).
- Topic/pair registries: [src/lib/categories.ts](../src/lib/categories.ts),
  [src/lib/best-topics.ts](../src/lib/best-topics.ts),
  [src/lib/compare-pairs.ts](../src/lib/compare-pairs.ts).

## Page recipe (category / best-of / comparison / guide)

1. **Route**: `export const revalidate = 1800;` (ISR — reads the data-store,
   never Drizzle, so no `force-dynamic`). Add `generateStaticParams` for a known
   finite set.
2. **Data**: `await Promise.all([...refresh hooks].map(p=>p.catch(()=>{})))`
   then sync getters. Sort with a **deterministic `fullName` tiebreaker**
   (momentum scores tie constantly — see CLAUDE.md).
3. **Markup** ([DESIGN-SYSTEM.md](DESIGN-SYSTEM.md) is law — read before any
   visual change): `.route-shell` → `.crumbs` breadcrumb → `.hero`
   (`.hero-eyebrow` + `<h1>` + `<p>` intro + `.hero-meta` with a
   `<time datetime>`) → body (reuse `TrendingTable` or `RankedRepoList`) →
   `<SeoFaq>` → internal-link nav. Icons via `<Icon name=... />`. No inline hex,
   no new CSS files.
4. **Schema**: `<JsonLd>` for BreadcrumbList + ItemList + FAQPage.
5. **Metadata**: `generateMetadata` with a CTR-shaped title (lead with the value
   term: "Best X", "X vs Y"), clamped ≤155-char description,
   `alternates.canonical`. OG via colocated `opengraph-image.tsx` — **except
   under a catch-all `[...slug]` route**, where a file-convention OG is
   forbidden; use an `/api/og/...` route and set `openGraph.images` explicitly.
6. **Sitemap**: add to [sitemap-pages.xml](../src/app/sitemap-pages.xml/route.ts)
   or a dedicated `sitemap-*.xml` wired into the index.
7. **llms.txt**: add the surface + 1-3 "Sample queries we answer" lines.

## Thin-content gate (Google spam-update defense) — non-negotiable

Every programmatic page must carry differentiated value: cross-source mention
data + LLM consensus verdicts + real citations.
- A "list of repos with stars" is thin — **do not ship it**.
- Differentiate formats: `/categories/[slug]` = dense monitoring leaderboard;
  `/best/[topic]` = curated editorial top-N with a "why it ranks" blurb;
  `/compare/a/vs/b` = side-by-side metrics + verdicts. `/best` topics should be
  cross-cuts (e.g. "AI coding assistants") that no single category mirrors.
- Comparison pages: gate generation. The page 200s only when both repos exist;
  the **sitemap advertises only curated in-category pairs where both repos have
  a verdict** (`selectComparablePairs`). Never sitemap the combinatorial universe.
- Honesty rule: emit `Article`/analysis schema only when real evidence-based
  prose exists. Deterministic descriptive copy is fine as page text but must not
  be dressed as attributed analysis.

## Verification (Done = ranked-ready AND verified)

```bash
npm run typecheck && npm run dev          # :3023
node scripts/geo-citation-probe.mjs        # every cited URL must be 200
# Per route — expect 200 + h1 + schema + a <time>:
curl -s localhost:3023/<route> | grep -oE '"@type":"(BreadcrumbList|ItemList|FAQPage)"' | sort -u
# SSR HTML duplicates strings via the RSC flight payload; count @type with
# grep -o, not grep -c (which counts lines).
curl -sI localhost:3023/categories/mcp     # 200, not 308
# Schema validity: paste a rendered ld+json into Google Rich Results Test.
# Screenshot the page (Playwright) for visual proof it renders in-system.
```

## Citation KPI (the real success metric)

Rank is a proxy. The KPI is: **does a generative engine cite trendingrepo.com
for the target question?** `scripts/geo-citation-probe.mjs` checks the contract
(URLs 200) today; extend it to query Perplexity/Google AI per question and record
whether `trendingrepo.com` appears in the cited sources (key-gated, left as a
TODO so the script stays CI-safe).

## Surfaces shipped (2026-05-28)

- `/categories` + `/categories/[slug]` (15) — category leaderboards.
- `/best` + `/best/[topic]` (12) — verdict-forward listicles.
- `/compare/[a]/vs/[b]` — head-to-head comparisons (+ `sitemap-compare.xml`).
- Sitewide Organization JSON-LD (root layout).
- `/mcp` repointed off the crawler-429 wall to `/categories/mcp`; `llms.txt`
  citation contract repaired (12/12 URLs 200).

## Backlog (next GEO waves)

- **B — editorial-writer worker**: extend the consensus-analyst LLM
  ([apps/trendingrepo-worker](../apps/trendingrepo-worker)) to draft per-category
  / per-listicle / per-comparison prose (slugs `editorial-categories`,
  `editorial-best`, `editorial-compare`), read via a `refreshEditorialFromStore`
  hook to enrich the deterministic copy. Cache-safe (`mergeAndCap`); deploy to
  TOOLBOX is a gated prod step.
- **C — MDX blog** at `/blog` for weekly trend reports + evergreen deep-dives
  (NewsArticle schema; finally populates `sitemap-news.xml`).
- **D — broader hygiene**: prune redirecting hubs from `sitemap-pages.xml`
  (`/skills`, `/consensus`, `/breakouts`, `/githubrepo`, …); repoint or rebuild
  the remaining dead llms.txt links; CTR title pass on `/repo/[...]`.
