# AGN-930 — Font loading audit (`preload` + `display: swap`)

## Scope
- Audit app-wide font loading path for `display: swap` and preload behavior.
- Apply safe, low-risk hardening in root layout only.

## Findings
- Font loading is centralized in `src/app/layout.tsx` via `next/font/google`.
- All three active families (`Geist`, `Geist_Mono`, `Space_Grotesk`) already used `display: "swap"`.
- No additional `@font-face` declarations were found in app CSS for active UI fonts.

## Changes made
- Added explicit preload intent to each `next/font/google` config in `src/app/layout.tsx`.
- Kept `preload: true` for `Geist` (primary body font).
- Set `preload: false` for `Geist_Mono` and `Space_Grotesk` so preload tags are limited to the default above-the-fold text path.

## Verification
- Static check: inspected root layout font declarations and global CSS fallback chains.
- Command evidence:
  - `rg -n 'next/font' src/app/layout.tsx src/app src/components` -> only `src/app/layout.tsx` imports `next/font`.
  - `rg -n 'display: \"swap\"|preload: true|preload: false' src/app/layout.tsx` -> all configured fonts use `display: "swap"` with explicit preload policy.
  - `npx eslint src/app/layout.tsx` -> pass.
- Next step: run Lighthouse compare on key routes (`/`, `/repo/[owner]/[name]`) to confirm no LCP regression and verify the webfont visibility audit stays clean.
