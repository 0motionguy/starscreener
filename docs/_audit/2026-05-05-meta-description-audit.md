---
last-verified: 2026-05-05
verified-by: claude
status: snapshot
audit: meta-description
---

# Metadata uniqueness audit — all top-level routes

**Wave 2 hardening · AGN-803 · H11**

## Scope

84 `src/app/**/page.tsx` files audited (read-only). For each route, extracted
`title`, `description`, OG image presence, Twitter card presence from
`export const metadata` or `generateMetadata()`.

Root layout defaults (`src/app/layout.tsx`):
- `title.default` = `${SITE_NAME} — ${SITE_TAGLINE}` (template `%s — ${SITE_NAME}`)
- `description` = `SITE_DESCRIPTION`
- OG + Twitter set globally; per-route OG-image absent unless overridden.

## Coverage summary

| Bucket | Count | Notes |
|---|---|---|
| Routes total | 84 | including dynamic `[slug]` / `[id]` / `[date]` / `[owner]/[name]` |
| With `metadata` or `generateMetadata` | 77 | |
| Inheriting layout default (no override) | **7** | flagged below |
| With per-route OG-image | **6** | tiny — flagged below |
| With explicit `twitter.card` | 36 | rest fall back to layout-level twitter card |

## Per-route metadata table

Legend: `LAYOUT` = inherits from root layout (no per-route metadata).
`OG-img` / `TW-card` = `y` if route sets its own; `inh` = inherits layout.

