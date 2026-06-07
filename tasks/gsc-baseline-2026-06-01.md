# GSC baseline — 2026-06-01

First programmatic snapshot of Google Search Console for `sc-domain:trendingrepo.com` since the property was verified. Captures the indexing-coverage gap behind the "trendingrepo is invisible for category queries" intuition and the surgical fixes that shipped in the same wave. Re-run via `npm run gsc:audit` (see "Repeat this audit" below).

## Executive summary

- **840 clicks / 72,936 impressions** over the last 28 days. CTR 1.15%, avg position 7.2.
- **Every top query is a long-tail repo name** — `zyrln`, `pipsi nte`, `trollinstallerdark`. Zero category / best-of queries surface. Google indexes the site as a repo mirror, not a discovery surface.
- **Indexing coverage is asymmetric** — `/glossary/*` 4/4 sampled, `/best/*` **0/4**, `/blog/*` **0/2**, `/categories/*` 3/5 (the two highest-value verticals `ai-agents` and `mcp` excluded).
- **Two GSC errors** carrying as cruft: `sitemap-news.xml` returned empty (the `fs.readFileSync` source) and `.well-known/security.txt` mis-registered as a sitemap.
- **Position drifting downward** (6.0 → 8.0 over 28 days) while impressions grow — Google shows the site more often but ranks it lower as more pages outrank ours on the same queries.

## Headline metrics (28d, 2026-05-04 → 2026-05-31)

| Metric | Value |
|---|---:|
| Clicks | 840 |
| Impressions | 72,936 |
| CTR | 1.15% |
| Average position | 7.2 |

### Search type split

| Type | Clicks | Impressions | CTR | Pos |
|---|---:|---:|---:|---:|
| web | 840 | 72,936 | 1.2% | 7.2 |
| image | 0 | 91 | 0.0% | 61.2 |
| news | 0 | 3 | 0.0% | 7.0 |
| video | 0 | 0 | — | — |
| discover | 0 | 0 | — | — |

### Device split

| Device | Clicks | Impressions | CTR |
|---|---:|---:|---:|
| Desktop | 535 | 65,963 | 0.8% |
| Mobile | 302 | 6,855 | 4.4% |
| Tablet | 3 | 118 | 2.5% |

