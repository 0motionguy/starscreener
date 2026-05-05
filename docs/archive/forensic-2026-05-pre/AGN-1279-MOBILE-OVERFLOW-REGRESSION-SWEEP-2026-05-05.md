# AGN-1279 Mobile Overflow Regression Sweep (2026-05-05)

Generated at: 2026-05-05T03:14:00.774Z
Viewport: `390x844`
Target: `https://trendingrepo.com`

| Route | HTTP | scrollWidth | viewport | overflow_px | Top offender |
|---|---:|---:|---:|---:|---|
| `/` | 200 | 399 | 390 | 9 | table.tbl.tbl-rich.tbl-live (1084px) |
| `/skills` | 200 | 390 | 390 | 0 | none |
| `/mcp` | 200 | 390 | 390 | 0 | none |
| `/signals` | 200 | 390 | 390 | 0 | none |
| `/compare` | 200 | 390 | 390 | 0 | none |
| `/top10` | 200 | 390 | 390 | 0 | none |
| `/twitter` | 200 | 390 | 390 | 0 | none |

## Repro Steps
1. Open route at 390x844 viewport.
2. Compare `document.documentElement.scrollWidth` vs `clientWidth`.
3. Any positive delta is page-level horizontal overflow regression.

## Ownership Hints
- Home overflow source (if present): `src/components/home/LiveTopTable.tsx` + mobile shell/layout rules in `src/app/globals.css`.
- Sidebar/top-page nav visibility context: `src/components/layout/SidebarContent.tsx` and `docs/SITE-WIREMAP.md`.