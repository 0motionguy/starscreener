# SEO Policy

**Owner:** Frontend Refactor (AGN-915 / QUE-12).
**Audit input:** AGN-790 — `<meta name="og:*">` present in 45/86 routes, twitter cards in 40/86, robots directives in 25/86. Drift was invisible because no policy existed.

This doc is the source-of-truth for what metadata each route in `src/app/**/page.tsx` (and adjacent `layout.tsx` metadata wrappers for client-component pages) must export.

Every page is annotated at the top with one comment line:

```
// SEO: indexable | canonical-only | noindex | redirect
```

The comment is the contract. The `scripts/seo-policy-lint.mjs` audit script reads those annotations and verifies the metadata shape matches the class.

---

## Class summary

| Class            | Title           | Description     | Canonical | OG       | Twitter  | Robots `index` | Notes                                                       |
| ---------------- | --------------- | --------------- | --------- | -------- | -------- | -------------- | ----------------------------------------------------------- |
| `indexable`      | required        | required        | required  | required | required | `true` (default) | Public surfaces shareable on social. The default class.   |
| `canonical-only` | required        | required        | required  | optional | optional | `false`        | Public URL but per-user state — index pollutes search.      |
| `noindex`        | required        | optional        | not required | not required | not required | `false`     | Internal / staff / preview / embed. No social presence.     |
| `redirect`       | not required    | not required    | not required | not required | not required | n/a          | Pure `redirect()` page; metadata is wasted bytes.           |

The root `src/app/layout.tsx` provides defaults (full OG block, Twitter card, `robots: { index: true, follow: true }`, canonical `/`). Subpages **inherit** anything they do not override. The class declaration tells the lint what the explicit override has to look like.

---

## Class 1 — `indexable`

**When:** A public page Google should crawl, social platforms should unfurl, users should share.

**Examples:** `/`, `/top10`, `/top10/[date]`, `/repo/[owner]/[name]`, `/skills/[slug]`, `/categories/[slug]`, `/digest/[date]`, `/arxiv/trending`, `/mcp/[slug]`, `/u/[handle]`.

**Required exports:**

```ts
export const metadata: Metadata = {
  title: "...",                       // unique, ≤ 60 chars
  description: "...",                 // unique, ≤ 160 chars
  alternates: { canonical: "/path" }, // absolute or root-relative
  openGraph: {
    type: "website" | "article",
    title: "...",
    description: "...",
    url: "/path",
    images: [...],                    // optional but strongly preferred
  },
  twitter: {
    card: "summary_large_image",
    title: "...",
    description: "...",
  },
  // robots is inherited from root layout (index: true). No override.
};
```

**Dynamic-route variant:** Export `generateMetadata` (async) that builds the same shape from the resolved params. Always include `alternates.canonical` resolved through `absoluteUrl(...)`. On `notFound()` paths, return `{ robots: { index: false, follow: false } }`.

**Anti-pattern:** Re-stating the root `<meta>` block verbatim (e.g. icons, manifest, applicationName). Inheritance handles it; duplication is drift.

---

## Class 2 — `canonical-only`

**When:** A public URL exists, but the rendered content is per-user / per-session / per-search-query and indexing it would either (a) leak state (b) bloat the index with user-specific noise.

**Examples:** `/watchlist`, `/alerts`, `/alerts/new`, `/search`, `/you`, `/compare`, `/submit`, `/submit/revenue`. (`/admin/login` is `noindex`, not `canonical-only`, despite being a "public" URL — staff sign-in pages should never appear in search.)

**Required exports:**

```ts
export const metadata: Metadata = {
  title: "...",
  description: "...",
  alternates: { canonical: absoluteUrl("/path") },
  robots: { index: false, follow: true },
  // openGraph / twitter optional. Include only if the page can be meaningfully shared.
};
```

**Why `follow: true`:** The page itself is private-state, but the links **out** of it (to `/repo/...`, `/skills/...`) are valid public surfaces. Don't punish them.

**Client-component note:** A "use client" page cannot export `metadata`. The pattern is a sibling `layout.tsx` that exports the metadata for its single child — see `src/app/watchlist/layout.tsx` for the reference shape.

---

## Class 3 — `noindex`

**When:** Internal / staff / preview / iframe-embed surface that must never appear in search.

**Examples:** Everything under `/admin/*` (including `/admin/login`), `/embed/*`, `/demo`, `/design-lab/*`, `/portal/docs` (for now — see TODO), `/cli` (for now — see TODO), staff-only debug pages.

**Required exports:**

```ts
export const metadata: Metadata = {
  title: "...",
  robots: { index: false, follow: false },
  // description / canonical / OG / twitter all optional — the class is "do not index".
};
```

`follow: false` is the deliberate difference vs `canonical-only`: an admin page's outbound links can leak ID-bearing URLs (queue items, raw user mentions) and we don't want crawlers walking them.

---

## Class 4 — `redirect`

