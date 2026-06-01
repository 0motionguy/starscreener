# WHERE THINGS RUN — `0motionguy/starscreener` (product: TrendingRepo)

One-page topology reference. Update whenever a surface moves.

**Updated**: 2026-06-01 during HOSTUP production hardening. Verify against live state before deploying.

> Repo name is `starscreener`; product / public domain is `trendingrepo.com`. Folder is `/c/dev/trendingrepo/`. Don't conflate the three.

---

## Build / CI

| What | Where | Notes |
|---|---|---|
| Verify (typecheck + test + build) | Local worktree, GitHub Actions, and HOSTUP release builds | Before production claims, run `npm run health:prod` against Cloudflare -> HOSTUP. |
| Cron-y data jobs | **HOSTUP worker owns production data freshness.** GitHub Actions schedules that remain enabled should be live probes or explicit app-cron calls, not duplicate producers for worker-owned sources. |
| Action `uses:` pinning | SHA-pinned (Sprint 2.3, PR #1480 — 5 unique actions across 50+ workflows). Dependabot weekly auto-PRs. |

## Deploy

| Service | Where | Image / Build |
|---|---|---|
| trendingrepo-web | **HOSTUP / TOOLBOX VPS** behind Cloudflare Tunnel | Next.js 15 Docker tenant. Domain: `trendingrepo.com`. Verify with `curl -I https://trendingrepo.com` and expect `Server: cloudflare` with no `X-Vercel-*` headers. |
| trendingrepo-worker | **HOSTUP / TOOLBOX VPS** as Docker tenant | Local OCI image. Runs in-process croner fetchers from `apps/trendingrepo-worker/src/registry.ts` and writes `ss:data:v1:*` to HOSTUP-internal Redis. |
| trendingrepo-mcp | **npm package** | `npm publish` from `mcp/` subdir on tag. Distribution only; runs in user clients (Claude Desktop, etc.). |

## Cron / scheduler

| What | Where | Source |
|---|---|---|
| Data fetchers | **HOSTUP / TOOLBOX VPS** trendingrepo-worker container, in-process croner | `apps/trendingrepo-worker/src/registry.ts` FETCHERS array. Production health currently expects 50 active sources green and 17 disabled. Reddit is intentionally paused. |
| App-cron / ops calls | **GitHub Actions or HOSTUP worker**, depending on route | Keep GitHub schedules only for live probes or explicit app-cron HTTP calls. Do not reintroduce duplicate GitHub data producers for worker-owned sources. |
| Cleanup / health (ad-hoc) | **GH Actions ubuntu-latest** | Health/probe workflows are acceptable when they do not write duplicate data payloads. |
| Retired producers | 2026-06-01 hardening removed or disabled stale duplicate cron/workflow paths, including the noisy Collect Funding Signals workflow. |

## Data

| What | Where | Backup |
|---|---|---|
| Source of truth (writes) | **Supabase** project `yzhh...bytn` — SHARED with aiso (Sprint 5.1 splits this). trendingrepo writes only to `tr.*` schema. | Supabase Pro PITR. Plus weekly Redis snapshot to R2. |
| Redis (cache + rate-limit) | HOSTUP-internal Redis on the TOOLBOX network, with legacy Upstash only where explicitly configured. | Weekly snapshot to R2 (existing). |
| Object storage | None directly. Next.js static assets are served by the HOSTUP web container behind Cloudflare. |

## Secrets

| Surface | Location | Editor of last resort |
|---|---|---|
| Web runtime env | HOSTUP `.env.production` / toolbox ops secrets. Vercel must remain paused and Git-disconnected unless Mirko explicitly reverses the cost guard. | Mirko |
| GH Actions secrets | `gh secret list --repo 0motionguy/starscreener` — 22 keys, all <26d old (Phase 3 audit). | Mirko |
| trendingrepo-worker runtime env | **TOOLBOX VPS** `/opt/toolbox-trendingrepo-worker/.env` (mode 0600 root). Decrypted from `toolbox-ops/toolbox-trendingrepo-worker.enc.env` by `toolbox-secrets-decrypt.service` (Sprint 2.2). |
| sops age master key | Local: `~/.config/sops/age/toolbox-ops.txt` · VPS: `/root/.config/sops/age/toolbox-ops.txt`. Backup: Mirko's password manager. |

**SHARED Supabase warning**: aiso writes to the same Supabase project. Any secret rotation = joint operation. Per Sprint 5.1 outcome (schema isolation), trendingrepo writes only to `tr.*` with row-count quota.

## Public surface

| Endpoint | Hostname | Tier |
|---|---|---|
| Web | `trendingrepo.com` (Cloudflare Tunnel -> HOSTUP) | free |
| MCP package | npm `trendingrepo-mcp` | free |

Paid x402 surfaces are on the TOOLBOX side (`api.aiso.tools/v1/x402/*` + `mcp.aiso.tools`), not on trendingrepo.com — trendingrepo.com merely proxies the manifest (per memory `feedback_trendingrepo_x402_stub` SUPERSEDED → `project_commerce_live`).

## Rollback

| Surface | Rollback command |
|---|---|
| Web container | Retag/restart the previous HOSTUP Docker image, then smoke `https://trendingrepo.com`. |
| trendingrepo-worker container | `ssh toolbox 'cd /opt/toolbox-trendingrepo-worker && sed -i "s|image: toolbox-trendingrepo-worker:.*|image: toolbox-trendingrepo-worker:<PREV_TAG>|" docker-compose.yml && docker compose up -d'` |
| Workflow YAML | `git revert <merge-commit>` + push |
| Migration | `supabase migration repair` OR manual `psql` revert |
| Secrets rotation | Roll back one sops commit in toolbox-ops + restart decrypt service |

## Session start checklist

1. Read `CLAUDE.md`.
2. Read `WHERE-THINGS-RUN.md` (this file).
3. Read `HANDOVER-current.md` if it exists.
4. Run `git status --porcelain && git log -1 --oneline`.
5. Run `npm run freshness:check` for local/source checks and `npm run health:prod` for live HOSTUP Redis/worker truth.
6. For VPS-touching work: `ssh toolbox 'docker ps --format "{{.Names}}|{{.Image}}|{{.Status}}" | grep trendingrepo'`.

## See also

- `0motionguy/toolbox-ops` private repo — `ROTATION_LOG.md`, `RESTORE_DRILL.md`, `CADDY_ROUTES.md`, `INCIDENT_RUNBOOK.md`.
- `0motionguy/toolbox` repo — sister `WHERE-THINGS-RUN.md` covers the TOOLBOX-side stack (api, mcp, workers).
- `0motionguy/agnt` repo — `WHERE-THINGS-RUN.md` for the AISO product (aiso.tools).