Mobile CTR is 5.5× desktop CTR. Desktop SERP is losing to neighbouring results (likely GitHub's own canonical pages for the same repos).

### Top 10 countries

| Country | Clicks | Impressions | CTR |
|---|---:|---:|---:|
| Iran | 123 | 5,844 | 2.1% |
| USA | 109 | 29,011 | 0.4% |
| Vietnam | 50 | 1,397 | 3.6% |
| China | 48 | 1,901 | 2.5% |
| Japan | 40 | 3,467 | 1.2% |
| Indonesia | 33 | 996 | 3.3% |
| India | 30 | 1,618 | 1.9% |
| Korea | 27 | 1,977 | 1.4% |
| Sweden | 26 | 344 | 7.6% |
| France | 24 | 1,327 | 1.8% |

USA 0.4% CTR on 29k impressions is the worst-performing geography by far. Worth a snippet/title audit.

## Indexing coverage (URL inspection sample, 2026-06-01)

Sampled via the GSC URL Inspection API. `verdict=PASS` = indexed; `verdict=NEUTRAL` with coverage `Discovered/Crawled - currently not indexed` / `URL is unknown to Google` / `Excluded by 'noindex' tag` = not indexed.

| Surface cluster | Sampled | Indexed | Notes |
|---|---:|---:|---|
| `/glossary/*` | 4 | **4 ✅** | 100% — each /glossary/<term> has unique definitional prose |
| `/categories/*` | 5 | 3 | `ai-agents` + `mcp` excluded ("Discovered, not indexed") |
| `/collections/*` | 3 | 2 | `rag-frameworks` flagged "Excluded by noindex" — historical state, no tag in code |
| `/best/*` | 4 | **0 ❌** | `ai-agents`, `mcp-servers`, `local-llm-tools` discovered-not-indexed; `vector-databases` unknown to Google |
| `/blog/*` | 2 | **0 ❌** | Both posts never crawled, "Discovered, not indexed" |
| `/repo/<popular>/*` | 4 | **0 ❌** | `vercel/next.js`, `facebook/react`, `microsoft/typescript` unknown; `openai/codex` flagged noindex |

Indexed hubs: `/`, `/categories`, `/best`, `/compare`, `/collections`, `/glossary`, `/blog`, `/funding`, `/breakout` all ✅. Deep tail repos (e.g. `/repo/ajavadinezhad/zyrln`) are indexed and earn the bulk of current clicks.

## Registered sitemaps

| Sitemap | Errors | Warnings | Submitted | Notes |
|---|---:|---:|---:|---|
| `/sitemap.xml` (index) | 0 | 0 | 1,383 | OK |
| `/sitemap-pages.xml` | 0 | 9 | 114 | Warnings worth investigating |
| `/sitemap-repos.xml` | 0 | 0 | 826 | OK |
| `/sitemap-news.xml` | **1** | 0 | 0 | **Empty urlset — migrated off `fs.readFileSync` in this wave** |
| `/sitemap-digest.xml` | 0 | 0 | 2 | Tiny — likely intentional stub |
| `.well-known/security.txt` | **1** | 0 | — | **Mis-registered as sitemap — un-register in GSC UI** |

Sitemap-level `indexed: 0` reported on every entry is GSC API stale data; the real indexing status lives in URL inspection (above).

## Action items mapped to the plan

### Tier 1 — surgical (shipped in this wave)

- [x] **A.** Add explicit `robots: { index: true, follow: true }` defence on the four highest-value templates ([src/app/collections/[slug]/page.tsx](../src/app/collections/[slug]/page.tsx), [src/app/repo/[owner]/[name]/page.tsx](../src/app/repo/[owner]/[name]/page.tsx), [src/app/best/[topic]/page.tsx](../src/app/best/[topic]/page.tsx), [src/app/categories/[slug]/page.tsx](../src/app/categories/[slug]/page.tsx)) so any historical noindex Google cached can't survive.
- [x] **B.** Migrate `src/app/sitemap-news.xml/route.ts` off `fs.readFileSync(process.cwd(), …)` to `getDataStore().read(...)` so it sees the live Redis data the collectors actually write.
- [ ] **C.** GSC UI: un-register `https://trendingrepo.com/.well-known/security.txt` from the Sitemaps panel. UI step.
- [ ] **D.** GSC UI: paste these 12 URLs into URL Inspection → Request Indexing on day 1 (fits the daily soft quota):
  - `/best/ai-agents`
  - `/best/mcp-servers`
  - `/best/local-llm-tools`
  - `/best/vector-databases`
  - `/best/ai-coding-assistants`
  - `/best/open-source-llms`
  - `/best/browser-automation-tools`
  - `/categories/ai-agents`
  - `/categories/mcp`
  - `/blog/what-is-mcp-model-context-protocol`
  - `/blog/how-trendingrepo-ranks-trending-repos`
  - `/collections/rag-frameworks`

### Tier 2 — structural (shipped in this wave)

- [x] **E.** Beef up `/best/<topic>` + `/categories/<id>` editorial depth — hand-written 250-400 word intros per topic (12 best, 15 categories), Person byline (`Mirko Basil`) on `/best/*`, Organization byline (`TrendingRepo Editorial`) on `/categories/*`, `Article` JSON-LD wrapping the intro, `buildPersonJsonLd` + `buildArticleJsonLd` + `buildOrganizationAuthorJsonLd` helpers added to [src/lib/seo/structured-data.ts](../src/lib/seo/structured-data.ts).
- [x] **F.** Repo → category / best back-links — every `/repo/<owner>/<name>` now renders a chip-row under the hero pointing at `/categories/<id>` plus the `/best/<topic>` pages the repo qualifies for. `getMatchingBestTopics` helper added to [src/lib/best-topics.ts](../src/lib/best-topics.ts).
- [x] **G.** [CLAUDE.md](../CLAUDE.md) updated — Wave 1+2 surfaces are live on prod main, not on `bot/swarm-a6-producthunt-reader`.

### Tier 3 — durable infrastructure (shipped in this wave)

- [x] **H.** GSC audit scripts greenfield. `scripts/gsc-client.mjs` (auth + REST helpers), `scripts/gsc-baseline.mjs` (28d metrics), `scripts/gsc-indexing-audit.mjs` (URL inspection over sitemap-pages.xml), `scripts/gsc-sitemap-status.mjs`, `scripts/gsc-report.mjs` (offline pretty-printer of the latest JSON snapshots). npm targets: `gsc:baseline`, `gsc:indexing-audit`, `gsc:sitemap`, `gsc:audit`, `gsc:report`, `gsc:report:full`.
- [x] **I.** [.github/workflows/cron-gsc-audit.yml](../.github/workflows/cron-gsc-audit.yml) — Mondays 06:00 UTC. Commits `data/_geo/gsc-*.json` back to repo. Fails loud on indexing-coverage regressions of >5pp w/w. Dashboard UI deferred (no `/admin` route exists yet).
- [x] **J.** This document.

## Repeat this audit

Local (uses ADC):
```bash
# One-time setup (replaces SA setup below for local dev only):
gcloud auth application-default login \
  --scopes=https://www.googleapis.com/auth/webmasters.readonly,https://www.googleapis.com/auth/cloud-platform
gcloud auth application-default set-quota-project theta-yen-494902-d2

# Run the full audit:
npm run gsc:audit
# → writes data/_geo/gsc-baseline-<date>.json
#         data/_geo/gsc-indexing-<date>.json
#         data/_geo/gsc-sitemap-<date>.json
# Latest snapshots also land at data/_geo/gsc-*-latest.json

# View the latest baseline without re-pulling:
npm run gsc:report           # baseline only
npm run gsc:report:full      # baseline + indexing + sitemap status

# Optional flags:
node scripts/gsc-baseline.mjs --days 90       # wider window
node scripts/gsc-indexing-audit.mjs --include-repos 100  # sample 100 /repo/*
```

CI (uses service-account):
- `.github/workflows/cron-gsc-audit.yml` runs the same scripts every Monday and commits the JSON.
- Manual re-run: `gh workflow run cron-gsc-audit.yml` (optional `--field include_repos=100`).

## Operator one-time setup (service account)

For the cron + any non-Mirko machine that needs GSC access:

1. **GCP Console** → IAM & Admin → Service Accounts → **Create service account** → name `gsc-reader` → skip role assignment → **Done**.
2. Click the new SA → **Keys** → **Add key → Create new key → JSON** → save the downloaded JSON somewhere safe.
3. Note the SA email — format is `gsc-reader@<project-id>.iam.gserviceaccount.com`.
4. **Search Console** → click property `sc-domain:trendingrepo.com` → Settings → **Users and permissions** → **Add user** → paste the SA email → role **Restricted** (read-only is enough).
5. **GitHub** → repo Settings → Secrets and variables → Actions → **New repository secret** named `GSC_SERVICE_ACCOUNT_JSON` → paste the entire JSON file content (raw, no quoting).
6. Optionally pin the quota project as repo variable `GSC_QUOTA_PROJECT` (defaults to `theta-yen-494902-d2`).

Local dev fallback: `gcloud auth application-default login` covers the same surface without setting up an SA. The cron uses the SA so it doesn't depend on a human session.

## What to look for in the next snapshot (2026-06-08+)

- **`/best/*` indexed rate** climbs from 0/12 toward ≥6/12 — confirms the editorial intros + Article schema + back-links broke the "Discovered, not indexed" verdict.
- **`/categories/ai-agents` + `/categories/mcp`** flip to `verdict=PASS`. These were the two highest-value categories sitting in the unindexed bucket.
- **First impressions on category queries** appear in `gsc-baseline.queries` — even bottom-of-page-2 ranks are a step up from zero.
- **Sitemap errors drop to 0** once `/.well-known/security.txt` is unregistered and `sitemap-news.xml` either reports `>0 indexed` or gets deleted.
- **Indexing-coverage regression alert** doesn't fire — if it does, the cron will fail loud and surface in Actions.

## Risks / non-goals

- **Indexing latency is real.** Even after the wave lands clean, Google may take 2-6 weeks to re-evaluate. Don't expect day-2 results in the next snapshot.
- **Editorial intros need refinement.** The 27 hand-written drafts in [src/lib/best-topics.ts](../src/lib/best-topics.ts) and [src/lib/categories.ts](../src/lib/categories.ts) are starting points — Mirko should sharpen the 5-10 highest-value ones (`ai-agents`, `mcp-servers`, `local-llm-tools`, `vector-databases`, `ai-coding-assistants`, etc.) as a follow-up.
- **No Indexing API for these pages.** Google's Indexing API is restricted to `JobPosting` / `BroadcastEvent` schema. The per-URL "Request Indexing" button (item D) is the only programmatic-adjacent option, and it's UI-gated and rate-limited.
- **Service account scope.** Restricted read role on GSC is sufficient. If a future audit needs sitemap *submission*, the SA needs to be re-added with Full role.
