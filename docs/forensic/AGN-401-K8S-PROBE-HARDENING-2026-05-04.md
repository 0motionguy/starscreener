# AGN-401 Kubernetes probe hardening verification — 2026-05-04

## Scope
- Issue: `AGN-401` (`[Audit-08 T6] Kubernetes probe hardening`)
- Owner surface: release SRE deployment/ops safety checks
- Heartbeat timestamp: `2026-05-04` (local)

## Mandatory opening evidence
- Read: `CLAUDE.md`
- Read: `docs/ENGINE.md`
- Read: `docs/SITE-WIREMAP.md`
- Read: `docs/AUDIT-2026-05-04.md`
- Read: `docs/forensic/00-INDEX.md`
- Read: `tasks/CURRENT-SPRINT.md`
- Read: `tasks/BACKLOG.md`
- Ran: `npm run freshness:check`
  - Result: `freshness-check: request timed out while contacting http://localhost:3023`
  - Interpretation: localhost freshness probe unavailable for this heartbeat.

## Deployment-surface verification performed
1. Searched owned surfaces and adjacent docs for Kubernetes probe assets:
   - `.github/workflows/**`
   - `next.config.ts`
   - `docs/**`
2. Verified repo has no Kubernetes deployment manifests or probe blocks (`livenessProbe`, `readinessProbe`, `startupProbe`) under active deployment surfaces.
3. Verified current runtime/deploy footprint in docs remains Vercel + Railway worker/Redis, not Kubernetes-native workloads.

## Findings
- `AGN-401` requires k8s probe hardening criteria, but there is no in-repo Kubernetes manifest/probe target in owned surfaces to harden in this heartbeat.
- Freshness gate is currently non-verifiable locally due to localhost timeout, so release validation is additionally blocked on local runtime health.

## Blocker and unblock
- Blocked on: missing Kubernetes deployment/probe artifact ownership target for `AGN-401` and unavailable local freshness probe endpoint.
- Needs:
  - CTO/platform to confirm where k8s manifests for this scope live (repo path or external infra repo), or re-scope AGN-401 to Vercel/Railway equivalent health-check hardening.
  - Platform engineer to restore localhost freshness endpoint (`http://localhost:3023`) so mandatory release preflight can return current status.

## Next action once unblocked
- If k8s manifest location is provided: implement probe thresholds/hardening there and attach diff + live validation evidence.
- If re-scoped to Vercel/Railway: harden cron/deploy health probes in `.github/workflows/**` and publish release verification + rollback steps.
