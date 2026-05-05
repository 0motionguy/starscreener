# AGN-401 release validation — Kubernetes probe hardening guard

Date: 2026-05-05  
Issue: AGN-401 (`[Audit-08 T6] Kubernetes probe hardening`)

## Change summary
- Added workflow: `.github/workflows/sre-k8s-probe-guard.yml`
- Scope:
  - Triggers on PR/push changes under `k8s/**`, `infra/k8s/**`, `deploy/**`, `helm/**`.
  - Validates Kubernetes workloads (`Deployment`, `StatefulSet`, `DaemonSet`) for probe hardening.
  - Enforces required probes on each container/initContainer:
    - `readinessProbe`
    - `livenessProbe`
  - Enforces required probe fields:
    - `timeoutSeconds`
    - `periodSeconds`
    - `failureThreshold`
  - Enforces probe handler presence:
    - one of `httpGet`, `tcpSocket`, `exec`, `grpc`
  - `startupProbe` is warning-only (recommended).

## Current repo-state result
- No Kubernetes manifest roots currently present for workload validation in this repository (`k8s/`, `infra/k8s/`, `deploy/`, `helm/`), so the guard no-ops until manifests are introduced.

## Rollback path
1. Revert `.github/workflows/sre-k8s-probe-guard.yml`.
2. Push revert commit.
3. Confirm no references remain in workflow list for `SRE - Kubernetes probe guard`.

## Operational note
- This implements preventive hardening in owned release surface (`.github/workflows/**`) without changing runtime behavior on Vercel/Railway.
