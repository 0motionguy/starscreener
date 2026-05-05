# AGN-1491 Release SRE control-plane endpoint and routing health matrix (2026-05-05)

Timestamp: `2026-05-05T09:19:15.1301732+08:00`
Workspace: `C:\Users\mirko\OneDrive\Desktop\STARSCREENER`

## Mandatory opening completion

Verified in this heartbeat (in order):
1. `CLAUDE.md`
2. `docs/ENGINE.md`
3. `docs/SITE-WIREMAP.md`
4. `docs/AUDIT-2026-05-04.md`
5. `docs/forensic/00-INDEX.md`
6. `tasks/CURRENT-SPRINT.md`
7. `tasks/BACKLOG.md`

## Freshness gate evidence

Command:
- `npm run freshness:check`

Result:
- `localhost:3023` is **not missing**.
- Product is **stale** (`health=stale`, `sourceStatus=ok`).
- Summary: `green=37 yellow=11 red=2 dead=0 blocking_non_green=11 advisory_non_green=2`.
- Blocking critical reds: `producthunt`, `trending-repos`.
- Additional blocking yellows include: `agent-commerce`, `awesome-skills`, `claude-rss`, `lobsters`, `npm`, `openai-rss`, `staleness-report`, `twitter`, `unknown-mentions`.
- `Sentry: MISSING`.

## Control-plane endpoint matrix (live)

| Endpoint | Status | Evidence |
|---|---:|---|
| `http://127.0.0.1:3100/api/issues/{issueId}` | 200 | Local Paperclip control-plane responds with issue payload |
| `http://192.168.192.1:3100/api/issues/{issueId}` | unreachable | Connection refused / unable to connect from this runtime |
| `http://localhost:3023/api/health?soft=1` | 200 | Body includes `"status":"stale","sourceStatus":"ok"` |
| `http://localhost:3023/api/cron/freshness/state` | 401 | Unauthorized without cron auth |
| `https://trendingrepo.com/api/health?soft=1` | 200 | Body includes `"status":"stale","sourceStatus":"degraded"` |
| `https://trendingrepo.com/api/cron/freshness/state` | 401 | Unauthorized without cron auth |

Interpretation:
- Routing is alive for health endpoints (HTTP 200 on local/prod health path).
- Freshness-state endpoint auth gate is active (HTTP 401 unauth expected for no-secret probes).
- Staleness is a data/runtime freshness condition, not a route outage.
- Canonical Paperclip control-plane endpoint for this runtime is `http://127.0.0.1:3100`; `192.168.192.1:3100` is not reliable in this heartbeat.

## Public route routing matrix (production)

Command evidence from `Invoke-WebRequest`:

| Route | Status |
|---|---:|
| `https://trendingrepo.com/` | 200 |
| `https://trendingrepo.com/signals` | 200 |
| `https://trendingrepo.com/top10` | 200 |
| `https://trendingrepo.com/mcp` | 200 |

Interpretation:
- Core production routing is healthy for sampled high-traffic surfaces.
- Current incident posture is stale/degraded freshness, not route reachability failure.

## Workflow state visibility

Command:
- `gh run list --limit 20 --json workflowName,status,conclusion,createdAt,headSha`

Result:
- Failed with `HTTP 401: Bad credentials`.

Release SRE blocker:
- Live GitHub Actions run-state matrix cannot be verified from this runtime without valid GitHub auth.
- Unblock owner/action: CTO or repo admin must provide valid GitHub auth context for this agent runtime.

## Impacted active issues (endpoint mismatch impact)

| Issue | Impact from endpoint mismatch |
|---|---|
| `AGN-1491` | Evidence/status updates fail when using `192.168.192.1:3100`; updates succeed via `127.0.0.1:3100`. |

## Runbook snippet for agent usage

1. Try Paperclip control-plane on `http://127.0.0.1:3100` first.
2. If `PAPERCLIP_API_URL` points to `192.168.192.1:3100` and fails, override base URL to `127.0.0.1:3100` for comment/PATCH calls in that heartbeat.
3. Verify connectivity quickly with `GET /api/issues/{issueId}` before posting evidence.
4. Post issue comment with evidence, then send terminal `PATCH /api/issues/{issueId}` (`done` or `blocked`) with `X-Paperclip-Run-Id`.

## Rollback readiness note (current heartbeat)

- Route layer rollback not indicated by evidence (no route outage observed).
- Freshness degradation rollback path remains workflow/data refresh recovery (not a frontend routing rollback).
- If production freshness worsens to endpoint failures, use last known good deploy verification on `api/health?soft=1` before any rollback decision.
