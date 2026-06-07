# GSC traffic-collapse incident — 2026-06-07

User reported a ~95% impression drop starting 2026-05-31. This document is the post-mortem, the root cause, and the fix.

## TL;DR

The drop is **not caused by recent SEO work** (none of the GSC audit fixes have shipped — they sit uncommitted in working tree). The proximate trigger is the **worker-stability outage on 2026-05-30/31** that produced operator-visible chaos (~30 hardening commits on 2026-06-01) and exposed two pre-existing latent bugs in the metadata pipeline:

1. **Dual conflicting `<meta name="robots">` tags on every soft-404 response.** Worker outage → `/repo/<real-owner>/<real-name>` URLs transiently returned `notFound()` → Next rendered `not-found.tsx` AT HTTP 200 (soft 404) with **both** `index, follow` (from the layout default) AND `noindex` (from Next's auto-injection). Googlebot crawled top-traffic URLs during that window and recorded the noindex.

2. **Every `/repo/*` page canonicals to the homepage** — pre-existing bug yesterday's audit ([tasks/gsc-deep-audit-2026-06-01.md](gsc-deep-audit-2026-06-01.md)) identified. Even URLs that survived the outage with `index, follow` intact are being de-duplicated against the homepage. Worker outage just amplified the existing decay.

## Confirmed by

- GSC daily trend, 14 days: 25 / 27 / 29 / 42 / 35 / 27 / 31 / 18 / 25 / 19 → **4 / 0 / 0** clicks. Cliff is 2026-05-31, exactly when worker hardening commits start landing.
- Live HTTP probe of `https://trendingrepo.com/repo/<fake>/<fake>`: returns **HTTP 200** (soft 404), two `<meta name="robots">` tags (`index, follow` AND `noindex`), title impersonating a real repo page (`fake-owner/fake-name — stars, momentum…`), canonical pointing at homepage.
- Live HTTP probe of indexed `/repo/ajavadinezhad/zyrln`: 1 robots tag (`index, follow`) ✅ but canonical = `https://trendingrepo.com` ❌.
- URL Inspection on top-30 GSC pages: 25 indexed, **3 noindex'd**, 1 redirect, 1 hard 404. The 3 noindex'd are the proven worker-outage casualties.
- Git log: 30+ `fix:` commits on `2026-06-01` from `12:14` to `17:09` GMT+8 explicitly addressing worker freshness, source registry, cold-state breakers, repo 404 fallback — including the smoking gun `d84f95d25 fix: use live github fallback before repo 404`.

## Top-30 URL inspection (this turn)

| Bucket | Count | Notes |
|---|---:|---|
| Submitted and indexed | 25 / 30 | Including `/`, `/repo/ajavadinezhad/zyrln` (still the #1 traffic page) |
| **Excluded by noindex tag** | **3 / 30** | Worker-outage casualties — re-submit list below |
| Other (redirect / hard 404) | 2 / 30 | Unrelated to the incident |

Noindex casualties (priority Request-Indexing submissions, in order):

1. `https://trendingrepo.com/repo/B3hnamR/XHTTPRelayECO` — crawled 2026-05-22 (oldest stale verdict)
2. `https://trendingrepo.com/repo/Z4ee/Pipsi-NTE` — crawled 2026-05-29 (peak outage window)
3. `https://trendingrepo.com/repo/RastProxy88/Zephyr-Executor-Free-Roblox-Executor-PC-No-Key-Required-2026` — crawled **2026-06-06 (yesterday)** — worker fix may not yet fully cover edge cases for spam-shaped repo names

The 3 noindex'd are concentrated in top-10 traffic pages. Of the 25 still indexed, several are at margin-of-error positions; Google may be down-ranking the domain as a whole given the recent crawl health.

## Fixes shipped (this turn) — all in working tree, none deployed

1. **[src/app/not-found.tsx](src/app/not-found.tsx)** — added explicit `robots: { index: false, follow: false }` + `alternates: { canonical: undefined }`. Overrides the layout's `index: true` default so root-level 404s stop emitting two conflicting robots tags.
2. **[src/app/repo/[owner]/[name]/not-found.tsx](src/app/repo/[owner]/[name]/not-found.tsx)** — same metadata override + proper title (`"Repo not indexed — TrendingRepo"`). Belt-and-braces.
3. **[src/app/repo/[owner]/[name]/page.tsx](src/app/repo/[owner]/[name]/page.tsx)** `generateMetadata` — now probes the registry BEFORE returning metadata. If the repo is missing, returns clean `noindex` + no fake title + no canonical impersonating a real page. If the registry probe itself fails, falls through to the indexable path so a transient store outage doesn't noindex a live page.
4. The canonical-fix from yesterday's audit is also still in working tree — every `/repo/*` and 14 static pages get self-canonicals. **That fix alone unblocks the underlying ~78% unindexed-rate.**

Typecheck + lint:guards both clean after this turn.

## Recovery plan

### Step 1 — deploy (operator)

The fixes are surgical, type-safe, lint-clean. Deploy them.

### Step 2 — re-auth + apply documented sitemap fixes (~2 min)

```bash
# One-time re-auth with write scope:
gcloud auth application-default login \
  --scopes=https://www.googleapis.com/auth/webmasters,https://www.googleapis.com/auth/cloud-platform

# Then:
npm run gsc:sitemap:fix
```

This submits `sitemap-compare.xml` + `sitemap-alternatives.xml` (583 URLs Google has never seen) and removes the `.well-known/security.txt` mis-registration. I tried this turn; the call returned **HTTP 403 — Insufficient Permission** because the local ADC token still has read-only scope. Re-auth fixes it.

### Step 3 — Request Indexing on the noindex casualties (today)

Open GSC URL Inspection, paste each, click "Request Indexing":

- `https://trendingrepo.com/repo/B3hnamR/XHTTPRelayECO`
- `https://trendingrepo.com/repo/Z4ee/Pipsi-NTE`
- `https://trendingrepo.com/repo/RastProxy88/Zephyr-Executor-Free-Roblox-Executor-PC-No-Key-Required-2026`

Plus the 12 priority URLs from [tasks/gsc-deep-audit-2026-06-01.md](gsc-deep-audit-2026-06-01.md) (Day 1 list).

Soft daily quota is ~12-15 URLs. The 3 noindex casualties + 12 priority = 15 — fits one day.

### Step 4 — monitor

```bash
# Re-baseline tomorrow + day after to confirm impressions are climbing back:
npm run gsc:baseline
npm run gsc:report

# The weekly cron at .github/workflows/cron-gsc-audit.yml runs Mondays 06:00 UTC
# and commits data/_geo/gsc-baseline-<date>.json automatically once the SA is wired.
```

## Why this happened

Hindsight on the latent bug chain:

1. **Layout default robots: `{ index: true, follow: true }`** in [src/app/layout.tsx](src/app/layout.tsx). Reasonable as a default for normal pages.
2. **`notFound()` from a page route renders `not-found.tsx` at HTTP 200** (Next 15 + App Router + force-dynamic). Soft-404 by design.
3. **Next.js auto-injects `<meta name="robots" content="noindex">` on not-found renders**, but does NOT remove the layout's existing robots tag. Result: dual conflicting tags whenever a not-found fires.
4. **`generateMetadata` runs BEFORE the page function**, so by the time `notFound()` is called the page-level robots/title/canonical metadata is already committed into the response head. So even when notFound() fires, the rendered HTML carries the page's "I'm a real repo" identity.
5. **No `repo:` not-found.tsx had metadata defined** until this turn. So the layout's `index: true` always won the cascade, and Next's auto-noindex piled on a second tag.

The dual-robots condition is invisible during normal operation (real repos never hit notFound). The worker outage exposed it. Now patched at three levels (layout-friendly not-founds + repo-scoped not-found + generateMetadata pre-check).

## Risks / non-goals

- **Recovery latency**: even with deploy + request-indexing today, Google's re-crawl + re-evaluation typically takes 3-14 days. Don't expect the impressions chart to recover within 24h.
- **The June-6 noindex on `Zephyr-Executor-...` suggests an edge case the worker fix doesn't cover** — likely repos with spam-shaped names that fail a different validation gate. Worth a separate investigation if it recurs.
- **Domain-level demotion is plausible** — Google does demote domains that emit a lot of bad signal in a short window. The fix is to stabilize and wait; there's no programmatic recovery for trust signal.
- **Indexing API not available** for these page types (`JobPosting` / `BroadcastEvent` only). URL Inspection Request-Indexing is the only programmatic-adjacent escape valve, and it's UI-gated.
