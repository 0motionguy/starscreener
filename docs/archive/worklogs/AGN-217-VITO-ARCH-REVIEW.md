## Architecture review � AGN-217 typed-error envelope consistency on mutating routes

**Scope reviewed:** `src/app/api/pipeline/alerts/rules/route.ts` (~170 LOC), `scripts/check-error-envelope.mjs` (~100 LOC)
**Lenses applied:** Seams, Depth, Concern leakage, Leaky abstractions

### Findings

1. **Concern leakage / missing seam � route-local auth gate duplicated across handlers**
   `src/app/api/pipeline/alerts/rules/route.ts:L58-L66`, `src/app/api/pipeline/alerts/rules/route.ts:L85-L93`, `src/app/api/pipeline/alerts/rules/route.ts:L136-L144`
   The same auth branch (`verifyUserAuth` + deny mapping + fallback 401 envelope) is repeated in all mutating/read handlers. That keeps correctness dependent on copy/paste and makes envelope drift likely when one branch evolves and others do not. This is a shallow boundary at the route layer where cross-cutting auth policy leaks into each handler body.
   **Suggested change:** introduce a narrow route seam (for example `withUserAuth(request, fn)` in `src/lib/api/auth` or a route-local helper) that returns `userId` on success and canonical envelope responses on failure; update GET/POST/DELETE to consume the seam.

2. **Depth / leaky abstraction � ownership enforcement split between route and pipeline delete call**
   `src/app/api/pipeline/alerts/rules/route.ts:L154-L160`
   DELETE currently performs ownership probing (`listAlertRules(...).some`) and then a second mutation call (`deleteAlertRule`). This forces the route to know pipeline internals and creates a two-step contract that callers must coordinate correctly. The module boundary stays shallow because ownership+deletion invariants are not owned by the pipeline API.
   **Suggested change:** deepen the pipeline interface with a single user-scoped delete method (e.g. `deleteAlertRuleForUser(userId, id)` returning `deleted | not_found`) and map that result to envelope/status in the route.

### Things that look bad but are actually fine

- `src/app/api/pipeline/alerts/rules/route.ts:L102-L107` � the cast through `unknown` looks unsafe, but it is immediately downstream of Zod validation and exists only to bridge branded typing; this is acceptable until branded parsing is centralized.

### Out of scope (handed off)

- Security: auth policy depth/consistency beyond this envelope audit should be reviewed by `Sal`.
- Tests: envelope regression coverage for the 404 delete branches and user-scoped delete seam should be owned by `Carmela`.

### Verdict

**REQUEST_CHANGES** � Findings #1-#2 are structural and should be addressed (or filed with explicit owner follow-ups) before merge to prevent repeated envelope drift.
