# AGN-791 — SEO-002 Why-narrative engine (top 50 trending repos)

Date: 2026-05-04

## Shipped in this heartbeat

- Added dedicated metadata for `/githubrepo`:
  - Canonical URL
  - OpenGraph title/description
  - Twitter card title/description
- Implemented a deterministic top-50 "why narrative" synthesizer (`buildTop50WhyNarrative`) from live row signals:
  - top leader repo
  - aggregate 24h star gain (top 50)
  - count of high-momentum rows
  - count of rows with active mention flow
  - dominant category in the snapshot
- Rendered a visible "Why these repos are trending" narrative block below the Live / top 50 table.
- Added structured data (`CollectionPage` + `ItemList`) to `/githubrepo` with:
  - `dateModified` from current refresh timestamp
  - `abstract` from generated why narrative
  - ordered top-50 list linking to each repo detail page
- Implemented AGN-791 why-caption engine + UI wiring:
  - Added `src/lib/repo-why.ts` with key contract `repo:<owner>:<name>:why` and 24h TTL writes.
  - Added `src/components/repo/WhyBadge.tsx`.
  - Wired WhyBadge onto:
    - `/repo/[owner]/[name]` header stack (`src/app/repo/[owner]/[name]/page.tsx`)
    - `/top10` ranked rows (`src/app/top10/page.tsx`)
    - `/githubrepo` live top-50 rows via `LiveTopTable` (`src/components/home/LiveTopTable.tsx`, `src/app/githubrepo/page.tsx`)
  - Added batch script `scripts/generate-top50-why.ts` for top-50 persistence runs.

## Verification run

- `npx eslint src/app/githubrepo/page.tsx` — pass
- `npx eslint src/lib/repo-why.ts src/components/repo/WhyBadge.tsx src/components/home/LiveTopTable.tsx src/app/repo/[owner]/[name]/page.tsx src/app/top10/page.tsx src/app/githubrepo/page.tsx scripts/generate-top50-why.ts` — pass
- Browser verification attempt (`GET /githubrepo`) on local dev server returned `500`.
  - Root cause is unrelated to AGN-791 code:
    - `src/app/layout.tsx` uses `next/dynamic(..., { ssr: false })` in a Server Component.
    - Next.js error: "`ssr: false` is not allowed with `next/dynamic` in Server Components."
  - Evidence captured in:
    - `.tmp-agn791-githubrepo-500.html`
    - `.tmp-agn791-githubrepo-3031.html`
- Batch persistence attempt:
  - `npx tsx scripts/generate-top50-why.ts` repeatedly timed out in this environment (124s / 904s windows), so full `50/50` persistence could not be confirmed from this run.

## Next action

- Unblock owner/action: app layout owner must fix `src/app/layout.tsx` dynamic import usage so the app compiles.
- Unblock owner/action: infra owner verifies data-store write latency (Redis reachability/timeout behavior) so `scripts/generate-top50-why.ts` can complete and print `persisted why captions: 50/50`.
- After unblock, re-run focused render check on `/githubrepo` to confirm:
  - JSON-LD script appears once and is valid
  - narrative content updates across different refresh snapshots
  - no visual regression in the top-50 section spacing
