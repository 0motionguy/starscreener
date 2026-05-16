# WHERE THINGS RUN — `0motionguy/starscreener` (product: TrendingRepo)

One-page topology reference. Update whenever a surface moves.

**Generated**: 2026-05-16 (Sprint 4.4 of TOOLBOX unification audit). Verify against live state if older than a month.

> Repo name is `starscreener`; product / public domain is `trendingrepo.com`. Folder is `/c/dev/trendingrepo/`. Don't conflate the three.

---

## Build / CI

| What | Where | Notes |
|---|---|---|
| Verify (typecheck + test + build) | **TOOLBOX VPS** `[self-hosted, toolbox]` runner | per Phase 4 audit, runs `cron-warmup.yml` + `uptime-monitor.yml` on self-hosted (3 jobs). Sprint 2.1 will flip more workflows. |
| Cron-y data jobs | Until Sprint 3.2 fully lands: 74 GH Actions workflows on `ubuntu-latest` (many are `cron:`-triggered scrapers). After Sprint 3.2: 34 retired (already in flight via PR #1486 + later batches), remainder runs on TOOLBOX worker via in-process croner. |
| Action `uses:` pinning | SHA-pinned (Sprint 2.3, PR #1480 — 5 unique actions across 50+ workflows). Dependabot weekly auto-PRs. |

## Deploy

| Service | Where | Image / Build |
|---|---|---|
| trendingrepo-web | **Vercel** | Next.js 15. Auto-deploys on push to main. Domain: `trendingrepo.com` (Vercel A 76.76.21.21 per memory `feedback_vercel_dns_auto_revert_2026_05_14` — Vercel auto-restores its A record; Mirko removed CF tunnel takeover). |
| trendingrepo-worker | **TOOLBOX VPS** as Docker tenant | Image at `ghcr.io/0motionguy/starscreener-worker:<tag>` (verify via verify.yml). Runs 44 in-process croner fetchers per `apps/trendingrepo-worker/src/registry.ts`. Compose path: `/opt/toolbox-trendingrepo-worker/` (Sprint 1.5 noted as subtree-duplicate candidate). |
| trendingrepo-mcp | **npm package** | `npm publish` from `mcp/` subdir on tag. Distribution only; runs in user clients (Claude Desktop, etc.). |

## Cron / scheduler

| What | Where | Source |
|---|---|---|
| 44 data fetchers (HN, Reddit, Bluesky, dev.to, ProductHunt, Lobsters, npm, pypi, etc.) | **TOOLBOX VPS** trendingrepo-worker container, in-process croner | `apps/trendingrepo-worker/src/registry.ts` FETCHERS array (45 fetchers as of 2026-05-16). |
| App-cron (alerts, referrals, dispatch) | **Vercel Cron** | `vercel.json` — currently 3 active (`/api/cron/alerts/dispatch` every minute = ~43k inv/mo, alerts/cleanup daily, referrals/qualify hourly). Sprint 3.2 Phase B moves these to TOOLBOX. |
| Cleanup / health (ad-hoc) | **GH Actions ubuntu-latest** | 16 cron-driven app-cron/health/ops workflows kept on GH Actions for clean-room (per duplicate matrix). |
| Sprint 3.2 retirements | Sprint 3.2 PR #1486 retired 13 pure-double-invocation `refresh-*` workflows. 21 more MIGRATE candidates queued in subsequent PRs. |

## Data

| What | Where | Backup |
|---|---|---|
| Source of truth (writes) | **Supabase** project `yzhh...bytn` — SHARED with aiso (Sprint 5.1 splits this). trendingrepo writes only to `tr.*` schema. | Supabase Pro PITR. Plus weekly Redis snapshot to R2. |
| Redis (cache + rate-limit) | Currently 2 providers (Railway `shor...t.net:16128` + Upstash REST fallback). Sprint 3.3 consolidates to `toolbox-redis-1` on TOOLBOX VPS. | Weekly snapshot to R2 (existing). |
| Object storage | None directly. Vercel handles ISR + image assets. |

## Secrets

| Surface | Location | Editor of last resort |
|---|---|---|
| Vercel env | `vercel env ls production` — 44 keys (per Phase 3 audit). Source of truth post-Sprint-3.1: sops-encrypted `trendingrepo.enc.env` in `0motionguy/toolbox-ops`. | Mirko |
| GH Actions secrets | `gh secret list --repo 0motionguy/starscreener` — 22 keys, all <26d old (Phase 3 audit). | Mirko |
| trendingrepo-worker runtime env | **TOOLBOX VPS** `/opt/toolbox-trendingrepo-worker/.env` (mode 0600 root). Decrypted from `toolbox-ops/toolbox-trendingrepo-worker.enc.env` by `toolbox-secrets-decrypt.service` (Sprint 2.2). |
| sops age master key | Local: `~/.config/sops/age/toolbox-ops.txt` · VPS: `/root/.config/sops/age/toolbox-ops.txt`. Backup: Mirko's password manager. |

**SHARED Supabase warning**: aiso writes to the same Supabase project. Any secret rotation = joint operation. Per Sprint 5.1 outcome (schema isolation), trendingrepo writes only to `tr.*` with row-count quota.

## Public surface

| Endpoint | Hostname | Tier |
|---|---|---|
| Web | `trendingrepo.com` (Vercel) | free |
| MCP package | npm `trendingrepo-mcp` | free |

Paid x402 surfaces are on the TOOLBOX side (`api.aiso.tools/v1/x402/*` + `mcp.aiso.tools`), not on trendingrepo.com — trendingrepo.com merely proxies the manifest (per memory `feedback_trendingrepo_x402_stub` SUPERSEDED → `project_commerce_live`).

## Rollback

| Surface | Rollback command |
|---|---|
| Vercel (web) | `vercel rollback <deployment-url>` (or via dashboard) |
| trendingrepo-worker container | `ssh toolbox 'cd /opt/toolbox-trendingrepo-worker && sed -i "s|image: ghcr.io/0motionguy/starscreener-worker:.*|image: ghcr.io/0motionguy/starscreener-worker:<PREV_TAG>|" docker-compose.yml && docker compose up -d'` |
| Workflow YAML | `git revert <merge-commit>` + push |
| Migration | `supabase migration repair` OR manual `psql` revert |
| Secrets rotation | Roll back one sops commit in toolbox-ops + restart decrypt service |

## Session start checklist

1. Read `CLAUDE.md`.
2. Read `WHERE-THINGS-RUN.md` (this file).
3. Read `HANDOVER-current.md` if it exists.
4. Run `git status --porcelain && git log -1 --oneline`.
5. Run `npm run freshness:check` to confirm worker fetchers are producing fresh data.
6. For VPS-touching work: `ssh toolbox 'docker ps --filter "name=trendingrepo-worker" --format "{{.Names}}|{{.Status}}"'`.

## See also

- `0motionguy/toolbox-ops` private repo — `ROTATION_LOG.md`, `RESTORE_DRILL.md`, `CADDY_ROUTES.md`, `INCIDENT_RUNBOOK.md`.
- `0motionguy/toolbox` repo — sister `WHERE-THINGS-RUN.md` covers the TOOLBOX-side stack (api, mcp, workers).
- `0motionguy/agnt` repo — `WHERE-THINGS-RUN.md` for the AISO product (aiso.tools).
