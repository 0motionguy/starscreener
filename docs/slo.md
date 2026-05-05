---
status: archive
audit-date: 2026-05-05
reason: bulk drift sweep - content not yet drift-audited; treat as historical reference
---

# STARSCREENER SLO + Error Budget Policy

Last updated: 2026-05-05
Owner: Release SRE
Scope: production `https://trendingrepo.com` and release-critical cron lanes

## 1) SLOs (rolling 28-day window)

| SLI | Target (SLO) | 28-day error budget | Measurement source |
|---|---|---|---|
| Homepage availability (`GET /`) | >= 99.9% successful requests | <= 40m 19s unavailable | Vercel + Sentry `transaction:/` availability query |
| Repo page availability (`GET /repo/[owner]/[name]`) | >= 99.5% successful requests | <= 3h 21m 36s unavailable | Sentry transaction query grouped by route |
| API latency (`/api/health?soft=1`) | p95 < 1000ms | p95 budget breach if >= 1000ms for 3 consecutive 5m windows | Sentry transactions/performance |
| Cron freshness operability (`/api/cron/freshness/state`) | >= 99.0% successful authenticated checks | <= 6h 43m 12s unavailable | cron-freshness-check workflow + endpoint status |

## 2) Error budget burn policy

- Fast burn: >10% budget consumed in 1h -> page on-call immediately.
- Medium burn: >25% budget consumed in 24h -> same-day remediation + deploy freeze for non-critical changes.
- Slow burn: >50% budget consumed in 7d -> CTO review required before any deploy-impact merge.

## 3) Sentry alert rules tied to SLOs

Assumptions:
- Sentry org: `agnt-pf`
- Project: `starscreener-web` (replace if different)
- Environment tag: `production`

### Rule A � Homepage availability burn (maps to `/` 99.9% SLO)

- Name: `SLO-A / homepage availability burn`
- Trigger condition:
  - Event type: transaction
  - Query: `event.type:transaction transaction:/ environment:production`
  - Failure ratio threshold: `failed / total > 0.1%` over 1h
  - Escalate if `>0.2%` over 1h (2x burn)
- Action: notify on-call channel and open incident.

### Rule B � Repo route availability burn (maps to `/repo/*` 99.5% SLO)

- Name: `SLO-B /repo availability burn`
- Trigger condition:
  - Event type: transaction
  - Query: `event.type:transaction transaction:"/repo/*" environment:production`
  - Failure ratio threshold: `failed / total > 0.5%` over 1h
  - Escalate if `>1.0%` over 1h (2x burn)
- Action: notify on-call + Release SRE channel.

### Rule C � Health API latency breach (maps to p95 < 1s SLO)

- Name: `SLO-C /api/health latency p95 breach`
- Trigger condition:
  - Event type: transaction
  - Query: `event.type:transaction transaction:"/api/health?soft=1" environment:production`
  - Metric threshold: `p95(transaction.duration) >= 1000ms`
  - Fire when threshold holds for 3 consecutive 5m windows
- Action: notify on-call; mark release validation as failed for current deploy.

## 4) Sentry API payload templates (create/update rules)

Use these payloads with Sentry Alerts API after setting `SENTRY_AUTH_TOKEN`.

```bash
curl -X POST "https://sentry.io/api/0/projects/agnt-pf/starscreener-web/rules/" \
  -H "Authorization: Bearer $SENTRY_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d @rule-a-homepage-availability.json
```

```json
{
  "name": "SLO-A / homepage availability burn",
  "actionMatch": "all",
  "frequency": 30,
  "environment": "production",
  "filterMatch": "all",
  "filters": [
    { "id": "event.type", "value": "transaction" },
    { "id": "event.attribute", "key": "transaction", "value": "/" }
  ],
  "conditions": [
    { "id": "event_frequency", "value": 1, "interval": "1h" }
  ],
  "actions": [
    { "id": "sentry.mail.actions.NotifyEmailAction", "targetType": "team", "targetIdentifier": "release-sre" }
  ]
}
```

```json
{
  "name": "SLO-B /repo availability burn",
  "actionMatch": "all",
  "frequency": 30,
  "environment": "production",
  "filterMatch": "all",
  "filters": [
    { "id": "event.type", "value": "transaction" },
    { "id": "event.attribute", "key": "transaction", "value": "/repo/*" }
  ],
  "conditions": [
    { "id": "event_frequency", "value": 1, "interval": "1h" }
  ],
  "actions": [
    { "id": "sentry.mail.actions.NotifyEmailAction", "targetType": "team", "targetIdentifier": "release-sre" }
  ]
}
```

```json
{
  "name": "SLO-C /api/health latency p95 breach",
  "actionMatch": "all",
  "frequency": 30,
  "environment": "production",
  "filterMatch": "all",
  "filters": [
    { "id": "event.type", "value": "transaction" },
    { "id": "event.attribute", "key": "transaction", "value": "/api/health?soft=1" }
  ],
  "conditions": [
    { "id": "event_frequency", "value": 1, "interval": "5m" }
  ],
  "actions": [
    { "id": "sentry.mail.actions.NotifyEmailAction", "targetType": "team", "targetIdentifier": "release-sre" }
  ]
}
```

## 5) Release gate usage

A release is NOT healthy unless all pass:
1. Latest production deploy is identifiable (Vercel deployment id + commit SHA).
2. Latest critical cron workflows are green.
3. `GET /api/health?soft=1` is not stale/degraded.
4. SLO-A/B/C alert rules exist and are enabled in Sentry.

## 6) Current heartbeat verification status (2026-05-05)

- `npm run freshness:check`: failed, localhost:3023 unreachable (`ECONNREFUSED`).
- Rule definitions are documented here.
- Live Sentry rule creation is blocked until valid Sentry credentials/API access are available in the runtime.
