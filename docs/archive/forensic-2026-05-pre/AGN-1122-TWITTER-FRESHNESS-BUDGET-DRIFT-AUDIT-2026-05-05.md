# AGN-1122 Twitter freshness budget drift audit (2026-05-05)

## Scope
- Issue: `AGN-1122` (`[Sprint 1 audit] Twitter freshness budget drift audit`)
- Surface: Twitter collector freshness truth path (`collect-twitter` workflow, collector dual-write, freshness-state route)
- Verification timestamp: `2026-05-05` local heartbeat
- Audited commit: `f43c7ea7`

## Mandatory opening + freshness gate
- Mandatory opening bundle was re-read (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`).
- `npm run freshness:check` result: localhost `http://localhost:3023` reachable (not missing), but product stale.
- Freshness summary from the run:
  - `twitter`: `YELLOW`, `last_update=2026-05-04T03:39:14.754Z`, `age=16.8h`, budget `12h`
  - global: `green=40 yellow=9 red=1 dead=0 blocking_non_green=8 advisory_non_green=2`

## Evidence packet

### 1) Current freshness route points Twitter to a legacy slug
From `src/app/api/cron/freshness/state/route.ts`:
- Twitter source spec is:
  - `name: "twitter"`
  - `redisSlugs: ["twitter-trending"]`
  - budget `12h`

### 2) Active collector writes different keys
From `scripts/collect-twitter-signals.ts`:
- `mirrorTwitterFilesToDataStore()` writes:
  - `writeDataStore("twitter-repo-signals", ...)`
  - `writeDataStore("twitter-scans", ...)`
  - `writeDataStore("twitter-ingestion-audit", ...)`
- Collector also emits source meta:
  - `writeSourceMeta({ source: "twitter", ... })` -> expected file `data/_meta/twitter.json`

### 3) Workflow is configured for modern write set
From `.github/workflows/collect-twitter.yml` commit step paths:
- `.data/twitter-repo-signals.jsonl`
- `.data/twitter-scans.jsonl`
- `.data/twitter-ingestion-audit.jsonl`
- `data/_meta/twitter.json`
- `data/unknown-mentions.jsonl`

### 4) Workspace state shows drift symptoms
- Local `.data` files exist and were recently updated:
  - `twitter-repo-signals.jsonl` mtime `2026-05-04 11:26:24`
  - `twitter-scans.jsonl` mtime `2026-05-04 11:26:24`
  - `twitter-ingestion-audit.jsonl` mtime `2026-05-04 11:26:24`
- `data/_meta/twitter.json` is missing in current workspace.

### 5) Commit lineage indicates workflow commits continued recently
`git log -- .data/twitter-*.jsonl data/_meta/twitter.json` shows repeated refresh commits through:
- `fdac2d10` (`chore(data): refresh twitter signals 2026-05-04T01:34:50Z`)
- multiple prior 3-hourly refresh commits on 2026-05-03 and 2026-05-02.

### 6) Live GitHub Actions verification blocker
- `gh run list --workflow collect-twitter.yml` failed with `HTTP 401: Bad credentials`.
- This blocks direct API confirmation of last-run status in this heartbeat.

## Audit finding (root cause)
Twitter freshness budget is drifting because the freshness-state route is still keyed to legacy `twitter-trending`, while the production collector writes Twitter data to `twitter-repo-signals` / `twitter-scans` / `twitter-ingestion-audit` plus `data/_meta/twitter.json`. This creates false stale/yellow classification risk and decouples freshness state from actual collector outputs.

## Risk
- False negatives in freshness monitoring (Twitter marked stale even when collector writes are current).
- Incident triage noise and mis-prioritized recovery actions.
- Potential hidden true stale if `data/_meta/twitter.json` stops updating but route is not reading it.

## Remediation (next implementation heartbeat)
1. Update Twitter `SOURCE_SPECS` in `src/app/api/cron/freshness/state/route.ts` to use current writer keys:
   - Redis slugs: `twitter-repo-signals`, `twitter-scans`, and optionally `twitter-ingestion-audit`
   - Add `metaSource: "twitter"` so `data/_meta/twitter.json` participates in status.
2. Re-run `npm run freshness:check` and verify Twitter status is derived from active keys.
3. Re-verify workflow runs with valid GitHub credentials (or through CTO-provided evidence) because current CLI token is invalid.

## Escalation required
- Per guardrails, this heartbeat escalates credential dependency:
  - Blocker: GitHub CLI auth is invalid (`HTTP 401`) for workflow verification.
  - Needs: CTO/platform to rotate/provide valid GitHub token for this agent environment.
