# AGN-794 Validation Blocker (2026-05-05)

## Scope
- Issue: `AGN-794` (`[SEO-005] JSON-LD on /repo/[owner]/[name] — SoftwareSourceCode`)
- Goal of this run: complete route-level validation for:
  - `/repo/*` JSON-LD emission (including `SoftwareSourceCode`)
  - `/u/*` `Person` JSON-LD emission

## Completed checks
- Unit tests passed:
  - `npx tsx --test src/lib/__tests__/seo-repo-schemas.test.ts src/lib/__tests__/seo-user-schemas.test.ts`
  - Result: `5 passed, 0 failed`
- Typecheck passed:
  - `npm run typecheck`
  - Result: `tsc --noEmit` success

## Validation blocker
- Route-level/e2e validation is currently blocked by local runtime instability unrelated to AGN-794 schema logic:
  1. Playwright initially failed due server conflicts on `:3023`.
  2. Isolated dev server on `:4126` booted but produced repeated runtime errors and unstable behavior.
  3. Observed recurring errors in `.tmp-dev4126.log`:
     - `Could not find the module "... in the React Client Manifest"`
     - Multiple missing client-manifest modules under `src/components/...` and `next/dist/...`
  4. Playwright runs failed with:
     - `page.goto timeout`
     - `0 JSON-LD scripts found` (on pages that should emit them)
     - browser worker/process crashes (`code=3221226091`)
  5. Direct Node `fetch` against `http://localhost:4126` routes also failed (`TypeError: fetch failed`) once the server destabilized.

## Impact
- AGN-794 implementation changes are in place and unit-verified, but route-level proof and Google Rich Results validation for 3 repo URLs cannot be completed in this environment until the app runtime is healthy.

## Next unblock action
1. Stabilize local app runtime first (resolve React Client Manifest/Turbopack module-resolution failures).
2. Re-run:
   - `npx playwright test tests/e2e/json-ld.spec.ts` against a healthy server
   - Google Rich Results validation for at least 3 `/repo/*` URLs
3. Attach validation evidence to AGN-794 and move to `in_review`.
