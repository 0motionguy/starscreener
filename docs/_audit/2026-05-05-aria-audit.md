---
last-verified: 2026-05-05
verified-by: claude
status: snapshot
audit: aria
---

# ARIA audit — 8 P0 routes (W2 follow-up)

**Wave 4 hardening · AGN-803 · W4-G**

## Scope

W2 hardening audited only the `/signals` filter chips (the original
`<a aria-pressed>` defect class). W4-G extends that audit to **all P0
routes** via Playwright DOM scan against the live Vercel preview. Run
on commit `6acd309629c1a44feed237a0b080ba3111bcb930` against
`https://starscreener-git-bot-frontendagn-522-kermits-projects-6330acd4.vercel.app`.

Read-only. No `axe-core` (not installed) — implements seven
WCAG-anchored DOM checks manually. Runner script:
[.tmp-agn803-aria-sweep.js](../../.tmp-agn803-aria-sweep.js).
Raw machine output: [.tmp-agn803-aria-sweep.json](../../.tmp-agn803-aria-sweep.json).

## Routes audited

| # | Route | HTTP | Headings | Buttons | Images | Inputs | Audit ran? |
|---|---|---|---|---|---|---|---|
| 1 | `/` | 200 | 14 | 125 | 87 | 1 | yes |
| 2 | `/signals` | **500** | — | — | — | — | **no — preview broken** |
| 3 | `/githubrepo` | 200 | (see notes) | — | — | — | yes |
| 4 | `/trends` | 200 | 2 | 10 | 1 | 1 | yes |
| 5 | `/skills` | **500** | — | — | — | — | **no — preview broken** |
| 6 | `/mcp` | 200 | — | — | — | — | yes |
| 7 | `/top10` | 200 | 3 | 10 | 11 | 1 | yes |
| 8 | `/categories` | **500** | — | — | — | — | **no — preview broken** |

DOM stats above sampled via separate inspection pass. Three routes
returned Next 500 page (`<title>500: Internal Server Error</title>`,
26 chars body) — those are not the real app HTML. They must be
re-audited once the underlying preview-server-side errors are fixed.
The 500s themselves are not ARIA defects; they are server-render
failures upstream of any DOM the audit could check.

## Checks performed

For each route, the in-page audit counted:

| # | Check | What it catches | WCAG anchor |
|---|---|---|---|
| 1 | `<a aria-pressed>` | anchor masquerading as toggle button | 4.1.2 — role/value mismatch |
| 2 | `<a aria-checked>` | anchor masquerading as checkbox/radio | 4.1.2 |
| 3 | `aria-labelledby` → missing target ID | dangling reference; SR reads nothing | 1.3.1 / 4.1.2 |
| 4 | `<button>` no accessible name | text + aria-label + aria-labelledby + title + inner-img-alt + svg-label all empty | 4.1.2 |
| 5 | `<img>` missing `alt` attribute | screen reader announces filename or skips | 1.1.1 |
| 6 | form input no label | text/email/number/tel/url/password/textarea/select with no label, aria-label, aria-labelledby, title, wrapping `<label>`, or `<label for>` | 1.3.1 / 3.3.2 |
| 7 | headings out of order | first heading not h1, OR jump > 1 level (e.g. h2 → h4) | 1.3.1 |

`alt=""` is treated as valid (decorative-image convention).
Placeholder text is intentionally NOT counted as a label (per WCAG;
placeholders are not accessible names). The audit reports a sample
selector hint for each violation (capped 5 per check per route).

## Findings

| Route | (1) a[aria-pressed] | (2) a[aria-checked] | (3) labelledby-dangling | (4) button-no-name | (5) img-no-alt | (6) input-no-label | (7) heading-order |
|---|---|---|---|---|---|---|---|
| `/` | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `/signals` | (n/a — 500) | (n/a) | (n/a) | (n/a) | (n/a) | (n/a) | (n/a) |
| `/githubrepo` | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `/trends` | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `/skills` | (n/a — 500) | (n/a) | (n/a) | (n/a) | (n/a) | (n/a) | (n/a) |
| `/mcp` | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `/top10` | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `/categories` | (n/a — 500) | (n/a) | (n/a) | (n/a) | (n/a) | (n/a) | (n/a) |

**Total violations across audited routes: 0.**
**CRITICAL violations (anchor-with-pressed/checked) anywhere: 0.**

## Why zero?

Spot-check on `/` confirms the audit is genuinely reaching real DOM:
125 buttons, 87 images, 14 headings inspected; sample buttons all
have `aria-label="Open menu"`, `aria-label="Set surface scale to
Compact"`, etc. The site uses well-labelled icon buttons throughout.
No `<a aria-pressed>` or `<a aria-checked>` was found on any 200
route — the W2 fix on `/signals` chips appears to be the only place
that pattern previously existed.

This is an **accurate negative result** on the audited routes, not a
broken script.

## Recommendations

### TOP PRIORITY — re-audit the three 500 routes

`/signals`, `/skills`, `/categories` returned Next.js 500 from the
preview server. The W4-G audit cannot run against a 500 page. Track
sequence:

1. Fix the preview-server-side errors causing the 500s (separate
   workstream — likely a layout-init throw on missing env, per
   memory `project_vercel_preview_500s`).
2. Re-run `node .tmp-agn803-aria-sweep.js` (script is idempotent;
   override base via `AUDIT_BASE_URL=...`).
3. If new violations surface, file CRITICAL fixes per the W2 pattern
   (anchor-with-aria-pressed-or-checked → convert to button, OR drop
   the boolean attribute).

The `/signals` chip family is the route where the original W2 defect
lived; it is the most likely 500 to surface fresh ARIA violations
once it renders.

### P2 — extend audit to dynamic-route templates

This audit covered 8 static P0 routes. Dynamic-route templates
(`/repo/[owner]/[name]`, `/categories/[slug]`, `/skills/[slug]`,
`/mcp/[slug]`, `/digest/[date]`, `/top10/[date]`, `/u/[handle]`,
`/agent-repos/[slug]`, `/consensus/[owner]/[name]`,
`/tierlist/[shortId]`, `/repo/[owner]/[name]/star-activity`) emit
template-driven markup that may diverge from static routes. Sample
1 representative slug per template in a future sweep.

### P3 — install axe-core for richer audit

Manual 7-check sweep covers the loud-failure surface. `axe-core` (or
`@axe-core/playwright`) covers ~90 rules including color contrast,
ARIA role validity, focus order, landmark uniqueness. Adding it
gates regression on the full WCAG 2.1 AA surface, not just the
hand-picked seven.

### Clean (no action)

The 5 audited routes (`/`, `/githubrepo`, `/trends`, `/mcp`,
`/top10`) ship clean against this audit. No source-code change is
warranted in W4-G itself — by design this agent is read-only on
`src/`.

## Method (reproduce)

```bash
# from repo root
node .tmp-agn803-aria-sweep.js
# or override base
AUDIT_BASE_URL=http://localhost:3023 node .tmp-agn803-aria-sweep.js
```

Output is JSON to `.tmp-agn803-aria-sweep.json` and stdout summary.
Re-run after each route's preview goes green to refresh the table
above.
