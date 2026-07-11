# STACK — Tech stack pins (versions verified from `package.json` 2026-06-27)

## Framework + runtime

| Package | Version (from `package.json`) | Notes |
|---|---|---|
| `next` | `15.5.18` (EXACT-PINNED, no caret — `package.json:158`) | App Router + Turbopack dev. `output: "standalone"` (`next.config.ts:72`) for Docker. |
| `react` | `19.1.4` (EXACT-PINNED — `package.json:163`) | |
| `react-dom` | `19.1.4` (EXACT-PINNED — `package.json:164`) | |
| `typescript` | `^5` (dev — `package.json:200`) | Strict per `CLAUDE.md:24`. |
| `node` | `22.x` (pinned via `engines.node` — `package.json:15-17`) | |
| Dev port | **3023**, NOT 3000 | `npm run dev` → `next dev --turbopack -p 3023` (`package.json:35`). |

## Data layer

| Package | Version | Notes |
|---|---|---|
| `ioredis` | `^5.10.1` (`package.json:155`) | HOSTUP-internal TCP Redis. Three-tier data-store read: Redis → bundled file → in-memory LKG (`CLAUDE.md:26`, `src/lib/data-store.ts`). |
| `@upstash/redis` | `^1.37.0` (`package.json:151`) | Legacy Upstash REST fallback. **Pick exactly ONE Redis pair**: `REDIS_URL` (ioredis) OR `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` (Upstash) — never both (`CLAUDE.md:42`). |
| `drizzle-orm` | `^0.45.2` (`package.json:152`) | Postgres ORM. Drizzle-using pages must `export const dynamic = "force-dynamic"` (`CLAUDE.md:92`) — db client throws on first property access without `DATABASE_URL` at build time. |
| `drizzle-kit` | `^0.31.10` (dev — `package.json:193`) | Migrations: `db:generate` / `db:migrate` / `db:push` / `db:studio` (`package.json:137-140`). |
| `postgres` | `^3.4.5` (`package.json:160`) | postgres.js driver behind Drizzle. |

## Auth + payments

| Package | Version | Notes |
|---|---|---|
| `@clerk/nextjs` | `^6.21.0` (`package.json:147`) | Cookie-based admin session per `CLAUDE.md:29` (commit `e2a0908`). CSP allowlist for `*.clerk.dev`, `*.clerk.com`, `clerk.trendingrepo.com` baked into `next.config.ts:240-271`. |
| `svix` | `^1.45.1` (`package.json:168`) | Clerk webhook verification. |
| `stripe` | `^17.7.0` (`package.json:167`) | Configured, not billed yet (`CLAUDE.md:30`). |

## UI

| Package | Version | Notes |
|---|---|---|
| `echarts` | `^6.0.0` (`package.json:153`) | Charts via `src/components/charts/EChart.tsx` + `src/lib/charts/theme/` (per `CLAUDE.md:25`). |
| `framer-motion` | `^12.38.0` (`package.json:154`) | Animation. **Intentionally excluded** from `optimizePackageImports` — its 12.x ESM barrel breaks Next 15's RSC chunk graph (`next.config.ts:36-45`). |
| `zustand` | `^5.0.12` (`package.json:170`) | Client state. |
| `tailwindcss` | `^4` (dev — `package.json:198`) | Tailwind 4 + `@tailwindcss/postcss` (`package.json:185`). |
| `lucide-react` | `^1.8.0` (`package.json:157`) | Icons. In `experimental.optimizePackageImports` (`next.config.ts:44`). |
| `@dnd-kit/core` | `^6.3.1` (`package.json:148`) | Drag-and-drop (watchlist / tier list). |
| `sonner` | `^2.0.7` (`package.json:166`) | Toasts. |

## Validation + observability

| Package | Version | Notes |
|---|---|---|
| `zod` | `^4.3.6` (`package.json:169`) | Zod on all API boundaries (`CLAUDE.md:27`). Lint guard `lint:zod-routes` (`package.json:45`). |
| `@sentry/nextjs` | `^10.51.0` (`package.json:150`) | `withSentryConfig` wrap is **production-only** — skipped in `next dev` to avoid Turbopack MODULE_UNPARSABLE bug (`next.config.ts:297-305`). |
| `posthog-js` | `^1.372.3` (`package.json:161`) | |
| `posthog-node` | `^4.18.0` (`package.json:162`) | |
| `resend` | `^6.12.2` (`package.json:165`) | Email (digest, alerts). |

