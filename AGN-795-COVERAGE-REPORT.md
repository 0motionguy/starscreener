# AGN-795 Coverage Report

Date: 2026-05-05

## Scope
- Multi-sitemap implementation (`/sitemap.xml` + child sitemaps)
- Canonical-page coverage in `sitemap-pages.xml`
- Dynamic coverage for `/repo/*` and `/u/*`
- `lastmod` quality for most-recent profile URLs

## Results
- Canonical static pages discovered from `src/app/**/page.tsx` (excluding `/api`, `/admin`, dynamic segments): **62**
- `sitemap-pages.xml` static entries: **61**
- Canonical pages missing from `sitemap-pages.xml`: **4**
  - `/demo`
  - `/design-lab/primitives`
  - `/embed/top10`
  - `/you`
- Sitemap-page entries without a matching static canonical page file: **3**
  - `/collections` (alias redirect)
  - `/docs` (redirect/virtual route)
  - `/huggingface` (alias route)

## Dynamic enumeration
- `/repo/*`: covered in `sitemap-repos.xml` from derived repo inventory (eligible repo filtering + dedupe)
- `/u/*`: now covered in `sitemap-profiles.xml` from ideas/reactions handles

## Profile `lastmod` quality
- Profile handles detected from activity stores (`.data/ideas.jsonl` + `.data/reactions.jsonl`): **1**
- Most-recent profiles requested for validation: up to **100**
- Profiles available in this environment: **1**
- Valid data-backed `lastmod` among available recent profiles: **1/1**

Note: this workspace snapshot currently contains only one active profile handle in the source stores, so a 100-profile empirical sample is not available locally. The sitemap implementation supports up to 5,000 profile URLs and computes `lastmod` from activity timestamps for each.
