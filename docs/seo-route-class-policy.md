# AGN-915 - Per-Route-Class SEO Policy

## Objective
Define a consistent metadata policy by route class and apply it across existing routes so indexing behavior is explicit and predictable.

## Route Classes

### 1) Public indexable pages
Examples: `/`, `/mindshare`, `/reddit/trending`, `/repo/[owner]/[name]`, `/tools/*`

Requirements:
- `title`
- `description`
- `alternates.canonical`
- `openGraph` (title, description, url, type)
- `twitter` (at least card + title + description)
- `robots: index/follow` may inherit from root unless route needs override

### 2) Dynamic content pages with conditional indexability
Examples: `/ideas/[id]`, `/categories/[slug]`, `/brief/[owner]/[name]`

Requirements:
- Use `generateMetadata`
- Always emit canonical URL for valid content
- For missing/invalid/unpublishable content, return `robots: noindex` in metadata branch

### 3) User-private / operator surfaces
Examples: `/admin/*`, `/alerts/*`, `/watchlist/*`, `/design-lab/*`

Requirements:
- Explicit `robots: { index: false, follow: false }`
- No SEO reliance on inherited defaults alone for operator pages

### 4) Redirect/alias helper routes
Examples: `/collections` -> `/categories`, `/huggingface` -> `/huggingface/models`, `/commer` -> `/agent-commerce`

Requirements:
- Route handlers (`route.ts`) must set `X-Robots-Tag: noindex, nofollow`
- Use permanent redirect status where safe (`308`)
- Canonical authority belongs to destination route

### 5) Shortlink resolver routes
Examples: `/s/[shortId]`

Requirements:
- `robots: noindex, nofollow`
- Never expose as canonical destination
- Redirect to canonical indexable target

## AGN-915 Mass-Apply (this pass)
- Normalized `/tools` metadata to include Twitter card metadata alongside canonical + OG.
- Upgraded `/tools/treemap` metadata from title/description-only to full public-page policy:
  - canonical
  - open graph (site name + URL)
  - twitter card metadata
- Verified alias route handlers (`/collections`, `/huggingface`, `/commer`) already comply via `X-Robots-Tag: noindex, nofollow` + `308`.
- Verified `/s/[shortId]` is explicitly `noindex,nofollow` and not canonicalized to itself.

## Enforcement Guidance
- New public pages should not merge without canonical + OG + Twitter metadata.
- Alias and resolver routes should use `route.ts` redirects with explicit `X-Robots-Tag`.
- Keep metadata logic in Server Components or server wrappers; avoid client-only title mutations as primary SEO mechanism.
