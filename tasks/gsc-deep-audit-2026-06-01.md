# GSC deep audit — 2026-06-01

Second-pass audit after the morning's baseline + first-wave fixes. Found a much bigger structural problem: **~2,000+ pages on the site canonicalise to the homepage** because the layout's default `alternates: { canonical: "/" }` was never overridden on `/repo/*` and 13 static pages. That single misconfiguration is the root cause of the bulk of the "Discovered, not indexed" / "Unknown to Google" verdicts.

## TL;DR — the root cause

The root layout sets `alternates: { canonical: "/" }` for every page that doesn't override it. Almost every page type DOES override (categories/best/collections/glossary/blog/alternatives/compare all set self-canonicals). The exceptions:

1. **`/repo/[owner]/[name]/page.tsx`** — no override. Every one of the 2,064 repo pages told Google the homepage is its canonical version. Google de-duplicated and refused to index them as standalone.
2. **`/funding`, `/breakout`, `/revenue`, `/ideas`, `/drop`, `/about`, `/contact`, `/methodology`, `/market-signals`** — same.
3. **`/tools`, `/tools/compare`, `/tools/watchlist`, `/tools/treemap`, `/tools/digest`, `/tools/revenue-estimate`, `/tools/star-history`, `/tools/top-10`** — same.

That's ~2,077 URLs all pointing canonical → `https://trendingrepo.com`. **All fixed in this wave.**

## What we measured

