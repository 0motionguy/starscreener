# AGN-617 Verification — Repo monogram fallback color from owner hash

Date: 2026-05-05  
Issue: AGN-617  
Scope: Frontend-only fallback color behavior for repo logos when image avatar is missing/broken.

## Code changes validated

- `src/components/ui/EntityLogo.tsx`
  - Fallback tone now uses `monogramTone(monogramToneSeed(name))`.
- `src/lib/logos.ts`
  - Added `monogramToneSeed(name)`:
    - canonical `owner/name` -> `owner`
    - non-repo labels -> unchanged
- `src/lib/__tests__/logos.test.ts`
  - Added tests for owner-seeding and same-owner tone stability.

## Test evidence

- Command: `npx tsx --test src/lib/__tests__/logos.test.ts`
- Result: pass (`16/16`).

## Visual + flow verification evidence

Screenshots captured (desktop + mobile) for:

- `/`
- `/mindshare`
- `/reddit/trending`
- `/githubrepo`

Saved under:

- `qa-artifacts/agn-617/home-desktop.png`
- `qa-artifacts/agn-617/home-mobile.png`
- `qa-artifacts/agn-617/mindshare-desktop.png`
- `qa-artifacts/agn-617/mindshare-mobile.png`
- `qa-artifacts/agn-617/reddit-trending-desktop.png`
- `qa-artifacts/agn-617/reddit-trending-mobile.png`
- `qa-artifacts/agn-617/githubrepo-desktop.png`
- `qa-artifacts/agn-617/githubrepo-mobile.png`
- `qa-artifacts/agn-617/README.txt`

Keyboard tab-order smoke:

- Executed `Tab` keypress sequence before each screenshot capture (8 tabs/page) to detect obvious focus-order regressions.

## CTO sweep status

- `npm run typecheck`: fails due to pre-existing unrelated workspace errors.
  - Examples:
    - `.next/types/app/api/compare/share/route.ts` export shape mismatch
    - `.next/types/app/api/webhooks/stripe/route.ts` export shape mismatch
    - `.next/types/app/arxiv/trending/page.ts` `searchParams` typing mismatch
- `npm run build`: fails due to pre-existing unrelated lint/type errors.
  - Examples:
    - `src/app/agent-repos/page.tsx` `react/jsx-no-comment-textnodes`
    - `src/app/mcp/page.tsx` `react/jsx-no-comment-textnodes`
    - `src/lib/pipeline/__tests__/stripe-events.test.ts` parse error

## Blocker classification

AGN-617 implementation and targeted verification are complete.  
Global `typecheck`/`build` are currently blocked by unrelated repository-wide errors outside AGN-617 change scope.

## Next action

Attach `qa-artifacts/agn-617/*.png` and this note to the PR description and request review from Vito (refactor lane).
