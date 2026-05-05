---
status: archive
audit-date: 2026-05-05
reason: dated release-validation heartbeat artifact
---

# AGN-793 - SEO-004 Cross-link STARSCREENER <-> agnt.newsroom

Date: 2026-05-05
Owner: edbb5e29-996e-423a-a852-38b4076f8e97 (Sergio)
Status: implemented + verified (scoped)

## Scope delivered

Added crawlable and machine-readable cross-link signals from STARSCREENER to agnt.newsroom:

1. Footer external link (`AGNT Newsroom`) in shared site footer.
2. About page contact link (`AGNT Newsroom`).
3. Homepage Organization JSON-LD `sameAs` includes `https://agnt.newsroom`.

## Changed files

- `src/components/layout/Footer.tsx`
- `src/app/about/page.tsx`
- `src/app/page.tsx`
- `src/components/layout/__tests__/Footer.test.tsx`
- `src/lib/__vitest__/seo-crosslink-agn-793.test.ts`

## Verification evidence

Executed scoped tests only:

```bash
npx vitest run src/components/layout/__tests__/Footer.test.tsx src/lib/__vitest__/about-page-seo.test.tsx src/lib/__vitest__/seo-crosslink-agn-793.test.ts
```

Result:

- Test files: 3 passed
- Tests: 5 passed

## Notes

- A pre-existing unrelated failure exists in `src/lib/__vitest__/home-page-honesty.test.ts` (consensus panel threshold assertion). It was not touched by AGN-793 and is outside this issue scope.

## Next action

Confirm reciprocal link from `agnt.newsroom` back to STARSCREENER and, if missing, open the paired implementation issue on the agnt.newsroom repo to complete bi-directional SEO linkage.