## External data providers

| Provider | Notes |
|---|---|
| **Apify `apidojo~tweet-scraper`** | Twitter collector. Verified in `scripts/_apify-twitter-provider.ts:25` — `DEFAULT_ACTOR = "apidojo~tweet-scraper"`. Required env: `APIFY_API_TOKEN`; optional override `APIFY_TWITTER_ACTOR`. Cookie-based providers dead post-2026 (`CLAUDE.md:49`, `CLAUDE.md:81`). |
| GitHub API | `GITHUB_TOKEN` required for prod (`CLAUDE.md:42`). |
| Reddit / HN / Bluesky / ProductHunt / dev.to / Lobsters / arXiv / HuggingFace / npm | Native scrapers under `scripts/` (no third-party). |

## Testing

| Package | Version | Notes |
|---|---|---|
| `vitest` | `^3.2.4` (dev — `package.json:201`) | Hooks tests via `npm run test:hooks` (`package.json:81`). |
| `@vitejs/plugin-react` | `^4.7.0` (dev — `package.json:191`) | |
| `@playwright/test` | `^1.59.1` (dev — `package.json:179`) | E2E. `npm run test:e2e` (`package.json:83`). |
| `@testing-library/dom` / `react` | `^10.4.1` / `^16.3.2` (`package.json:186-187`) | |
| `happy-dom` | `^20.9.0` (dev — `package.json:196`) | |
| `tsx` | `^4.21.0` (dev — `package.json:199`) | Runs `*.ts` scripts (`collect:twitter`, all `compute:*`, `check:*`, `sweep:*`, `snapshot:*`, `freshness:check`). |

## Dev tooling

| Package | Version | Notes |
|---|---|---|
| `@next/bundle-analyzer` | `^16.2.4` (dev — `package.json:178`) | `npm run analyze`. |
| `storybook` | `^8.6.18` (dev — `package.json:197`) | `npm run storybook` on port 6006 (`package.json:36`). |
| `eslint` / `eslint-config-next` | `^9` / `15.5.18` (dev — `package.json:194-195`) | |
| `cross-env` | `^10.1.0` (dev — `package.json:192`) | Windows env-var bridge. |

## Quirks (NOT defaults — they will bite if forgotten)

| Quirk | Where | Source |
|---|---|---|
| Dev server on **port 3023**, not 3000 or 3033 | `package.json:35,41` | `CLAUDE.md:54` |
| `ioredis` + `@upstash/redis` are **`serverExternalPackages`** — bundler skips them on server, client-aliased to empty | `next.config.ts:161` + `next.config.ts:143-155` | `CLAUDE.md:26,42` |
| Node built-ins (`fs`, `net`, `tls`, `dns`, `os`, `crypto`, `stream`, `zlib`, `path`) stubbed to `false` in client webpack bundle + to `src/lib/empty-module.js` in turbopack | `next.config.ts:113-155` | inline comment |
| **Drizzle pages cannot static-prerender without `DATABASE_URL`** — mark `export const dynamic = "force-dynamic"` | any page reading drizzle | `CLAUDE.md:92` |
| **Next 15 forbids non-handler exports from `route.ts`** — `deriveHealth` / `verifyWebhookSecret` etc. must move to sibling lib files | `route.ts` | `CLAUDE.md:91` |
| `framer-motion` is **excluded** from `optimizePackageImports` — its barrel breaks RSC `/_not-found` prerender | `next.config.ts:36-45` | inline comment |
| Sentry wrap is **production-only** (Turbopack incompat) | `next.config.ts:297-305` | inline comment |
| **CSS edits + `.next` can be silently reverted by OneDrive sync** on Windows when repo lives in a synced folder | repo location | `CLAUDE.md:43`, MEMORY `project_onedrive_dev_server_block` |
| **Apify `apidojo~tweet-scraper`** is the only sanctioned Twitter source — direct GraphQL returns HTTP 200 + empty body (anti-bot) | `scripts/_apify-twitter-provider.ts` | inline `Why:` comment lines 6-11 |
| `read-existing → union → dedupe → keep top 50` is mandatory for every collector | `scripts/scrape-*.mjs` | `CLAUDE.md:89`, `docs/INGESTION.md` |

## Import alias

`@/*` → `src/*` (Next.js App Router default).
