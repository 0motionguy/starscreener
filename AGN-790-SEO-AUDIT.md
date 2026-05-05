# AGN-790 — SEO-001 Inside-Out Audit (`src/app/**/page.tsx`)

Audit date: 2026-05-04  
Scope: all `page.tsx` files under `src/app` (86 routes)

## Method
- Enumerated every `src/app/**/page.tsx` with `rg`.
- Ran static metadata coverage checks for:
  - route metadata export (`metadata` or `generateMetadata`)
  - `title`, `description`, `alternates/canonical`, `openGraph`, `twitter`, `robots`
- Manually reviewed all routes flagged with no route metadata to separate true issues from inherited layout metadata and re-export patterns.

Raw inventory snapshot: `.audit/agn-790-seo-page-audit.json`

## Coverage Snapshot
- Total route pages: 86
- With route-level metadata export/generateMetadata: 77
- Without route-level metadata export: 9 (includes inherited/re-exported cases)
- Title present: 73
- Description present: 70
- Canonical present: 45
- Open Graph present: 45
- Twitter present: 40
- Robots present: 25

## Critical Findings (Prioritized)

1. `src/app/githubrepo/page.tsx`
- Status: no metadata export, no parent layout metadata
- Impact: high-value indexable page lacks explicit title/description/canonical/OG/Twitter/robots signals
- Action: add `export const metadata: Metadata` with canonical `/githubrepo`, OG/Twitter parity, and explicit robots policy.

2. `src/app/s/[shortId]/page.tsx`
- Status: shortlink resolver page has no metadata export
- Impact: redirect helper route may be crawled/indexed without explicit noindex intent
- Action: add `metadata` with `robots: { index: false, follow: false }` and no canonical.

3. Alias redirect routes with no metadata
- `src/app/commer/page.tsx` -> `/agent-commerce`
- `src/app/collections/page.tsx` -> `/categories`
- `src/app/huggingface/page.tsx` -> `/huggingface/models`
- Impact: low-medium; alias URLs can be crawled before redirect consolidation.
- Action: add noindex metadata on alias pages (or move redirects to route handlers + hard canonical strategy).

## Non-Issues (False Positives From Static Scan)
- `src/app/search/page.tsx`: metadata inherited from `src/app/search/layout.tsx`
- `src/app/watchlist/page.tsx`: metadata inherited from `src/app/watchlist/layout.tsx`
- `src/app/alerts/page.tsx`: metadata inherited from `src/app/alerts/layout.tsx`
- `src/app/huggingface/models/page.tsx`: re-exports `{ metadata, default }` from `../trending/page`

## Systemic SEO Gaps (Cross-route)
1. Canonical consistency
- Only 45/86 page files include canonical directly.
- Some dynamic routes may set canonical in helpers, but many public pages do not declare it in-file.

2. Social metadata consistency
- OG present in 45/86; Twitter present in 40/86.
- Several indexable pages likely rely on fallbacks rather than route-specific snippets.

3. Robots policy explicitness
- 25/86 include `robots`.
- Private/admin/operator surfaces should consistently set `noindex` rather than relying on implicit behavior.

## Proposed Fix Sequence
1. Patch immediate route gaps
- Add metadata to `githubrepo`, `s/[shortId]`, and alias redirect pages (`commer`, `collections`, `huggingface`).

2. Normalize policy by route class
- Public indexable pages: require title, description, canonical, OG, Twitter.
- Operator/private pages (`/admin`, per-user dashboards): require explicit `noindex`.

3. Add guardrail
- Add a lint/audit script in CI to fail new `page.tsx` routes without required metadata policy for their route class.

## Next Action for AGN-790
- Implement the first patch set (critical gaps above), then re-run the inventory scan to produce a delta report.