**When:** The page exists only to call `redirect()` from `next/navigation`. Examples: `/commer` → `/agent-commerce`, `/githubrepo` (is a real page today — re-classified to `indexable`), `/huggingface` → `/huggingface/models`, `/s/[shortId]` → `/compare?...`.

**Required exports:** None. Do not export `metadata`. The page never renders HTML for a user-agent to read; the redirect happens before the response body is composed. Adding metadata is dead bytes and a maintenance trap.

**Annotation is still required** so the lint script knows it's intentional, not a missed page.

---

## Inheritance contract

The root `src/app/layout.tsx` declares:

- `metadataBase`, `applicationName`, `keywords`, `manifest`, `icons`
- Default `title.template: "%s — TrendingRepo"`, `title.default: "TrendingRepo — The trend map for open source"`
- Default `openGraph` block (siteName, locale, default OG image)
- Default `twitter` card
- Default `robots: { index: true, follow: true }`
- Default `alternates.canonical: "/"` and RSS feed alternates

Pages **must not duplicate** any of those keys unless they are overriding the value. The lint flags duplicate icon arrays / manifest references / metadataBase declarations as drift.

---

## Annotation format

Every `page.tsx` (and the `layout.tsx` of a client-component page that owns its metadata) must have a top-of-file comment within the first 5 lines:

```
// SEO: <class>
```

Where `<class>` is exactly one of: `indexable`, `canonical-only`, `noindex`, `redirect`.

A second-line note explaining a non-obvious choice is encouraged but not required:

```
// SEO: canonical-only
// Per-user watchlist; canonical URL exists but content is local-state.
```

---

## Lint enforcement

`scripts/seo-policy-lint.mjs` walks `src/app/**/page.tsx` (skipping `_*` and `__tests__`) and:

1. Reports any file missing the `// SEO:` annotation.
2. For `indexable` / `canonical-only` files, reports if `metadata` / `generateMetadata` is absent **and** there's no sibling `layout.tsx` with a metadata export.
3. For `redirect` files, reports if `metadata` is exported.
4. For `noindex` files, reports if `robots.index` is not `false` (best-effort string match).

The script exits with code 1 on drift. Wire it into CI alongside the other `lint:*` guards.

---

## Apply status (AGN-915 first cut)

Annotated and verified during AGN-915 first pass:

- Top traffic / share-target routes: `/`, `/top10`, `/repo/[owner]/[name]`, `/skills/[slug]`, `/digest/[date]`, `/arxiv/trending`, `/mcp/[slug]`, `/categories/[slug]`, `/u/[handle]`, `/submit`, `/demo` → all annotated.
- Per-user routes via sibling layout: `/watchlist`, `/alerts`, `/search`, `/compare`, `/you` → all annotated.
- Admin gate + login: `/admin`, `/admin/login` → annotated.
- Embeds: `/embed/top10` → annotated.
- Redirect aliases: `/commer`, `/huggingface`, `/s/[shortId]` → annotated.

## TODO — second wave (tracked here, not blocking)

The first cut covered ~25 hot routes. Remaining `page.tsx` files in `src/app/**/` (≈ 60) still need annotation. The lint script flags them all on first run; the annotation itself is one comment line per file. Suggested batches:

1. **All `/admin/*` subpages** (`/admin/ideas-queue`, `/admin/keys`, `/admin/pool`, `/admin/pool-aggregate`, `/admin/revenue-queue`, `/admin/scoring-shadow`, `/admin/staleness`, `/admin/unknown-mentions`) — class `noindex`.
2. **Source-feed pages** (`/devto`, `/lobsters`, `/npm`, `/papers`, `/producthunt`, `/reddit`, `/reddit/trending`, `/twitter`, `/bluesky/trending`, `/hackernews/trending`, `/huggingface/datasets`, `/huggingface/models`, `/huggingface/spaces`, `/huggingface/trending`) — class `indexable`.
3. **Tools / utility pages** (`/tools`, `/tools/star-history`, `/tools/treemap`, `/tools/revenue-estimate`, `/repo/[owner]/[name]/star-activity`) — class `indexable`.
4. **Marketing / static** (`/about`, `/methodology`, `/research`, `/pricing`, `/cli`, `/portal/docs`, `/funding`, `/breakouts`, `/consensus`, `/consensus/[owner]/[name]`, `/mindshare`, `/predict`, `/signals`, `/top`, `/revenue`, `/agent-commerce`, `/agent-commerce/[slug]`, `/agent-commerce/facilitator/[name]`, `/agent-repos`, `/agent-repos/[slug]`, `/brief/[owner]/[name]`, `/categories`, `/collections`, `/collections/[slug]`, `/ideas`, `/ideas/[id]`, `/skills`, `/tierlist`, `/tierlist/[shortId]`, `/model-usage`, `/digest`, `/alerts/new`, `/submit/revenue`, `/mcp`, `/design-lab/primitives`) — mostly `indexable`, `design-lab/primitives` is `noindex`.

Each batch is a follow-up PR. The lint guard prevents drift from re-creeping in the gap.