| Route | Title | Description | OG-img | TW-card |
|---|---|---|---|---|
| `/` | `LAYOUT` | `LAYOUT` | inh | inh |
| `/about` | `About` (TITLE const) | `DESCRIPTION` const | n | inh |
| `/admin` | `Admin — Control` | unique | n | inh |
| `/admin/ideas-queue` | `Admin — Ideas Moderation Queue` | unique | n | inh |
| `/admin/keys` | `Admin - Key Pools` | unique | n | inh |
| `/admin/login` | `Admin — Sign in` | (none) | n | inh |
| `/admin/pool` | `Admin — GitHub Token Pool` | unique | n | inh |
| `/admin/pool-aggregate` | `Admin — GitHub Token Pool (Fleet)` | unique | n | inh |
| `/admin/revenue-queue` | `Admin — Revenue Moderation Queue` | unique | n | inh |
| `/admin/scoring-shadow` | `Admin — Scoring Shadow Report` | unique | n | inh |
| `/admin/staleness` | `Admin — Staleness sweep` | unique | n | inh |
| `/admin/unknown-mentions` | `Admin — Unknown Mentions Discovery` | unique | n | inh |
| `/agent-commerce` | `TrendingRepo · Agent Commerce` | unique | n | inh |
| `/agent-commerce/[slug]` | `${name} · Agent Commerce` (dyn) | dyn brief slice | n | inh |
| `/agent-commerce/facilitator/[name]` | `${name} · x402 facilitator` (dyn) | unique dyn | n | inh |
| `/agent-repos` | `Agent Repos — TrendingRepo` | unique | n | y |
| `/agent-repos/[slug]` | dyn or `Agent repo not found` | dyn | n | y |
| `/alerts` | `LAYOUT` (client component) | `LAYOUT` | inh | inh |
| `/alerts/new` | `New alert — TrendingRepo` | unique | n | inh |
| `/arxiv/trending` | `Trending arXiv Papers` | unique | n | y |
| `/bluesky/trending` | `Trending on Bluesky` | unique | n | y |
| `/breakouts` | `Cross-Signal Breakouts` | unique | n | y |
| `/categories` | `Categories - TrendingRepo` | `CATEGORIES_DESCRIPTION` | n | y |
| `/categories/[slug]` | dyn or `Category Not Found` | dyn | n | y |
| `/cli` | `CLI — TrendingRepo` | unique | n | inh |
| `/collections` | `Collections - TrendingRepo` | `DESCRIPTION` const | n | y |
| `/collections/[slug]` | dyn or `Collection Not Found` | dyn | n | y |
| `/commer` | (redirect → `/agent-commerce`) | — | — | — |
| `/compare` | `LAYOUT` (only when state empty) | dyn share-state OG image | **y** | y |
| `/consensus` | `Trending Consensus` | unique | n | y |
| `/consensus/[owner]/[name]` | dyn `${fullName} — Consensus` | dyn | n | y |
| `/demo` | `Demo — ideas + predictions · TrendingRepo` | unique | n | inh |
| `/design-lab/primitives` | `LAYOUT` (no metadata) | `LAYOUT` | inh | inh |
| `/devto` | `Trending on Dev.to` | unique | n | y |
| `/digest` | `Daily Trending Digests — TrendingRepo` | `DIGEST_DESCRIPTION` | n | y |
| `/digest/[date]` | dyn or `Digest Not Found` | dyn per-date | n | y |
| `/embed/top10` | `Top 10 — TrendingRepo (embed)` | unique | n | inh |
| `/funding` | `TrendingRepo — Funding Radar` | unique | n | inh |
| `/githubrepo` | `LAYOUT` | `LAYOUT` | inh | inh |
| `/hackernews/trending` | `Trending on Hacker News` | unique | n | y |
| `/huggingface` | `LAYOUT` (no `page.tsx` metadata) | `LAYOUT` | inh | inh |
| `/huggingface/datasets` | `Trending Hugging Face Datasets` | unique | n | y |
| `/huggingface/spaces` | `Trending Hugging Face Spaces` | unique | n | y |
| `/huggingface/trending` | `Trending Hugging Face Models` | unique | n | y |
| `/ideas` | dyn `generateMetadata` | dyn | n | y |
| `/ideas/[id]` | dyn `${record.title}` or 404 | dyn | n | y |
| `/lobsters` | `TrendingRepo — Lobsters Trending` | unique | n | inh |
| `/mcp` | `Trending MCP - TrendingRepo` | unique | n | inh |
| `/mcp/[slug]` | dyn or `MCP Not Found` | dyn | n | y |
| `/methodology` | `How TrendingRepo ranks repos — Methodology` | unique | n | inh |
| `/mindshare` | `TITLE` const | `DESCRIPTION` const | **y** | y |
| `/model-usage` | `Model Usage — STARSCREENER` | (none) | n | inh |
| `/npm` | `TrendingRepo - NPM Trending Packages` | unique | n | inh |
| `/papers` | `Trending AI Papers` | unique | n | y |
| `/portal/docs` | `MCP Portal - TrendingRepo` | unique | n | inh |
| `/predict` | `Forecasted breakouts — TrendingRepo` | unique | n | y |
| `/pricing` | `TrendingRepo — Pricing` | unique | n | y |
| `/producthunt` | `TrendingRepo — ProductHunt Launches` | unique | n | inh |
| `/reddit` | `Repos Trending on Reddit` | unique | n | y |
| `/reddit/trending` | `Trending on Reddit` | unique | n | y |
| `/repo/[owner]/[name]` | dyn `${owner}/${name}` | dyn `repo.description` | n | y |
| `/repo/[owner]/[name]/star-activity` | dyn `generateMetadata` | dyn | **y** | y |
| `/research` | `Research - TrendingRepo` | unique | n | inh |
| `/revenue` | `TrendingRepo — Revenue Terminal` | unique | n | inh |
| `/s/[shortId]` | (redirect → `/compare`) | — | — | — |
| `/search` | `LAYOUT` (client component) | `LAYOUT` | inh | inh |
| `/signals` | `Signals — Cross-Source Newsroom` | unique | n | y |
| `/skills` | `Trending Skills - TrendingRepo` | `DESCRIPTION` const | n | y |
| `/skills/[slug]` | dyn or `Skill Not Found` | dyn | n | y |
| `/submit` | `Drop Your Repo` | unique | n | inh |
| `/submit/revenue` | `Claim or Submit Revenue — TrendingRepo` | unique | n | inh |
| `/tierlist` | `Tier List Maker - TrendingRepo` | unique | n | y |
| `/tierlist/[shortId]` | dyn `${payload.title}` | dyn | **y** | y |
| `/tools` | `HUB_TITLE` const | `HUB_DESCRIPTION` const | n | inh |
| `/tools/revenue-estimate` | `Revenue Estimator — TrendingRepo` | unique | n | inh |
| `/tools/star-history` | dyn `generateMetadata` | dyn | n | y |
| `/tools/treemap` | `Treemap explorer — TrendingRepo` | unique | n | inh |
| `/top` | `Top 100 GitHub Repos by Stars` | unique | n | inh |
| `/top10` | `TITLE` const | `DESCRIPTION` const | **y** | y |
| `/top10/[date]` | dyn per-date or default | dyn | **y** | y |
| `/trends` | `Trends — TrendingRepo` | `TRENDS_DESCRIPTION` | n | y |
| `/twitter` | `Trending Repos on X` | unique | n | inh |
| `/u/[handle]` | dyn `@${handle}` | dyn | n | y |
| `/watchlist` | `LAYOUT` (client component) | `LAYOUT` | inh | inh |
| `/you` | `Your signal — TrendingRepo` | unique | n | inh |

