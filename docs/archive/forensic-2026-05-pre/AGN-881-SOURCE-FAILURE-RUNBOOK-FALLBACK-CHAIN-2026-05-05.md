# AGN-881 [FRESH-08] Source-failure runbook + fallback chain

- Timestamp: 2026-05-05
- Owner: Data Pipeline Engineer
- Scope: collector/source freshness failures, fallback behavior, and operator recovery steps

## Verified heartbeat evidence

- Mandatory opening docs completed (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`).
- `npm run freshness:check` on 2026-05-05 failed with:
  - `GET http://localhost:3023/api/health?soft=1 failed: HTTP 500 Internal Server Error`
  - Interpretation: `localhost:3023` is reachable (not missing), but product state is stale/degraded.

## Source-of-truth + fallback chain

Canonical read/write chain is implemented in `src/lib/data-store.ts`:

1. Tier 1 read: Redis (`source="redis"`, `fresh=true` only when valid meta timestamp exists).
2. Tier 2 read fallback: bundled file `data/<key>.json` (`source="file"`, `fresh=false`).
3. Tier 3 read fallback: in-memory last-known-good (`source="memory"`, `fresh=false`).
4. Total miss: `source="missing"`, no payload.

Write behavior:

- Primary durable target is Redis.
- If Redis is absent and `mirrorToFile` is false, write fails hard (`DataStoreFatalError`).
- If Redis is absent and `mirrorToFile` is true, file write is the fallback path.

## Failure classes (mask + categorize)

Use typed error categories from `src/lib/errors.ts` and never raw untyped backend failures:

- `recoverable`: transient/network/retry-safe failures.
- `quarantine`: token/rate-limit/provider-ban class failures; isolate or rotate key/instance.
- `fatal`: no valid path left; operator action required.

Source-specific examples:

- GitHub: `GithubRateLimitError`, `GithubInvalidTokenError`, `GithubPoolExhaustedError`
- Twitter: `ApifyQuotaError`, `NitterAllInstancesDownError`, `TwitterAllSourcesFailedError`
- Data-store: `DataStoreFatalError`

Rule: token/rate-limit failures are surfaced as typed errors and not as opaque generic failures.

## Detection and triage commands

1. Freshness gate:

```bash
npm run freshness:check
```

2. Source sidecar health (meta files under `data/_meta`):

```bash
node scripts/check-source-health.mjs
```

3. Workflow lane check (example source):

```bash
gh run list --workflow scrape-trending.yml --limit 7 --json databaseId,status,conclusion,createdAt,updatedAt,headSha,url
gh run view <run-id> --log-failed
```

4. Store fallback verification (when source is non-green):

- Confirm key freshness via app endpoints (`/api/cron/freshness/state`).
- Confirm reader path still serves non-empty payload through file/memory fallback (degraded but alive).

## Recovery decision tree

1. If workflow failed but upstream/service reachable:
   - Re-run workflow once.
   - If green and freshness recovers, close incident.

2. If workflow repeatedly fails and error is token/rate-limit class:
   - Treat as `quarantine`.
   - Rotate/replace key pool entry or provider credential.
   - Escalate to CTO if token/provider config is missing.

3. If Redis path fails but file/memory serves:
   - Treat as degraded read path.
   - Keep service alive on fallback while Redis credentials/connectivity are restored.
   - Escalate to CTO when Redis provider config/credentials are missing.

4. If all tiers fail (`source="missing"` for critical key):
   - Treat as `fatal`.
   - Incident remains open until at least one durable producer path is restored.

## Acceptance checks before closure

- `npm run freshness:check` no longer fails for blocking sources.
- A successful collector run exists for the impacted source lane.
- Data-store reads for impacted keys return Redis tier or documented degraded fallback with bounded age.
- Typed error category for the failure is recorded (recoverable/quarantine/fatal), not generic untyped failure.
