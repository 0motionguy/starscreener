---
status: snapshot
last-verified: 2026-05-05
ticket: AGN-803 (Wave 2 H12)
branch: bot/frontend/AGN-522
scope: read-only audit (no edits required this pass)
---

# Robots + Sitemap Audit (2026-05-05)

## TL;DR

- `robots.ts` is in good shape: 24 named AI crawlers, correct `Disallow` set
  (`/api/`, `/admin`, `/you`), all four sub-sitemaps + index advertised.
- `sitemap-pages.xml` already contains `/trends` (line 51) — the W5 caller's
  sitemap edit landed before this audit ran. No edit required.
- 30 static hubs covered. Roughly a dozen public hubs are NOT yet listed and
  are flagged below as forward-only follow-ups; none are P0.
- No clear bugs found in `robots.ts`. No edit needed.

## Files audited

- `src/app/robots.ts` (full read)
- `src/app/sitemap.xml/route.ts` (full read)
- `src/app/sitemap-pages.xml/route.ts` (full read)
- `src/app/sitemap-news.xml/route.ts` (header)
- `src/app/sitemap-repos.xml/route.ts` (header)
- `src/app/**/page.tsx` (route inventory only — no opens)

## robots.ts findings

OK.

- `Disallow` correctly enumerates `/api/`, `/api/internal/`, `/admin`, `/you`
  — both with and without trailing wildcard, which covers Bing's stricter
  matcher and Google's loose matcher.
- 24 named AI/GEO crawlers (GPTBot, ClaudeBot, Claude-Web, PerplexityBot,
  Google-Extended, Applebot-Extended, CCBot, Bytespider, anthropic-ai,
  Cohere-ai, meta-externalagent, OAI-SearchBot, ChatGPT-User,
  Perplexity-User, GoogleOther, Google-CloudVertexBot, bingbot, Applebot,
  DuckDuckBot, Amazonbot, Diffbot, YandexBot, FacebookBot,
  meta-externalfetcher) all share the same `Allow: /` + same disallow set.
  This is the documented signal that we welcome ingestion.
- All 5 sitemaps advertised: `sitemap.xml` (index), `sitemap-pages.xml`,
  `sitemap-repos.xml`, `sitemap-news.xml`, `sitemap-digest.xml`. `host`
  field set to canonical absolute URL.
- No bug or smell found. No edit applied.

Possible future tightening (NOT done this pass — out of W2 H12 scope):

- `/embed/*` could be `Disallow`-listed since the embed surfaces are
  meant to be iframed, not indexed standalone. Currently they are
  reachable to crawlers. Defer until product confirms intent.
- `/design-lab/*` and `/demo` are dev-facing. Same defer.

## sitemap.xml (index) findings

OK. References the four sub-sitemaps with `lastmod = now`. Force-static +
hourly revalidate, served via `xmlResponse` helper. No bug.

## sitemap-pages.xml findings

`/trends` PRESENT at line 51:

```ts
{ path: "/trends", priority: 0.85, changefreq: "hourly" },
```

Priority 0.85 + hourly cadence matches the sibling `/signals`,
`/twitter`, `/news` entries — schema-consistent. No edit applied.

### Static hubs currently in the sitemap (30)

`/`, `/top10`, `/breakouts`, `/funding`, `/consensus`, `/signals`,
`/trends`, `/twitter`, `/news`, `/papers`, `/arxiv/trending`,
`/huggingface/trending`, `/huggingface/datasets`, `/huggingface/spaces`,
`/revenue`, `/categories`, `/collections`, `/hackernews/trending`,
`/bluesky/trending`, `/devto`, `/lobsters`, `/producthunt`, `/reddit`,
`/reddit/trending`, `/compare`, `/docs`, `/search`, `/watchlist`,
`/submit`, `/pricing`.

Plus dynamic expansion for `CATEGORIES` and `loadAllCollections()`.

### Public hubs NOT yet in the sitemap (forward-only follow-ups)

These exist as `page.tsx` and 200 to anonymous traffic but are not
indexed via the pages sitemap. None are blocking; flagging for a future
ADD-only pass:

| Route | Notes |
| --- | --- |
| `/about` | Marketing landing. Should index. |
| `/methodology` | Trust/credibility page. Should index. |
| `/cli` | CLI install page. Worth indexing. |
| `/research` | Research hub. Worth indexing. |
| `/predict` | Forecast page. Worth indexing. |
| `/mindshare` | Hub. Worth indexing. |
| `/skills` | Skills index. Worth indexing (per-slug under dynamic.) |
| `/mcp` | MCP index. Worth indexing. |
| `/agent-commerce` | Hub. Worth indexing. |
| `/agent-repos` | Hub. Worth indexing. |
| `/tierlist` | Hub. Worth indexing. |
| `/tools`, `/tools/star-history`, `/tools/treemap`, `/tools/revenue-estimate` | Tool pages. Worth indexing. |
| `/alerts` | User-facing hub. Worth indexing. |
| `/ideas` | Hub. Worth indexing. |
| `/digest` | Hub (per-date already in `/sitemap-digest.xml`). Add hub itself. |
| `/portal/docs` | Public docs. Worth indexing. |
| `/top` | Top repos. Worth indexing. |
| `/githubrepo` | Search/index page. Worth indexing. |
| `/huggingface`, `/huggingface/models` | Hubs. Worth indexing. |

Correctly excluded from sitemap (private/internal/utility):

- `/admin/*` — disallowed in robots
- `/you` — disallowed in robots
- `/embed/top10` — iframe surface, not standalone
- `/design-lab/primitives`, `/demo` — dev-facing
- Dynamic detail pages (`/repo/[o]/[n]`, `/categories/[slug]`,
  `/collections/[slug]`) — already covered by the dynamic expansion in
  `sitemap-pages.xml` or by `sitemap-repos.xml`.
- Short-link surfaces (`/s/[shortId]`, `/u/[handle]`,
  `/agent-commerce/facilitator/[name]`) — user-generated, not bulk
  enumerable.

## sitemap-repos.xml + sitemap-news.xml findings

Headers reviewed. Both implement the documented multi-sitemap leaf
pattern. 45_000 repo cap (10% headroom under the 50k protocol limit),
48h freshness window for news, image extension on repo URLs. No bug.

## sitemap-digest.xml

Referenced from index + advertised in `robots.ts`. Not opened this pass
(out of scope for /trends).

## Verdict

`robots.ts` and the sitemap chain are healthy.  `/trends` is indexed.
No write applied this pass. Forward-only follow-up: ADD the ~20 public
hubs listed above to `STATIC_HUBS` in a future H-task. Each entry is one
line and matches the existing `{ path, priority, changefreq }` schema.

## Evidence

- `/trends` present in sitemap-pages.xml: `src/app/sitemap-pages.xml/route.ts:51`
- robots disallows `/admin` + `/you` + `/api/`: `src/app/robots.ts:28-37`
- robots advertises 5 sitemaps: `src/app/robots.ts:89-95`
- sitemap index references 4 sub-sitemaps: `src/app/sitemap.xml/route.ts:25-30`