Total rows: 84. Redirect-only routes (`/commer`, `/s/[shortId]`) excluded
from metadata-quality scoring.

## Flagged: routes inheriting layout default (7)

These render with the global `${SITE_NAME} — ${SITE_TAGLINE}` title and
`SITE_DESCRIPTION` body — none have route-specific SEO copy.

1. `/` — home (layout-default by design per `src/app/page.tsx:9` comment)
2. `/githubrepo` — isolated trending list, indexable, no metadata
3. `/watchlist` — `"use client"` so static metadata not exported
4. `/alerts` — `"use client"`
5. `/search` — `"use client"`
6. `/design-lab/primitives` — internal but reachable
7. `/huggingface` (hub index — only sub-routes have metadata)

Client-component pages (`/watchlist`, `/alerts`, `/search`) cannot export
`metadata` directly; the canonical Next 15 fix is to wrap them in a
server-component `layout.tsx` that exports `metadata`, or split into a
server `page.tsx` shell + client child. The current state means none of
these surface in search results with their own copy.

## Flagged: routes missing per-route OG-image (most of the site)

Only 6 routes set `openGraph.images` or `twitter.images`:
`/compare`, `/mindshare`, `/top10`, `/top10/[date]`, `/tierlist/[shortId]`,
`/repo/[owner]/[name]/star-activity`.

Every other route — including the high-traffic surfaces `/breakouts`,
`/papers`, `/signals`, `/digest`, `/repo/[owner]/[name]`, `/funding`,
`/categories`, `/skills`, `/agent-commerce`, `/consensus` — falls back to
the layout-level OG image. Twitter/Discord embeds for these routes are
visually identical.

## Flagged: title/description duplication across hub variants

These routes share near-identical body copy in description (often byte-equal
strings inside a single template). All are unique enough in `title` to avoid
verbatim duplicates:

- HuggingFace trio: `Trending Hugging Face {Models|Datasets|Spaces}` — each
  description is `Top HF {kind} by domain-scored momentum.` (parallel
  structure, distinguishable nouns).
- `/reddit` vs `/reddit/trending` — adjacent surfaces, different scope:
  - `/reddit` description: "GitHub repos breaking out across the tech subreddits, live-scored."
  - `/reddit/trending` description: "Top Reddit tech posts by velocity, cross-subreddit signal."
- `/breakouts` and `/predict` — both lean on "breakouts" copy but
  descriptions differ.
- No two routes share verbatim title+description — duplication risk is
  description-only and minor.

## Recommendations

### P1 — give the inheriting-7 their own metadata

`/` is intentional. The other six should ship route-specific
`title` + `description`:

1. **`/githubrepo`** — server component, easy fix. Suggested:
   `"Trending GitHub Repos — Live List · TrendingRepo"`.
2. **`/huggingface`** — currently a hub stub; export metadata or redirect.
3. **`/design-lab/primitives`** — set `robots: { index: false }`; this is
   internal-only.
4. **`/watchlist`, `/alerts`, `/search`** — wrap each in a co-located
   `layout.tsx` that exports `metadata`. Without this, three user-facing
   surfaces ship the generic site title to every crawler.

### P2 — per-route OG image rollout

Only 6/82 indexable routes have a unique OG image. Adopt a route-level
default via a shared `og-image` helper (signature already exists in
`src/lib/seo` and `src/lib/star-activity-url`). Priority order:
`/papers`, `/breakouts`, `/signals`, `/digest`, `/categories/[slug]`,
`/repo/[owner]/[name]`, `/funding` — all are high-share-rate surfaces.

### P3 — explicit `twitter.card` everywhere

36 of 82 routes set `twitter.card: "summary_large_image"`; the rest
inherit. Inheritance works in Next 15, but explicit declaration is cheap
and survives layout-metadata refactors. Add to the same boiler that
adds OG image (P2) so both ship together.

### Clean (no action)

Dynamic routes — `/repo/[owner]/[name]`, `/u/[handle]`,
`/categories/[slug]`, `/skills/[slug]`, `/collections/[slug]`,
`/digest/[date]`, `/top10/[date]`, `/ideas/[id]`, `/agent-repos/[slug]`,
`/mcp/[slug]`, `/agent-commerce/[slug]`, `/agent-commerce/facilitator/[name]`,
`/consensus/[owner]/[name]`, `/tierlist/[shortId]`, `/tools/star-history`,
`/repo/[owner]/[name]/star-activity` — all build per-instance copy via
`generateMetadata`. Title + description uniqueness scales with content;
no duplication risk.

Static-uniqueness clean: every other listed route except the 7 above has
a unique title and a unique (or distinguishable-template) description.
