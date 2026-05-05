# 11 Cross-Cutting Deep Dive

Status: in progress (heartbeat chunk 1/8 workflows + observability baseline)
Owner: Carmela (test and behavior critic)
Issue: AGN-543

## Truth table: `:00` vs `:27` cron burst claim

Question: Which minute marker is the actual high-collision burst in current GitHub Actions schedules?

| Claim source | Claim | Evidence date | Repo evidence outcome | Verdict |
|---|---|---:|---|---|
| `docs/forensic/08-SCALE-HARDENING-AUDIT.md` (line 879 area, prior audit reference) | Main burst is `:00` | 2026-05-04 | Current `.github/workflows/*.yml` has multiple `:00` jobs (`collect-funding`, `collect-twitter`, `cron-digest-weekly`, `cron-mcp-usage-rotate`, `cron-pipeline-rebuild`, `cron-predictions`, `cron-twitter-outbound`, `run-shadow-scoring`) | Partially true |
| `docs/forensic/08-CRON-OVERLAP-DUPLICATE-MAP-2026-05-04.md` | Main burst is `:27` | 2026-05-04 | Current schedules only show two explicit `:27` hits in `sync-trustmrr.yml`, while `:00` appears across many jobs | False as global claim |

Resolution: as of 2026-05-04, the global contention cluster is `:00`, not `:27`. `:27` exists but is not dominant.

Deprecation note: any statement that global cron contention is primarily `:27` should be treated as stale and superseded by this document.

## Workflow audit template

Per workflow section includes:
- Cron expression
- Runtime
- Secrets
- Output sink
- Owner (current inferred owner from path + purpose)
- Concurrency control
- Timeout
- Alerting
- Cost/risk notes

## Workflow batch A (1-8 / 64)

### 1) `.github/workflows/aiso-self-scan.yml`
- Cron expression: `17 3 * * *` (`.github/workflows/aiso-self-scan.yml:27`)
- Runtime: `ubuntu-latest` (`.github/workflows/aiso-self-scan.yml:35`)
- Secrets: none
- Output sink: PostHog capture endpoint + API health probe via curl (`.github/workflows/aiso-self-scan.yml:47`, `.github/workflows/aiso-self-scan.yml:66`)
- Owner: AISO / observability guardrail
- Concurrency control: missing
- Timeout: `5m` (`.github/workflows/aiso-self-scan.yml:36`)
- Alerting: implicit only (no explicit Slack/email route)
- Cost/risk notes: low runtime cost, moderate silent-failure risk (no explicit action on telemetry post failure)

### 2) `.github/workflows/audit-freshness.yml`
- Cron expression: `8 * * * *` (`.github/workflows/audit-freshness.yml:24`)
- Runtime: `ubuntu-latest` (`.github/workflows/audit-freshness.yml:36`)
- Secrets: none
- Output sink: local script audit output only (`.github/workflows/audit-freshness.yml:50`)
- Owner: data freshness / ops
- Concurrency control: present (`.github/workflows/audit-freshness.yml:30`)
- Timeout: `5m` (`.github/workflows/audit-freshness.yml:37`)
- Alerting: none explicit
- Cost/risk notes: low cost, detection-only workflow can fail silently without on-failure notification