Wide URL inspection on 364 URLs (all 114 from sitemap-pages.xml + 250 stride-sampled from sitemap-repos.xml's 2,064):

| Bucket | Count | Share |
|---|---:|---:|
| Unknown to Google | 171 | 47.0% |
| Indexed | **135** | **37.1%** |
| Discovered, not indexed | 35 | 9.6% |
| Excluded by 'noindex' tag | 18 | 4.9% |
| Crawled, not indexed | 4 | 1.1% |
| Other | 1 | 0.3% |

By path prefix:

| Cluster | Indexed | Notes |
|---|---:|---|
| `/glossary/*` | 33/33 (100%) | Perfect — unique definitional content |
| `/collections/*` | 23/29 (79%) | 3 stale-noindex (rag-frameworks, ai-observability, model-compression) |
| `/categories/*` | 11/16 (69%) | ai-agents + mcp + ai-ml + rust-ecosystem + crypto-web3 missing |
| `/tools/*` | 4/9 (44%) | All missing canonical until this wave |
| `/blog/*` | 1/3 (33%) | Both posts not crawled |
| **`/repo/*`** | **56/250 (22%)** | **Extrapolated: ~1,610 of 2,064 unindexed** |
| **`/best/*`** | **1/13 (8%)** | **Only `/best/self-hosted-ai` indexed (irony — the others are bigger queries)** |
| `/ideas`, `/drop`, `/about`, `/contact`, `/methodology` | 0/5 | All missing canonical |
| `/(home)`, `/breakout`, `/funding`, `/revenue`, `/market-signals`, `/pricing` | 6/6 | Indexed despite broken canonical — likely grandfathered |

## Live sitemap inventory

| Sitemap | Live URLs | GSC submitted | Registered in GSC? |
|---|---:|---:|---|
| `/sitemap.xml` (index) | 6 children | 1,383 | yes (top of tree) |
| `/sitemap-pages.xml` | 114 | 114 | yes |
| `/sitemap-repos.xml` | **2,064** | **826** | yes — but GSC has only fetched 40% |
| `/sitemap-compare.xml` | **102** | **0** | **NOT REGISTERED** |
| `/sitemap-alternatives.xml` | **481** | **0** | **NOT REGISTERED** |
| `/sitemap-news.xml` | 0 (urlset empty) | 0 | yes — 1 error, needs the migrated route to deploy |
| `/sitemap-digest.xml` | 2 | 2 | yes |
| **TOTAL LIVE** | **2,763** | — | — |
| **HIDDEN FROM GSC** | — | **583 URLs** | `/sitemap-compare.xml` + `/sitemap-alternatives.xml` |

## What we found about MCP

Live indexing of MCP surfaces:
- `/categories/mcp` — **Crawled, not indexed** (Google saw it, decided no)
- `/best/mcp-servers` — **Discovered, never crawled**
- `/collections/mcp-servers` — indexed ✅
- `/glossary/mcp` — indexed ✅
- `/blog/what-is-mcp-model-context-protocol` — **Discovered, never crawled**

28-day MCP query analytics — every MCP query is a specific repo name (`codedb mcp`, `chrisryugj/korean-law-mcp`, `js-reverse-mcp`, `notebooklm-mcp-cli`, etc.). **Zero** generic queries like "best mcp servers", "what is mcp", "mcp servers list", "model context protocol" register impressions. The high-value MCP traffic isn't reaching us because the high-value surfaces aren't indexed.

GEO citation contract: **18/18 canonical answer URLs return 200**. Contract intact. (Perplexity citation check key-gated; not run.)

## Fixes shipped in this wave

### Canonical bug (the big one)

- [src/app/repo/[owner]/[name]/page.tsx](../src/app/repo/[owner]/[name]/page.tsx) — `alternates: { canonical: \`/repo/${owner}/${name}\` }` added in `generateMetadata`. Affects all 2,064 repo pages. Once deployed and Google re-crawls, this single change should move ~1,600 repo pages from "Unknown to Google / Excluded by noindex" toward "Indexed" over 4-6 weeks.
- 14 static pages — each got `alternates: { canonical: "/<route>" }` in their `metadata` exports:
  - [/funding](../src/app/funding/page.tsx), [/breakout](../src/app/breakout/page.tsx), [/revenue](../src/app/revenue/page.tsx)
  - [/ideas](../src/app/ideas/page.tsx), [/drop](../src/app/drop/page.tsx), [/about](../src/app/about/page.tsx)
  - [/contact](../src/app/contact/page.tsx), [/methodology](../src/app/methodology/page.tsx), [/market-signals](../src/app/market-signals/page.tsx)
  - [/tools](../src/app/tools/page.tsx), [/tools/compare](../src/app/tools/compare/page.tsx), [/tools/watchlist](../src/app/tools/watchlist/page.tsx)
  - [/tools/treemap](../src/app/tools/treemap/page.tsx), [/tools/star-history](../src/app/tools/star-history/page.tsx), [/tools/top-10](../src/app/tools/top-10/page.tsx)
  - [/tools/digest](../src/app/tools/digest/page.tsx), [/tools/revenue-estimate](../src/app/tools/revenue-estimate/page.tsx)

### "Excluded by noindex" verdicts on the 13 sampled URLs are stale

Verified by curling each — all return HTTP 200 with `<meta name="robots" content="index, follow">` and proper canonical (after this wave). Google cached an old state. Expected to clear after re-crawl + indexing-request submissions below.

Affected URLs: `/collections/rag-frameworks`, `/collections/ai-observability`, `/collections/model-compression`, `/methodology`, `/tools/treemap`, plus 8 individual repo pages.

## Operator tasks (UI only — I can't click for you)

### 1. Register the 2 hidden sitemaps in GSC

Open Search Console → property `sc-domain:trendingrepo.com` → Sitemaps → **Add a new sitemap**. Submit:

- `sitemap-compare.xml` (102 URLs of `/compare/<a>/vs/<b>`)
- `sitemap-alternatives.xml` (481 URLs of `/alternatives/<owner>/<repo>`)

That unblocks 583 URLs Google has literally never seen.

### 2. Un-register the 2 broken entries

Same panel — trash-icon these:

- `https://trendingrepo.com/.well-known/security.txt` (mis-registered as sitemap)
- `https://trendingrepo.com/sitemap-news.xml` (will return for re-registration after the migrated route deploys — for now it produces 1 error every refetch)

### 3. Request Indexing — 4-day prioritised submission queue

GSC URL Inspection → paste URL → Request Indexing. ~12-15/day soft quota per property.

**Day 1 — `/best/*` cluster (the 12 highest-value answer-surfaces):**

```
https://trendingrepo.com/best/ai-agents
https://trendingrepo.com/best/mcp-servers
https://trendingrepo.com/best/local-llm-tools
https://trendingrepo.com/best/vector-databases
https://trendingrepo.com/best/ai-coding-assistants
https://trendingrepo.com/best/open-source-llms
https://trendingrepo.com/best/browser-automation-tools
https://trendingrepo.com/best/developer-tools
https://trendingrepo.com/best/security-tools
https://trendingrepo.com/best/web-frameworks
https://trendingrepo.com/best/rust-projects
https://trendingrepo.com/best/self-hosted-ai
```

**Day 2 — high-value `/categories/*` + the 2 unindexed blog posts:**

```
https://trendingrepo.com/categories/ai-agents
https://trendingrepo.com/categories/mcp
https://trendingrepo.com/categories/ai-ml
https://trendingrepo.com/categories/crypto-web3
https://trendingrepo.com/categories/rust-ecosystem
https://trendingrepo.com/blog/what-is-mcp-model-context-protocol
https://trendingrepo.com/blog/how-trendingrepo-ranks-trending-repos
https://trendingrepo.com/methodology
https://trendingrepo.com/about
https://trendingrepo.com/contact
https://trendingrepo.com/funding
https://trendingrepo.com/ideas
```

**Day 3 — the 3 stale-noindexed collections + tools + high-impression /repo pages:**

```
https://trendingrepo.com/collections/rag-frameworks
https://trendingrepo.com/collections/ai-observability
https://trendingrepo.com/collections/model-compression
https://trendingrepo.com/tools
https://trendingrepo.com/tools/compare
https://trendingrepo.com/tools/treemap
https://trendingrepo.com/tools/watchlist
https://trendingrepo.com/repo/chroma-core/chroma
https://trendingrepo.com/repo/ScrapeGraphAI/Scrapegraph-ai
https://trendingrepo.com/repo/LearningCircuit/local-deep-research
https://trendingrepo.com/repo/anthropics/claude-code
https://trendingrepo.com/repo/aaif-goose/goose
```

**Day 4 — top 12 `/repo/*` URLs by current Search Analytics impressions (zyrln is far ahead but already indexed, so skip):**

Get the current list with: `npm run gsc:report` — top 15 PAGES table. Skip any rows already verdict=PASS via URL Inspection. Submit the remaining top-12 indexed-but-margin-of-error candidates plus any new unindexed pages in the top 30.

### 4. Add `sitemap-alternatives.xml` + `sitemap-compare.xml` to robots.txt

Already partially listed in [src/app/robots.ts:98-104](../src/app/robots.ts#L98-L104) — `/sitemap-pages.xml`, `/sitemap-repos.xml`, `/sitemap-news.xml`, `/sitemap-digest.xml`. But `/sitemap-alternatives.xml` and `/sitemap-compare.xml` are missing from that list even though they're in the sitemap-index. Not blocking — Google still finds them via the index — but worth fixing for parity with the GSC registration above.

## Why the user's "5,000 vs 2,000" is roughly right

Adding it all up:

- **Live URLs in sitemaps**: 2,763 (2,064 repos + 481 alternatives + 102 compares + 114 pages + 2 digest + 0 news)
- **Indexed (extrapolating 37.1% from the sample)**: ~1,025
- **Plus**: orphan URLs from older deploys (Google's "Pages" report holds these for months/years)
- **Plus**: parameter-stamped duplicates (`?range=`, `?cat=`, `?period=`) — GSC counts these even when they're the same content
- **Plus**: the `tools/tier-list/<shortId>` user-generated dynamic surface that lives outside the sitemaps

That puts the GSC UI total in the 4k-5k zone with ~1.5-2k indexed. Matches what you saw.

## 4-week recovery projection

| When | What changes | Expected indexing % |
|---|---|---|
| Day 0 (today) | Canonical fix deployed; submit Day 1 URLs | 37% baseline |
| Day +3 | Day 1-3 URLs requested + GSC re-crawls deployed canonicals | 40-45% |
| Day +7 | Google ingests the canonical fix on /repo/*; first wave of re-evaluations | 50-55% |
| Day +14 | Major re-eval of /best/* + /categories/* (the editorial intros + Article schema + back-links from the morning wave land); /repo/* indexing climbs as Google processes the 2,064 newly self-canonical pages | 60-65% |
| Day +28 | Stable. Hidden sitemaps (alternatives + compare) indexing if registered. /repo/* approaching 70-80%. | 70-75% |

Re-baseline with `npm run gsc:audit` weekly. The cron in `.github/workflows/cron-gsc-audit.yml` does this on Mondays automatically.

## Internal linking gap — not yet fixed

The home page links to hub indexes (`/best`, `/categories`, `/collections`, `/blog`, `/glossary`) but NOT to any leaf surface (`/best/ai-agents`, `/categories/mcp`, etc.). Google has no internal-link signal flowing to the 12 best-of pages or the 15 category pages from the highest-PageRank page on the site.

Next wave: add a "Trending answer-surfaces" widget on home that links to the top 6-8 leaf pages by GSC impression volume. Pick the leaves dynamically from the latest `gsc-baseline-latest.json`. Saves manual curation.

## What didn't change

- Editorial content from the morning wave (27 hand-written intros, Article schema, /repo/* → /best/* + /categories/* back-links) is untouched. Those are still the right play for the "Discovered, not indexed" verdicts on `/best/*` and `/categories/*` — the canonical fix is necessary but not sufficient on its own.
- GEO citation probe contract still 18/18 ✅.
- All 27 hand-written intros still load via [src/lib/best-topics.ts](../src/lib/best-topics.ts) + [src/lib/categories.ts](../src/lib/categories.ts).
