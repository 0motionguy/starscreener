---
status: archive
audit-date: 2026-05-05
reason: code review report of past state; references may not resolve to current files
---

## Architecture review � AGN-504 `/u/[handle]` direct GitHub API call from RSC body

**Scope reviewed:** `src/app/u/[handle]/page.tsx` (~886 LOC), `src/lib/github-user.ts` (~124 LOC), `src/lib/profile.ts` (~150 LOC)
**Lenses applied:** Layering, Seams, Concern leakage, Depth (Ousterhout)

### Findings

1. **Layering � page-level RSC still owns external GitHub fetch orchestration**  
   `src/app/u/[handle]/page.tsx:L31-L33` and `src/app/u/[handle]/page.tsx:L102-L107`  
   The route entrypoint directly imports and calls `fetchGithubUserProfile`, so the presentation layer still carries source-selection logic (data-store profile + live GitHub). That direction keeps outbound API behavior coupled to render composition and makes this route a load-bearing caller whenever cache/TTL strategy changes. The module boundary should be profile-oriented, not transport-oriented.  
   **Suggested change:** move GitHub hydration behind a profile seam (for example `getPublicProfileView(handle)` in `src/lib/profile.ts`) so `page.tsx` consumes one deep module and no longer knows GitHub fetch mechanics.

2. **Concern leakage � cache policy is split across route and data accessor layers**  
   `src/app/u/[handle]/page.tsx:L46-L49` and `src/lib/github-user.ts:L24-L25` plus `src/lib/github-user.ts:L89-L92`  
   The route declares `revalidate=600` while the GitHub accessor independently enforces 24h revalidation, so freshness policy for one screen is encoded in two modules with different ownership. This is shallow composition: callers need to know both TTLs to reason about behavior. Over time this drifts into inconsistent freshness expectations and hard-to-debug staleness.  
   **Suggested change:** centralize `/u/[handle]` freshness policy in one profile-facing module (single owner that coordinates both internal and external data TTL contracts), and keep `page.tsx` policy-free.

### Things that look bad but are actually fine

- `src/app/u/[handle]/page.tsx:L102-L107` � parallel `Promise.all` fetch is appropriate here; this is not sequential-await coupling.
- `src/app/u/[handle]/page.tsx:L56-L58` and `src/app/u/[handle]/page.tsx:L104-L106` � the strict GitHub-login guard is a valid seam that avoids speculative external calls for impossible handles.

### Out of scope (handed off)

- Security: Nothing material.
- Tests: missing explicit contract tests for unified profile seam after refactor (future) ? assigning [Carmela](/AGN/agents/carmela)

### Verdict

**REQUEST_CHANGES** � findings #1 and #2 keep data-source orchestration and freshness ownership in the RSC layer instead of a deep profile module.
