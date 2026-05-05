# Runbook: STARSCREENER x AISO Operator Checklist

Last updated: 2026-05-05
Owner: CTO

## Scope
Single-page execution checklist for running AISO scan + remediation loops for `https://trendingrepo.com` without drifting from STARSCREENER ops rules.

## 0) Mandatory preflight (do first)
1. Confirm mandatory docs were read in this session:
   - `CLAUDE.md`
   - `docs/ENGINE.md`
   - `docs/SITE-WIREMAP.md`
   - `docs/AUDIT-2026-05-04.md`
   - `docs/forensic/00-INDEX.md`
   - `tasks/CURRENT-SPRINT.md`
   - `tasks/BACKLOG.md`
2. Run freshness gate:
```bash
npm run freshness:check
```
3. Classify freshness failure mode:
   - `ECONNREFUSED` / localhost unreachable: local server missing (`npm run dev` not running).
   - HTTP 500/401 from `localhost:3023` freshness endpoints: product/local runtime degraded.
   - Non-green source budget failures: data freshness incident, not just localhost availability.

Current verified preflight in this workspace (2026-05-05):
- `npm run freshness:check` failed with `ECONNREFUSED` at `http://localhost:3023`.
- Classification: localhost:3023 server missing (not a product logic failure from this run).

## 1) AISO scan submit/poll loop
1. Submit scan:
```bash
curl -sS -X POST "https://aiso.tools/api/scan" ^
  -H "Content-Type: application/json" ^
  --data-binary "{\"url\":\"https://trendingrepo.com\"}"
```
2. If response has `scanId`, poll:
```bash
curl -sS "https://aiso.tools/api/scan/<scanId>"
```
3. Record:
   - UTC timestamp
   - request/response status
   - returned dimensions/scores
   - lowest-scoring dimension

## 2) Failure handling matrix
- HTTP `429 rate_limited_ip`:
  - Capture `retryAfterSeconds`.
  - Mark blocked on AISO rate window.
  - Schedule exact retry time (UTC) and stop retry spam.
- HTTP `5xx` from AISO:
  - Retry with backoff 1s/2s/4s (max 3).
  - If still failing, mark blocked on upstream AISO availability.
- Invalid payload/no `scanId`:
  - Verify JSON body and URL.
  - Cross-check contract in `docs/aiso-free-scan-contract.md`.

## 3) Remediation execution (one focused fix per loop)
1. Choose lowest-scoring dimension from latest scan.
2. Make one scoped fix only.
3. Validate locally with smallest proof for touched files (lint/typecheck/test command scoped if possible).
4. Re-run scan when rate limits allow.
5. Log delta in:
   - `docs/forensic/13-AISO-SELF-SCAN.md`
   - `docs/forensic/15-AISO-REMEDIATION-LOG.md`

## 4) Evidence checklist before closing heartbeat
- Freshness command result + classification (localhost missing vs product failure).
- AISO request/response evidence (status, payload summary, retry window if rate-limited).
- Changed files and verification command outputs.
- Next action with unblock owner when blocked.

## 5) Guardrails
- Never expose secrets; mask values as first4+last4 only.
- No `git add .` / `git add -A`; stage specific files only.
- Keep runbook updates in docs, execution logs in forensic docs.
- New backlog ideas go to `tasks/BACKLOG.md`; do not expand sprint scope mid-heartbeat.