### 3) `.github/workflows/backfill-meta.yml`
- Cron expression: none (manual only)
- Runtime: `ubuntu-latest` (`.github/workflows/backfill-meta.yml:35`)
- Secrets: `REDIS_URL`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` (`.github/workflows/backfill-meta.yml:56-58`)
- Output sink: Redis metadata writes via `scripts/backfill-meta.mjs` (`.github/workflows/backfill-meta.yml:61`, `.github/workflows/backfill-meta.yml:63`)
- Owner: data-store maintenance
- Concurrency control: present (`.github/workflows/backfill-meta.yml:29`)
- Timeout: `5m` (`.github/workflows/backfill-meta.yml:36`)
- Alerting: none explicit
- Cost/risk notes: high blast radius if non-dry-run executed without key-scope guardrails

### 4) `.github/workflows/check-nitter.yml`
- Cron expression: `0 4 * * *` (`.github/workflows/check-nitter.yml:5`)
- Runtime: `ubuntu-latest` (`.github/workflows/check-nitter.yml:10`)
- Secrets: `SENTRY_DSN` (`.github/workflows/check-nitter.yml:21`)
- Output sink: git commit + push of health updates (`.github/workflows/check-nitter.yml:27`)
- Owner: source reliability / nitter health
- Concurrency control: missing
- Timeout: missing
- Alerting: Sentry DSN present but no explicit on-failure notification block
- Cost/risk notes: mutating workflow without explicit timeout is a stuck-run risk

### 5) `.github/workflows/ci.yml`
- Cron expression: none
- Runtime: `ubuntu-latest` jobs (`.github/workflows/ci.yml:25`, `.github/workflows/ci.yml:154`)
- Secrets: none
- Output sink: validation only, no production writes
- Owner: core engineering
- Concurrency control: present (`.github/workflows/ci.yml:18`)
- Timeout: `30m` + `10m` (`.github/workflows/ci.yml:26`, `.github/workflows/ci.yml:155`)
- Alerting: relies on GitHub checks only
- Cost/risk notes: moderate cost due to parallel jobs; failure discoverable by PR checks

### 6) `.github/workflows/collect-funding.yml`
- Cron expression: `0 */6 * * *` (`.github/workflows/collect-funding.yml:4`)
- Runtime: `ubuntu-latest` (`.github/workflows/collect-funding.yml:22`)
- Secrets: none explicit
- Output sink: repository data update + push path documented in-file (`.github/workflows/collect-funding.yml:14`)
- Owner: funding/news ingestion
- Concurrency control: missing
- Timeout: missing
- Alerting: none explicit
- Cost/risk notes: scheduled mutation at `:00` contributes to top-of-hour write contention

### 7) `.github/workflows/collect-twitter.yml`
- Cron expression: `0 */3 * * *` (`.github/workflows/collect-twitter.yml:5`)
- Runtime: `ubuntu-latest` (`.github/workflows/collect-twitter.yml:33`)
- Secrets: `INTERNAL_AGENT_TOKEN`, `APIFY_API_TOKEN`, `TWITTER_WEB_ACCOUNTS_JSON` (`.github/workflows/collect-twitter.yml:73-76`)
- Output sink: collector scripts likely writing signal artifacts / pipeline inputs
- Owner: social signals ingestion
- Concurrency control: missing
- Timeout: `30m` (`.github/workflows/collect-twitter.yml:34`)
- Alerting: none explicit
- Cost/risk notes: one of highest external API cost surfaces; no explicit retry/alert policy in workflow

### 8) `.github/workflows/cron-agent-commerce.yml`
- Cron expression: `31 4 * * *` (`.github/workflows/cron-agent-commerce.yml:7`)
- Runtime: `ubuntu-latest` (`.github/workflows/cron-agent-commerce.yml:19`)
- Secrets: broad set including Redis, AA, Solana RPC, Reddit, token pool, webhook (`.github/workflows/cron-agent-commerce.yml:39-144`)
- Output sink: multiple scripts + webhook post (`.github/workflows/cron-agent-commerce.yml:171`)
- Owner: agent-commerce pipeline
- Concurrency control: present (`.github/workflows/cron-agent-commerce.yml:13`)
- Timeout: `30m` (`.github/workflows/cron-agent-commerce.yml:20`)
- Alerting: webhook-based partial alerting only
- Cost/risk notes: high blast radius and high secret surface; needs secret scoping + step-level failure notifications

## Observability posture baseline (Sentry + PostHog + CSP starter)

### Sentry baseline
- Next.js server init: `tracesSampleRate` 0.1 in production (`sentry.server.config.ts:11`)
- Next.js edge init: `tracesSampleRate` 0.1 in production (`sentry.edge.config.ts:11`)
- Browser init: `tracesSampleRate` 0.1, replay opt-in via `NEXT_PUBLIC_SENTRY_REPLAY` (`instrumentation-client.ts:13`, `instrumentation-client.ts:19-28`)
- Worker init: `tracesSampleRate` 0.05 (`apps/trendingrepo-worker/src/lib/sentry.ts:13`)
- Gap: no central table documenting per-surface event volume budget or alert thresholds

### PostHog baseline
- Browser host defaults to US endpoint (`src/components/providers/PostHogProvider.tsx:14`)
- Server helper hardcodes EU endpoint (`src/lib/analytics/posthog.ts:34`)
- CSP currently allows both US and EU PostHog endpoints (`next.config.ts:129-130`)
- Gap: cross-surface region mismatch risk (data residency + dashboard drift)

### CSP starter patch candidate (inline diff)
```diff
--- a/next.config.ts
+++ b/next.config.ts
@@
-        "https://us.i.posthog.com",
-        "https://eu.i.posthog.com",
+        process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com",
```

Intent: tighten `connect-src` to configured host by default and remove dual-host allowance once host strategy is finalized.

## Follow-up issue stubs (`[CR-C-FU]`)

1. `[CR-C-FU] Enforce timeout-minutes on all mutating scheduled workflows` (check-nitter, collect-funding, others)
2. `[CR-C-FU] Add explicit workflow-level alert hooks for scheduled ingestion failures`
3. `[CR-C-FU] Introduce workflow ownership metadata header for every `.github/workflows/*.yml``
4. `[CR-C-FU] Minimize secrets in cron-agent-commerce by job-scope partitioning`
5. `[CR-C-FU] PostHog region alignment decision (US vs EU) and env contract`
6. `[CR-C-FU] Sentry sampling and cost model at 1k/10k traffic`
7. `[CR-C-FU] Cron burst flattening phase-1 (move >=6 `:00` jobs)`
8. `[CR-C-FU] Add synthetic alerting tests for Sentry DSN missing startup path`

## Next chunk
- Workflows 9-16 in next heartbeat slice
- Build first `:00` collision matrix with candidate stagger diffs
- Expand observability section into alert-rule matrix

## Workflow batch B (9-16 / 64)

### 9) `.github/workflows/cron-aiso-drain.yml`
- Cron expression: `3,33 * * * *` (`.github/workflows/cron-aiso-drain.yml:15`)
- Runtime: `ubuntu-latest` (`.github/workflows/cron-aiso-drain.yml:30`)
- Secrets: `CRON_SECRET` (`.github/workflows/cron-aiso-drain.yml:35`)
- Output sink: POST call to cron drain route (`.github/workflows/cron-aiso-drain.yml:41`)
- Owner: AISO queue / moderation drain
- Concurrency control: present (`.github/workflows/cron-aiso-drain.yml:21`)
- Timeout: `10m` (`.github/workflows/cron-aiso-drain.yml:31`)
- Alerting: route-status based only; no external escalation channel
- Cost/risk notes: low compute, moderate silent-failure risk without pager/ops integration

### 10) `.github/workflows/cron-digest-weekly.yml`
- Cron expression: `0 8 * * 1` (`.github/workflows/cron-digest-weekly.yml:22`)
- Runtime: `ubuntu-latest` (`.github/workflows/cron-digest-weekly.yml:42`)
- Secrets: `CRON_SECRET` (`.github/workflows/cron-digest-weekly.yml:47`)
- Output sink: POST to weekly digest route (`.github/workflows/cron-digest-weekly.yml:60`)
- Owner: weekly digest pipeline
- Concurrency control: present (`.github/workflows/cron-digest-weekly.yml:33`)
- Timeout: `10m` (`.github/workflows/cron-digest-weekly.yml:43`)
- Alerting: no explicit webhook/incident channel
- Cost/risk notes: low frequency; high blast radius if missed because weekly summary freshness collapses

### 11) `.github/workflows/cron-freshness-check.yml`
- Cron expression: `*/15 * * * *` (`.github/workflows/cron-freshness-check.yml:26`)
- Runtime: `ubuntu-latest` (`.github/workflows/cron-freshness-check.yml:42`)
- Secrets: `CRON_SECRET`, optional `OPS_ALERT_WEBHOOK` (`.github/workflows/cron-freshness-check.yml:100`, `.github/workflows/cron-freshness-check.yml:138`)
- Output sink: POST health/freshness endpoints + optional webhook notification (`.github/workflows/cron-freshness-check.yml:62`, `.github/workflows/cron-freshness-check.yml:157`)
- Owner: SRE / freshness watchdog
- Concurrency control: present (`.github/workflows/cron-freshness-check.yml:32`)
- Timeout: `5m` (`.github/workflows/cron-freshness-check.yml:43`)
- Alerting: optional webhook only; explicitly non-fatal if missing (`.github/workflows/cron-freshness-check.yml:149`)
- Cost/risk notes: critical path signal. Optional alert secret means degraded mode can become invisible.

### 12) `.github/workflows/cron-llm.yml`
- Cron expression: `10 * * * *` and `15 2 * * *` (`.github/workflows/cron-llm.yml:16-17`)
- Runtime: `ubuntu-latest` for both jobs (`.github/workflows/cron-llm.yml:44`, `.github/workflows/cron-llm.yml:74`)
- Secrets: `CRON_SECRET` (`.github/workflows/cron-llm.yml:49`, `.github/workflows/cron-llm.yml:79`)
- Output sink: POST to aggregate and sync-models routes (`.github/workflows/cron-llm.yml:55`, `.github/workflows/cron-llm.yml:85`)
- Owner: LLM data plane
- Concurrency control: present (`.github/workflows/cron-llm.yml:32`)
- Timeout: `10m` aggregate, `5m` sync (`.github/workflows/cron-llm.yml:45`, `.github/workflows/cron-llm.yml:75`)
- Alerting: route status only, no external escalation
- Cost/risk notes: moderate cost; stale model sync risk if second job silently fails

### 13) `.github/workflows/cron-mcp-usage-rotate.yml`
- Cron expression: `0 3 1 * *` (`.github/workflows/cron-mcp-usage-rotate.yml:16`)
- Runtime: `ubuntu-latest` (`.github/workflows/cron-mcp-usage-rotate.yml:31`)
- Secrets: `CRON_SECRET` (`.github/workflows/cron-mcp-usage-rotate.yml:36`)
- Output sink: POST rotate endpoint (`.github/workflows/cron-mcp-usage-rotate.yml:42`)
- Owner: MCP accounting / maintenance
- Concurrency control: present (`.github/workflows/cron-mcp-usage-rotate.yml:22`)
- Timeout: `5m` (`.github/workflows/cron-mcp-usage-rotate.yml:32`)
- Alerting: no explicit channel
- Cost/risk notes: low runtime, but month-boundary failure can poison usage-led analytics for entire cycle

### 14) `.github/workflows/cron-pipeline-cleanup.yml`
- Cron expression: `12 4 * * *` (`.github/workflows/cron-pipeline-cleanup.yml:15`)
- Runtime: `ubuntu-latest` (`.github/workflows/cron-pipeline-cleanup.yml:30`)
- Secrets: `CRON_SECRET` (`.github/workflows/cron-pipeline-cleanup.yml:35`)
- Output sink: POST cleanup route (`.github/workflows/cron-pipeline-cleanup.yml:41`)
- Owner: pipeline hygiene
- Concurrency control: present (`.github/workflows/cron-pipeline-cleanup.yml:21`)
- Timeout: `10m` (`.github/workflows/cron-pipeline-cleanup.yml:31`)
- Alerting: none external
- Cost/risk notes: stale cleanup can accumulate historical artifacts and inflate storage/cost

### 15) `.github/workflows/cron-pipeline-ingest.yml`
- Cron expression: `15 */2 * * *` (`.github/workflows/cron-pipeline-ingest.yml:17`)
- Runtime: `ubuntu-latest` (`.github/workflows/cron-pipeline-ingest.yml:32`)
- Secrets: `CRON_SECRET` (`.github/workflows/cron-pipeline-ingest.yml:37`)
- Output sink: POST ingest route (`.github/workflows/cron-pipeline-ingest.yml:43`)
- Owner: ingestion critical path
- Concurrency control: present (`.github/workflows/cron-pipeline-ingest.yml:23`)
- Timeout: `10m` (`.github/workflows/cron-pipeline-ingest.yml:33`)
- Alerting: no explicit external escalation
- Cost/risk notes: ingest failure directly affects ranking freshness and user-facing leaderboards

### 16) `.github/workflows/cron-pipeline-persist.yml`
- Cron expression: `30 */6 * * *` (`.github/workflows/cron-pipeline-persist.yml:13`)
- Runtime: `ubuntu-latest` (`.github/workflows/cron-pipeline-persist.yml:28`)
- Secrets: `CRON_SECRET` (`.github/workflows/cron-pipeline-persist.yml:33`)
- Output sink: POST persist route (`.github/workflows/cron-pipeline-persist.yml:39`)
- Owner: persistence flush path
- Concurrency control: present (`.github/workflows/cron-pipeline-persist.yml:19`)
- Timeout: `10m` (`.github/workflows/cron-pipeline-persist.yml:29`)
- Alerting: none explicit
- Cost/risk notes: delayed persistence can create state drift between in-memory and durable stores

## Recovery note (assignment recovery)
- Prior run ended with control-plane cancellation during CTO sweep stop-window.
- Current issue state is `in_progress`; work resumed from existing baseline section without conflicting changes.

## Next chunk
- Workflow batch C (17-24 / 64)
- First full cron collision table by minute bucket (`:00`, `:03`, `:05`, etc.)
- Draft 6 concrete YAML stagger diffs for top-of-hour flattening

## Workflow batch C (17-24 / 64)

### 17) `.github/workflows/cron-pipeline-rebuild.yml`
- Cron expression: `0 5 * * 0` (`.github/workflows/cron-pipeline-rebuild.yml:14`)
- Runtime: `ubuntu-latest` (`.github/workflows/cron-pipeline-rebuild.yml:29`)
- Secrets: `CRON_SECRET` (`.github/workflows/cron-pipeline-rebuild.yml:37`)
- Output sink: POST `/api/pipeline/rebuild` (`.github/workflows/cron-pipeline-rebuild.yml:35`, `.github/workflows/cron-pipeline-rebuild.yml:43`)
- Owner: pipeline rebuild / data integrity
- Concurrency control: present (`.github/workflows/cron-pipeline-rebuild.yml:20`)
- Timeout: `30m` (`.github/workflows/cron-pipeline-rebuild.yml:33`)
- Alerting: none explicit beyond workflow failure state
- Cost/risk notes: high compute window; weekly failure leaves stale aggregate state for extended periods

### 18) `.github/workflows/cron-predictions.yml`
- Cron expression: `0 6 * * *` (`.github/workflows/cron-predictions.yml:17`)
- Runtime: `ubuntu-latest` (`.github/workflows/cron-predictions.yml:32`)
- Secrets: `CRON_SECRET` (`.github/workflows/cron-predictions.yml:37`)
- Output sink: POST `/api/cron/predictions` (`.github/workflows/cron-predictions.yml:35`, `.github/workflows/cron-predictions.yml:43`)
- Owner: predictions subsystem
- Concurrency control: present (`.github/workflows/cron-predictions.yml:23`)
- Timeout: `15m` (`.github/workflows/cron-predictions.yml:33`)
- Alerting: no dedicated webhook/pager escalation
- Cost/risk notes: daily critical model output; no direct escalation path increases MTTD on drift

### 19) `.github/workflows/cron-subdomain-takeover.yml`
- Cron expression: `20 3 * * 1` (`.github/workflows/cron-subdomain-takeover.yml:9`)
- Runtime: `ubuntu-latest` (`.github/workflows/cron-subdomain-takeover.yml:24`)
- Secrets: `CRON_SECRET` (`.github/workflows/cron-subdomain-takeover.yml:29`)
- Output sink: POST `/api/cron/subdomain-takeover` (`.github/workflows/cron-subdomain-takeover.yml:27`, `.github/workflows/cron-subdomain-takeover.yml:36`)
- Owner: security/infra guardrail
- Concurrency control: present (`.github/workflows/cron-subdomain-takeover.yml:15`)
- Timeout: `10m` (`.github/workflows/cron-subdomain-takeover.yml:25`)
- Alerting: implicit via workflow red only
- Cost/risk notes: low frequency but high impact if alerting path misses actionable takeover signal

### 20) `.github/workflows/cron-twitter-outbound.yml`
- Cron expression: `0 14 * * *` and `0 16 * * 5` (`.github/workflows/cron-twitter-outbound.yml:17-18`)
- Runtime: `ubuntu-latest` (`.github/workflows/cron-twitter-outbound.yml:35`)
- Secrets: `CRON_SECRET` (`.github/workflows/cron-twitter-outbound.yml:59`)
- Output sink: POST outbound route via curl (`.github/workflows/cron-twitter-outbound.yml:65`)
- Owner: outbound social distribution
- Concurrency control: present (`.github/workflows/cron-twitter-outbound.yml:29`)
- Timeout: `5m` (`.github/workflows/cron-twitter-outbound.yml:36`)
- Alerting: none explicit beyond failure status
- Cost/risk notes: includes two `:00` schedules; contributes to top-of-hour collision peak

### 21) `.github/workflows/cron-webhooks-flush.yml`
- Cron expression: `5,35 * * * *` (`.github/workflows/cron-webhooks-flush.yml:20`)
- Runtime: `ubuntu-latest` (`.github/workflows/cron-webhooks-flush.yml:35`)
- Secrets: `CRON_SECRET` (`.github/workflows/cron-webhooks-flush.yml:40`, `.github/workflows/cron-webhooks-flush.yml:66`)
- Output sink: two-step scan + flush POST routes (`.github/workflows/cron-webhooks-flush.yml:38`, `.github/workflows/cron-webhooks-flush.yml:64`)
- Owner: webhook dispatch reliability
- Concurrency control: present (`.github/workflows/cron-webhooks-flush.yml:26`)
- Timeout: `10m` (`.github/workflows/cron-webhooks-flush.yml:36`)
- Alerting: local step error logging only
- Cost/risk notes: queue-backed outbound path; silent partial failure can accumulate undelivered alerts

### 22) `.github/workflows/enrich-arxiv.yml`
- Cron expression: `13 */12 * * *` (`.github/workflows/enrich-arxiv.yml:13`)
- Runtime: `ubuntu-latest` (`.github/workflows/enrich-arxiv.yml:25`)
- Secrets: `REDIS_URL` (`.github/workflows/enrich-arxiv.yml:43`)
- Output sink: `node scripts/enrich-arxiv.mjs` (Redis-backed enrichment) (`.github/workflows/enrich-arxiv.yml:44`)
- Owner: research enrichment pipeline
- Concurrency control: present (`.github/workflows/enrich-arxiv.yml:19`)
- Timeout: missing
- Alerting: none explicit
- Cost/risk notes: mutation job without explicit timeout; stale locks/runaway process risk

### 23) `.github/workflows/enrich-repo-profiles.yml`
- Cron expression: `41 * * * *` (`.github/workflows/enrich-repo-profiles.yml:5`)
- Runtime: `ubuntu-latest` (`.github/workflows/enrich-repo-profiles.yml:17`)
- Secrets: none explicit
- Output sink: enrichment/coverage/checklist scripts (`.github/workflows/enrich-repo-profiles.yml:39-45`)
- Owner: repo profile quality
- Concurrency control: present (`.github/workflows/enrich-repo-profiles.yml:11`)
- Timeout: missing
- Alerting: none explicit
- Cost/risk notes: hourly mutation/check cycle with no timeout; potential overlap or hung-job cost creep

### 24) `.github/workflows/health-watch.yml`
- Cron expression: `*/30 * * * *` (`.github/workflows/health-watch.yml:11`)
- Runtime: `ubuntu-latest` (`.github/workflows/health-watch.yml:23`)
- Secrets: `REDIS_URL` (`.github/workflows/health-watch.yml:35`)
- Output sink: `node scripts/check-source-health.mjs` (`.github/workflows/health-watch.yml:36`)
- Owner: source health monitoring
- Concurrency control: present (`.github/workflows/health-watch.yml:17`)
- Timeout: missing
- Alerting: not codified in workflow
- Cost/risk notes: health monitor without explicit timeout/alerts reduces reliability of monitoring itself

## Cron collision table (minute bucket snapshot)

| Minute bucket | Workflow count | Collision risk |
|---|---:|---|
| `0` | 12 | Critical (highest global collision bucket) |
| `17` | 6 | High |
| `30` | 4 | Medium-high |
| `13` | 3 | Medium |
| `12`, `15`, `20`, `22`, `23`, `25`, `27`, `37`, `47`, `55`, `*/15`, `*/30` | 2 each | Medium |
| all other listed buckets | 1 each | Low |

Immediate flatten target remains `:00` bucket first, then `:17`.
