# BACKLOG — Items deferred from current sprint

## From audit (2026-05-04) — not in Sprint 1
- [ ] Profile completeness scanner (owner: data quality engineer). Done when a scanner report is generated and each profile field has pass/fail coverage output. Target sprint: Sprint 3.
- [ ] Image coverage backfill (owner: frontend/data engineer). Done when missing image slots are enumerated and backfill pipeline raises coverage above agreed threshold. Target sprint: Sprint 3.
- [ ] Cross-mention completeness (owner: data pipeline engineer). Done when a canonical per-repo cross-mention object is produced and verified against all source mention feeds. Target sprint: Sprint 3.
- [ ] News + funding RSS sources (owner: data pipeline engineer). Done when planned RSS sources are ingested with freshness metadata and appear in the target surfaces. Target sprint: Sprint 2.
- [ ] AI vendor blog RSS (owner: data pipeline engineer). Done when vendor RSS feeds are ingested, deduped, and visible in model/news surfaces with timestamps. Target sprint: Sprint 2.
- [ ] Workflow consolidation (owner: platform engineer). Done when overlapping workflows are merged, schedules documented, and all consolidated workflows pass two consecutive runs. Target sprint: Sprint 5.
- [ ] VPS migration (owner: CTO). Done when migration decision is documented as ship/no-ship with risk, cost, and rollback criteria. Target sprint: Sprint 6 (optional).

## Discovered during current work
- 2026-05-05 AGN-711 [AGN-122] Fix Lighthouse perf score <80 on /signals (43) (reassignment redistribution triage):
  - Reassignment intake: board comment `4039110f-3600-4928-b3a6-9742a859d6ba` rerouted AGN-711 to Sprint Triage because original assignee was missing/removed.
  - Mandatory opening re-run completed (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/archive/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`).
  - Path verification note: `docs/AUDIT-2026-05-04.md` is missing in this repo path; canonical audit location resolves to `docs/archive/AUDIT-2026-05-04.md`.
  - Verified `npm run freshness:check` failed with `local server not reachable at http://localhost:3023` (`ECONNREFUSED`), so localhost:3023 is missing in this heartbeat.
  - [ ] AGN-711 redistribution continuity follow-through (owner: PM triage). Done when AGN-711 has one implementation owner assigned by CTO, one explicit unblock path for `/signals` Lighthouse perf remediation with before/after evidence, and a fresh heartbeat evidences reachable localhost preflight with non-blocking freshness (`npm run freshness:check` exit 0).
    Dependencies: CTO assigns implementation owner for AGN-711; assigned engineer captures `/signals` Lighthouse baseline evidence (score 43), lands targeted fixes, and posts rerun evidence showing Lighthouse perf >=80; platform engineer restores localhost:3023 reachability so freshness preflight can run.

- 2026-05-05 AGN-710 [AGN-122] Fix Lighthouse perf score <80 on / (35) (reassignment redistribution triage):
  - Reassignment intake: board comment `a73f66ae-4984-4939-b64b-d2f10c88cfc5` rerouted AGN-710 to Sprint Triage because original assignee was missing/removed.
  - Mandatory opening re-run completed (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/archive/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`).
  - Path verification note: `docs/AUDIT-2026-05-04.md` is missing in this repo path; canonical audit location resolves to `docs/archive/AUDIT-2026-05-04.md`.
  - Verified `npm run freshness:check` failed with `local server not reachable at http://localhost:3023` (`ECONNREFUSED`), so localhost:3023 is missing in this heartbeat.
  - [ ] AGN-710 redistribution continuity follow-through (owner: PM triage). Done when AGN-710 has one implementation owner assigned by CTO, one explicit unblock path for home-route Lighthouse >=80 remediation with before/after evidence, and a fresh heartbeat evidences reachable localhost preflight with non-blocking freshness (`npm run freshness:check` exit 0).
    Dependencies: CTO assigns implementation owner for AGN-710; assigned engineer captures baseline Lighthouse evidence on `/`, lands focused perf improvements to reach >=80, and posts reproducible after-fix evidence; platform engineer restores localhost:3023 reachability so freshness preflight can run.

- 2026-05-05 AGN-712 [AGN-122] Restore /trends route + Lighthouse baseline (404) (reassignment redistribution triage):
  - Reassignment intake: board comment `ee28f769-ec8c-4f18-8ffd-89ee9449f147` rerouted AGN-712 to Sprint Triage because original assignee was missing/removed.
  - Mandatory opening re-run completed (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/archive/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`).
  - Path verification note: `docs/AUDIT-2026-05-04.md` is missing in this repo path; canonical audit location resolves to `docs/archive/AUDIT-2026-05-04.md`.
  - Verified `npm run freshness:check` failed with `local server not reachable at http://localhost:3023` (`ECONNREFUSED`), so localhost:3023 is missing in this heartbeat.
  - [ ] AGN-712 redistribution continuity follow-through (owner: PM triage). Done when AGN-712 has one implementation owner assigned by CTO, one explicit unblock path for `/trends` route restore and Lighthouse baseline artifacts for AGN-122 acceptance, and a fresh heartbeat evidences reachable localhost preflight with non-blocking freshness (`npm run freshness:check` exit 0).
    Dependencies: CTO assigns implementation owner for AGN-712; assigned engineer restores `/trends` from 404 to 200 and captures Lighthouse baseline evidence; platform engineer restores localhost:3023 reachability so freshness preflight can run.

- 2026-05-05 AGN-858 Investigate broken workflow: Refresh agent-commerce pipeline (reassignment redistribution triage):
  - Reassignment intake: board comment `bf254603-6c1d-47f0-9a42-2c3e8bc7e845` rerouted AGN-858 to Sprint Triage because original assignee was missing/removed.
  - Mandatory opening re-run completed (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/archive/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`).
  - Path verification note: `docs/AUDIT-2026-05-04.md` is missing in this repo path; canonical audit location resolves to `docs/archive/AUDIT-2026-05-04.md`.
  - Verified `npm run freshness:check` failed with `local server not reachable at http://localhost:3023` (`ECONNREFUSED`), so localhost:3023 is missing in this heartbeat.
  - [ ] AGN-858 redistribution continuity follow-through (owner: PM triage). Done when AGN-858 has one implementation owner assigned by CTO, one explicit unblock path for `Refresh agent-commerce pipeline` workflow remediation with run-level evidence, and a fresh heartbeat evidences reachable localhost preflight with non-blocking freshness (`npm run freshness:check` exit 0).
    Dependencies: CTO assigns implementation owner for AGN-858; assigned engineer verifies failing `Refresh agent-commerce pipeline` workflow run id/log evidence and patches the failure path with fresh success proof; platform engineer restores localhost:3023 reachability so freshness preflight can run.

- 2026-05-05 AGN-859 Investigate broken workflow: Cron - pipeline ingest (reassignment redistribution triage):
  - Reassignment intake: board comment `6876da3c-b736-411e-9b59-6b8af9925367` rerouted AGN-859 to Sprint Triage because original assignee was missing/removed.
  - Mandatory opening re-run completed (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/archive/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`).
  - Path verification note: `docs/AUDIT-2026-05-04.md` is missing in this repo path; canonical audit location resolves to `docs/archive/AUDIT-2026-05-04.md`.
  - Verified `npm run freshness:check` failed with `local server not reachable at http://localhost:3023` (`ECONNREFUSED`), so localhost:3023 is missing in this heartbeat.
  - [ ] AGN-859 redistribution continuity follow-through (owner: PM triage). Done when AGN-859 has one implementation owner assigned by CTO, one explicit unblock path for `Cron - pipeline ingest` workflow remediation with run-level evidence, and a fresh heartbeat evidences reachable localhost preflight with non-blocking freshness (`npm run freshness:check` exit 0).
    Dependencies: CTO assigns implementation owner for AGN-859; assigned engineer verifies failing `Cron - pipeline ingest` workflow run id/log evidence and patches the failure path with fresh success proof; platform engineer restores localhost:3023 reachability so freshness preflight can run.

- 2026-05-05 AGN-813 [AISO] Fix repo typecheck blockers preventing AGN-786 QA close-out (reassignment redistribution triage):
  - Reassignment intake: board comment `891f114a-f40c-4591-ac90-7877e4d3a611` rerouted AGN-813 to Sprint Triage because original assignee was missing/removed.
  - Mandatory opening re-run completed (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/archive/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`).
  - Path verification note: `docs/AUDIT-2026-05-04.md` is missing in this repo path; canonical audit location resolves to `docs/archive/AUDIT-2026-05-04.md`.
  - Verified `npm run freshness:check` failed with `local server not reachable at http://localhost:3023` (`ECONNREFUSED`), so localhost:3023 is missing in this heartbeat.
  - [ ] AGN-813 redistribution continuity follow-through (owner: PM triage). Done when AGN-813 has one implementation owner assigned by CTO, one explicit unblock path for repo `typecheck` remediation with run-level evidence for AGN-786 QA close-out, and a fresh heartbeat evidences reachable localhost preflight with non-blocking freshness (`npm run freshness:check` exit 0).
    Dependencies: CTO assigns implementation owner for AGN-813; assigned engineer captures failing `npm run typecheck` evidence, ships minimal fixes, and posts green `npm run typecheck` proof for AGN-786 QA; platform engineer restores localhost:3023 reachability so freshness preflight can run.
- 2026-05-05 AGN-861 Investigate broken workflow: Refresh repo profiles (reassignment redistribution triage):
  - Reassignment intake: board comment `bee3645f-4114-4853-ad9a-72430345bd75` rerouted AGN-861 to Sprint Triage because original assignee was missing/removed.
  - Mandatory opening re-run completed (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/archive/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`).
  - Path verification note: `docs/AUDIT-2026-05-04.md` is missing in this repo path; canonical audit location resolves to `docs/archive/AUDIT-2026-05-04.md`.
  - Verified `npm run freshness:check` failed with `local server not reachable at http://localhost:3023` (`ECONNREFUSED`), so localhost:3023 is missing in this heartbeat.
  - [ ] AGN-861 redistribution continuity follow-through (owner: PM triage). Done when AGN-861 has one implementation owner assigned by CTO, one explicit unblock path for `Refresh repo profiles` workflow remediation with run-level evidence, and a fresh heartbeat evidences reachable localhost preflight with non-blocking freshness (`npm run freshness:check` exit 0).
    Dependencies: CTO assigns implementation owner for AGN-861; assigned engineer verifies failing `Refresh repo profiles` workflow run id/log evidence and patches the failure path with fresh success proof; platform engineer restores localhost:3023 reachability so freshness preflight can run.
- 2026-05-05 AGN-860 Investigate broken workflow: cron-subdomain-takeover.yml (reassignment redistribution triage):
  - Reassignment intake: board comment `b4cf2719-3fe0-4f16-80ea-60e0027bf454` rerouted AGN-860 to Sprint Triage because original assignee was missing/removed.
  - Mandatory opening re-run completed (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/archive/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`).
  - Path verification note: `docs/AUDIT-2026-05-04.md` is missing in this repo path; canonical audit location resolves to `docs/archive/AUDIT-2026-05-04.md`.
  - Verified `npm run freshness:check` failed with `local server not reachable at http://localhost:3023` (`ECONNREFUSED`), so localhost:3023 is missing in this heartbeat.
  - [ ] AGN-860 redistribution continuity follow-through (owner: PM triage). Done when AGN-860 has one implementation owner assigned by CTO, one explicit unblock path for `cron-subdomain-takeover.yml` workflow remediation with run-level evidence, and a fresh heartbeat evidences reachable localhost preflight with non-blocking freshness (`npm run freshness:check` exit 0).
    Dependencies: CTO assigns implementation owner for AGN-860; assigned engineer verifies failing `cron-subdomain-takeover.yml` run id/log evidence and patches the failure path with fresh success proof; platform engineer restores localhost:3023 reachability so freshness preflight can run.

- 2026-05-05 AGN-857 Investigate broken workflow: Collect Twitter Signals (reassignment redistribution triage):
  - Reassignment intake: board comment `38414d08-b656-47d6-9405-f3eb827a1a12` rerouted AGN-857 to Sprint Triage because original assignee was missing/removed.
  - Mandatory opening re-run completed (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/archive/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`).
  - Path verification note: `docs/AUDIT-2026-05-04.md` is missing in this repo path; canonical audit location resolves to `docs/archive/AUDIT-2026-05-04.md`.
  - Verified `npm run freshness:check` failed with `local server not reachable at http://localhost:3023` (`ECONNREFUSED`), so localhost:3023 is missing in this heartbeat.
  - [ ] AGN-857 redistribution continuity follow-through (owner: PM triage). Done when AGN-857 has one implementation owner assigned by CTO, one explicit unblock path for `Collect Twitter Signals` workflow remediation with run-level evidence, and a fresh heartbeat evidences reachable localhost preflight with non-blocking freshness (`npm run freshness:check` exit 0).
    Dependencies: CTO assigns implementation owner for AGN-857; assigned engineer verifies failing `Collect Twitter Signals` workflow run id/log evidence and patches the failure path with fresh success proof; platform engineer restores localhost:3023 reachability so freshness preflight can run.
- 2026-05-05 AGN-862 Investigate broken workflow: release-cdn-purge-and-targeted-refresh.yml (reassignment redistribution triage):
  - Reassignment intake: board comment `99dc17ac-5d5c-4e80-90b3-65dbd0a1a6fc` rerouted AGN-862 to Sprint Triage because original assignee was missing/removed.
  - Mandatory opening re-run completed (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/archive/AUDIT-2026-05-04.md`, `docs/archive/forensic-2026-05-pre/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`).
  - Path verification note: `docs/AUDIT-2026-05-04.md` is missing in this repo path; canonical audit location resolves to `docs/archive/AUDIT-2026-05-04.md`.
  - Verified `npm run freshness:check` failed with `local server not reachable at http://localhost:3023` (`ECONNREFUSED`), so localhost:3023 is missing in this heartbeat.
  - [ ] AGN-862 redistribution continuity follow-through (owner: PM triage). Done when AGN-862 has one implementation owner assigned by CTO, one explicit unblock path for `release-cdn-purge-and-targeted-refresh.yml` workflow remediation with run-level evidence, and a fresh heartbeat evidences reachable localhost preflight with non-blocking freshness (`npm run freshness:check` exit 0).
    Dependencies: CTO assigns implementation owner for AGN-862; assigned engineer verifies failing `release-cdn-purge-and-targeted-refresh.yml` run id/log evidence and patches the failure path with fresh success proof; platform engineer restores localhost:3023 reachability so freshness preflight can run.

- 2026-05-05 AGN-864 Investigate broken workflow: Refresh Bluesky signals (reassignment redistribution triage):
  - Reassignment intake: board comment `b854e207-e2b6-4830-a78e-92eebdde97f2` rerouted AGN-864 to Sprint Triage because original assignee was missing/removed.
  - Mandatory opening re-run completed (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/archive/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`).
  - Path verification note: `docs/AUDIT-2026-05-04.md` is missing in this repo path; canonical audit location resolves to `docs/archive/AUDIT-2026-05-04.md`.
  - Verified `npm run freshness:check` failed with `local server not reachable at http://localhost:3023` (`ECONNREFUSED`), so localhost:3023 is missing in this heartbeat.
  - [ ] AGN-864 redistribution continuity follow-through (owner: PM triage). Done when AGN-864 has one implementation owner assigned by CTO, one explicit unblock path for `Refresh Bluesky signals` workflow remediation with run-level evidence, and a fresh heartbeat evidences reachable localhost preflight with non-blocking freshness (`npm run freshness:check` exit 0).
    Dependencies: CTO assigns implementation owner for AGN-864; assigned engineer verifies failing `Refresh Bluesky signals` workflow run id/log evidence and patches the failure path with fresh success proof; platform engineer restores localhost:3023 reachability so freshness preflight can run.

- 2026-05-05 AGN-865 Investigate broken workflow: Refresh Lobsters signals (reassignment redistribution triage):
  - Reassignment intake: board comment `6edc942c-db7f-4355-a7e6-596acc600ef4` rerouted AGN-865 to Sprint Triage because original assignee was missing/removed.
  - Mandatory opening re-run completed (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/archive/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`).
  - Path verification note: `docs/AUDIT-2026-05-04.md` is missing in this repo path; canonical audit location resolves to `docs/archive/AUDIT-2026-05-04.md`.
  - Verified `npm run freshness:check` failed with `local server not reachable at http://localhost:3023` (`ECONNREFUSED`), so localhost:3023 is missing in this heartbeat.
  - [ ] AGN-865 redistribution continuity follow-through (owner: PM triage). Done when AGN-865 has one implementation owner assigned by CTO, one explicit unblock path for `Refresh Lobsters signals` workflow remediation with run-level evidence, and a fresh heartbeat evidences reachable localhost preflight with non-blocking freshness (`npm run freshness:check` exit 0).
    Dependencies: CTO assigns implementation owner for AGN-865; assigned engineer verifies failing `Refresh Lobsters signals` workflow run id/log evidence and patches the failure path with fresh success proof; platform engineer restores localhost:3023 reachability so freshness preflight can run.

- 2026-05-05 AGN-866 Investigate broken workflow: secrets-scan.yml (reassignment redistribution triage):
  - Reassignment intake: board comment `bff3fe71-13b8-4aaa-a0c9-6e971306b0fb` rerouted AGN-866 to Sprint Triage because original assignee was missing/removed.
  - Mandatory opening re-run completed (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/archive/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`).
  - Path verification note: `docs/AUDIT-2026-05-04.md` is missing in this repo path; canonical audit location resolves to `docs/archive/AUDIT-2026-05-04.md`.
  - Verified `npm run freshness:check` failed with `local server not reachable at http://localhost:3023` (`ECONNREFUSED`), so localhost:3023 is missing in this heartbeat.
  - [ ] AGN-866 redistribution continuity follow-through (owner: PM triage). Done when AGN-866 has one implementation owner assigned by CTO, one explicit unblock path for `secrets-scan.yml` workflow remediation with run-level evidence, and a fresh heartbeat evidences reachable localhost preflight with non-blocking freshness (`npm run freshness:check` exit 0).
    Dependencies: CTO assigns implementation owner for AGN-866; assigned engineer verifies failing `secrets-scan.yml` run id/log evidence and patches the failure path with fresh success proof; platform engineer restores localhost:3023 reachability so freshness preflight can run.

- 2026-05-05 AGN-867 Investigate broken workflow: sre-actions-visibility.yml (reassignment redistribution triage):
  - Reassignment intake: board comment `1866b43e-7db5-4a38-9fb2-32634de01299` rerouted AGN-867 to Sprint Triage because original assignee was missing/removed.
  - Mandatory opening re-run completed (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/archive/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`).
  - Path verification note: `docs/AUDIT-2026-05-04.md` is missing in this repo path; canonical audit location resolves to `docs/archive/AUDIT-2026-05-04.md`.
  - Verified `npm run freshness:check` failed with `local server not reachable at http://localhost:3023` (`ECONNREFUSED`), so localhost:3023 is missing in this heartbeat.
  - [ ] AGN-867 redistribution continuity follow-through (owner: PM triage). Done when AGN-867 has one implementation owner assigned by CTO, one explicit unblock path for `sre-actions-visibility.yml` workflow remediation with run-level evidence, and a fresh heartbeat evidences reachable localhost preflight with non-blocking freshness (`npm run freshness:check` exit 0).
    Dependencies: CTO assigns implementation owner for AGN-867; assigned engineer verifies failing `sre-actions-visibility.yml` run id/log evidence and patches the failure path with fresh success proof; platform engineer restores localhost:3023 reachability so freshness preflight can run.

- 2026-05-05 AGN-868 Investigate broken workflow: sre-cron-secret-rotation-guard.yml (reassignment redistribution triage):
  - Reassignment intake: board comment `7ee56107-f7af-4b2d-900d-be5ac130153a` rerouted AGN-868 to Sprint Triage because original assignee was missing/removed.
  - Mandatory opening re-run completed (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/archive/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`).
  - Path verification note: `docs/AUDIT-2026-05-04.md` is missing in this repo path; canonical audit location currently resolves to `docs/archive/AUDIT-2026-05-04.md`.
  - Verified `npm run freshness:check` failed with `local server not reachable at http://localhost:3023` (`ECONNREFUSED`), so localhost:3023 is missing in this heartbeat.
  - [ ] AGN-868 redistribution continuity follow-through (owner: PM triage). Done when AGN-868 has one implementation owner assigned by CTO, one explicit unblock path for `sre-cron-secret-rotation-guard.yml` workflow remediation with evidence, and a fresh heartbeat evidences reachable localhost preflight with non-blocking freshness (`npm run freshness:check` exit 0).
    Dependencies: CTO assigns implementation owner for AGN-868; assigned engineer verifies failing `sre-cron-secret-rotation-guard.yml` workflow evidence and patches the failure path with fresh success proof; platform engineer restores localhost:3023 reachability so freshness preflight can run.

- 2026-05-05 AGN-869 Investigate broken workflow: sre-redis-restore-drill.yml (reassignment redistribution triage):
  - Reassignment intake: board comment `1e5f439d-5398-4e11-b3c3-8fa5b5f04b57` rerouted AGN-869 to Sprint Triage because original assignee was missing/removed.
  - Mandatory opening re-run completed (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/archive/AUDIT-2026-05-04.md`, `docs/archive/forensic-2026-05-pre/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`).
  - Path verification note: `docs/AUDIT-2026-05-04.md` is missing in this repo path; canonical audit location currently resolves to `docs/archive/AUDIT-2026-05-04.md`.
  - Verified `npm run freshness:check` failed with `local server not reachable at http://localhost:3023` (`ECONNREFUSED`), so localhost:3023 is missing in this heartbeat.
  - [ ] AGN-869 redistribution continuity follow-through (owner: PM triage). Done when AGN-869 has one implementation owner assigned by CTO, one explicit unblock path for `sre-redis-restore-drill.yml` workflow remediation with run-level evidence, and a fresh heartbeat evidences reachable localhost preflight with non-blocking freshness (`npm run freshness:check` exit 0).
    Dependencies: CTO assigns implementation owner for AGN-869; assigned engineer verifies failing `sre-redis-restore-drill.yml` run id/log evidence and patches the failure path with fresh success proof; platform engineer restores localhost:3023 reachability so freshness preflight can run.

- 2026-05-05 AGN-863 Investigate broken workflow: Refresh arXiv signals (reassignment redistribution triage):
  - Reassignment intake: board comment `55884d6c-f49b-4020-8bc7-7bf8e5d7b591` rerouted AGN-863 to Sprint Triage because original assignee was missing/removed.
  - Mandatory opening re-run completed (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/archive/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`).
  - Path verification note: `docs/AUDIT-2026-05-04.md` is missing in this repo path; canonical audit location currently resolves to `docs/archive/AUDIT-2026-05-04.md`.
  - Verified `npm run freshness:check` failed with `local server not reachable at http://localhost:3023` (`ECONNREFUSED`), so localhost:3023 is missing and product preflight is stale-blocked in this heartbeat.
  - [ ] AGN-863 redistribution continuity follow-through (owner: PM triage). Done when AGN-863 has one data/backend implementation owner assigned by CTO, one explicit unblock path for `Refresh arXiv signals` workflow run-failure verification and repair evidence, and a fresh heartbeat proves localhost preflight is reachable with non-blocking freshness (`npm run freshness:check` exit 0).
    Dependencies: CTO assigns implementation owner for AGN-863; assigned engineer verifies failing `Refresh arXiv signals` run id/log evidence and lands workflow remediation with fresh success proof; platform engineer restores localhost:3023 reachability so freshness preflight can run.

- 2026-05-05 AGN-870 Investigate broken workflow: Sync TrustMRR revenue overlays (reassignment redistribution triage):
  - Reassignment intake: board comment `1a5e06a1-167a-4852-b53c-86715100df36` rerouted AGN-870 to Sprint Triage because original assignee was missing/removed.
  - Mandatory opening re-run completed (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/archive/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`).
  - Path verification note: `docs/AUDIT-2026-05-04.md` is missing in this repo path; canonical audit location currently resolves to `docs/archive/AUDIT-2026-05-04.md`.
  - Verified `npm run freshness:check` failed with `local server not reachable at http://localhost:3023` (`ECONNREFUSED`), so localhost:3023 is missing in this heartbeat.
  - [ ] AGN-870 redistribution continuity follow-through (owner: PM triage). Done when AGN-870 has one implementation owner assigned by CTO, one explicit unblock path for Sync TrustMRR workflow remediation with evidence, and a fresh heartbeat evidences reachable localhost preflight with non-blocking freshness (`npm run freshness:check` exit 0).
    Dependencies: CTO assigns implementation owner for AGN-870; assigned engineer verifies failing `sync-trustmrr` workflow evidence and patches the failure path for revenue overlay sync; platform engineer restores localhost:3023 reachability so freshness preflight can run.
- 2026-05-05 AGN-1473 [Bug][P1] /mcp route external icon/avatar request failures (ORB/404) with console noise (reassignment redistribution triage):
  - Reassignment intake: board comment `10a1d975-0c16-4058-b82a-0001640afb5b` rerouted AGN-1473 to Sprint Triage because original assignee was missing/removed.
  - Mandatory opening re-run completed (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/archive/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`).
  - Path verification note: `docs/AUDIT-2026-05-04.md` is missing in this repo path; canonical audit location currently resolves to `docs/archive/AUDIT-2026-05-04.md`.
  - Verified `npm run freshness:check` failed with `local server not reachable at http://localhost:3023` (`ECONNREFUSED`), so localhost:3023 is missing in this heartbeat.
  - [ ] AGN-1473 redistribution continuity follow-through (owner: PM triage). Done when AGN-1473 has one frontend implementation owner assigned by CTO, one explicit unblock path for `/mcp` external icon/avatar ORB/404 failure handling plus console-noise reduction verification, and a fresh heartbeat evidences reachable localhost preflight with non-blocking freshness (`npm run freshness:check` exit 0).
    Dependencies: CTO assigns implementation owner for AGN-1473; frontend engineer verifies/patches `/mcp` external icon/avatar fallback behavior for ORB/404 failures and console noise suppression; platform engineer restores localhost:3023 reachability so freshness preflight can run.
- 2026-05-05 AGN-871 Investigate broken workflow: trendingrepo-worker (reassignment redistribution triage):
  - Reassignment intake: board comment `0ccd56f9-a929-4185-8db3-c043cb1745cc` rerouted AGN-871 to Sprint Triage because original assignee was missing/removed.
  - Mandatory opening re-run completed (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/archive/AUDIT-2026-05-04.md`, `docs/archive/forensic-2026-05-pre/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`).
  - Path verification note: `docs/AUDIT-2026-05-04.md` is missing in this repo path; canonical audit location resolves to `docs/archive/AUDIT-2026-05-04.md`.
  - Verified `npm run freshness:check` failed with `local server not reachable at http://localhost:3023` (`ECONNREFUSED`), so localhost:3023 is missing in this heartbeat.
  - Verified workflow-run inspection attempt failed: `gh run list --workflow trendingrepo-worker.yml --limit 10` -> `HTTP 401 Bad credentials`.
  - [ ] AGN-871 redistribution continuity follow-through (owner: PM triage). Done when AGN-871 has one implementation owner assigned by CTO, one authenticated workflow failure evidence packet for `trendingrepo-worker` (run id + failing step + fix scope), and a fresh heartbeat evidences reachable localhost preflight with non-blocking freshness (`npm run freshness:check` exit 0).
    Dependencies: CTO assigns implementation owner for AGN-871; assigned engineer uses authenticated `gh` access to collect failing run evidence and implement remediation; platform engineer restores localhost:3023 reachability so freshness preflight can pass.
- 2026-05-05 AGN-726 [P0 backend] DROP REPO should return already_tracked for known tracked repos (reassignment redistribution triage):
  - Reassignment intake: board comment `0f2b2ebe-c4cc-4a4d-ae02-917ed8c3b2b4` rerouted AGN-726 to Sprint Triage because original assignee was missing/removed.
  - Mandatory opening re-run completed (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/archive/AUDIT-2026-05-04.md`, `docs/archive/forensic-2026-05-pre/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`).
  - Path verification note: `docs/AUDIT-2026-05-04.md` is missing in this repo path; canonical audit location currently resolves to `docs/archive/AUDIT-2026-05-04.md`.
  - Verified `npm run freshness:check` failed with `local server not reachable at http://localhost:3023` (`ECONNREFUSED`), so localhost:3023 is missing in this heartbeat.
  - [ ] AGN-726 redistribution continuity follow-through (owner: PM triage). Done when AGN-726 has one backend implementation owner assigned by CTO, one explicit unblock path for DROP REPO `already_tracked` contract verification/fix, and a fresh heartbeat evidences reachable localhost preflight with non-blocking freshness (`npm run freshness:check` exit 0).
    Dependencies: CTO assigns implementation owner for AGN-726; backend engineer validates and patches DROP REPO `already_tracked` behavior for known tracked repos; platform engineer restores localhost:3023 reachability so freshness preflight can run.
- 2026-05-05 AGN-9 AGNT full-sync failing (reassignment redistribution triage):
  - Reassignment intake: board comment `c1a7376d-8b96-4c2c-af5d-deb105e26f59` rerouted AGN-9 to Sprint Triage because original assignee was missing/removed.
  - Mandatory opening re-run completed (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/archive/AUDIT-2026-05-04.md`, `docs/archive/forensic-2026-05-pre/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`).
  - Verified `npm run freshness:check` reached `http://localhost:3023` (not missing) and failed with `GET /api/health?soft=1 -> HTTP 500 Internal Server Error`, so product is stale/degraded.
  - [ ] AGN-9 redistribution continuity follow-through (owner: PM triage). Done when AGN-9 has one implementation owner assigned by CTO, one explicit unblock path for full-sync remediation, and a fresh heartbeat evidences reachable localhost preflight with non-blocking freshness (`npm run freshness:check` exit 0).
    Dependencies: CTO assigns implementation owner for AGN-9 full-sync recovery; assigned engineer posts full-sync failure evidence and fix proof; platform engineer restores `/api/health?soft=1` to HTTP 200 and reruns `npm run freshness:check` to pass.

- 2026-05-05 AGN-1515 [Sprint 1 audit] Sprint Triage sprint-vs-backlog boundary enforcement check (documentation scope this heartbeat):
  - Mandatory opening re-run completed (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`).
  - Verified `npm run freshness:check` failed with `ECONNRESET`; direct probe `http://localhost:3023/api/health?soft=1` failed with connection error, so localhost is missing/unreachable in this heartbeat.
  - Boundary enforcement finding: Sprint surface still carries long-form continuity detail for multiple out-of-scope triage rows, increasing boundary-noise risk; keep these documentation-only and backlog-first unless CTO reprioritizes.
  - [ ] AGN-1515 sprint-boundary enforcement continuity follow-through (owner: PM triage). Done when sprint rows remain scope-coherent with one owner + explicit blocker/action + binary done-state wording, and out-of-scope execution remains backlog-only unless CTO reprioritizes.
    Dependencies: platform engineer restores localhost:3023 and returns `npm run freshness:check` to pass; CTO decides whether overlapping sprint triage rows are collapsed to pointer-only references.

- 2026-05-05 AGN-1539 [Sprint 1 audit] Sprint Triage parent-child linkage hygiene check AGN-58 tree (documentation scope this heartbeat):
  - Mandatory opening re-run completed (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`).
  - Verified `npm run freshness:check` reached `http://localhost:3023` (not missing) and failed with `GET /api/health?soft=1 -> HTTP 500 Internal Server Error` (product stale/degraded).
  - AGN-58 linkage hygiene finding: parent-linkage ambiguity remains unresolved for `AGN-172`, `AGN-173`, `AGN-185`, `AGN-230`, `AGN-231`; sprint/backlog linkage rows remain synchronized and triage-only pending CTO/board decision.
  - [ ] AGN-1539 parent-child linkage hygiene continuity follow-through (owner: PM triage). Done when AGN-58 parent-child rows align to one explicit parent model with one owner + explicit blocker/action + binary done-state wording in sprint/backlog notes.
    Dependencies: CTO/board confirms whether `AGN-172`, `AGN-173`, `AGN-185`, `AGN-230`, `AGN-231` are direct AGN-58 children or AGN-172-only descendants; platform engineer restores `/api/health?soft=1` to HTTP 200 and returns `npm run freshness:check` to exit 0.

- 2026-05-05 AGN-1538 [Sprint 1 audit] Sprint Triage blocked-issue owner/action completeness sweep (documentation scope this heartbeat):
  - Mandatory opening re-run completed (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`).
  - Verified `npm run freshness:check` reached localhost (`http://localhost:3023`, not missing) and failed with `GET /api/cron/freshness/state -> HTTP 500 Internal Server Error`; product is stale/degraded in this heartbeat.
  - [ ] AGN-1538 blocked-owner/action completeness continuity follow-through (owner: PM triage). Done when blocked issue rows stay owner/action complete with one owner + one unblock action + one binary done-state line and no out-of-scope execution leakage into Sprint 1.
    Dependencies: platform engineer restores `/api/cron/freshness/state` to HTTP 200 and returns `npm run freshness:check` to exit 0; CTO/platform sets Vercel `SENTRY_DSN` and provides canary evidence; CTO confirms any sprint-priority override before scope reassignment.

- 2026-05-05 AGN-1540 [Sprint 1 audit] Sprint Triage in-progress stagnation scan and handoff map (documentation scope this heartbeat):
  - Mandatory opening re-run completed (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`).
  - Verified `npm run freshness:check` reached `http://localhost:3023` (localhost not missing) and failed with `GET /api/health?soft=1 -> HTTP 500 Internal Server Error` (product stale/degraded).
  - Stagnation handoff map recorded in sprint notes for active PM triage cohort (`AGN-1514`, `AGN-1293`, `AGN-1354`, `AGN-1355`, `AGN-1292`, `AGN-1211`, `AGN-1212`, `AGN-1294`, `AGN-1513`) with explicit next-action owner lanes (platform engineer, CTO/platform, CTO/board, PM triage).
  - [x] AGN-1540 stagnation-handoff continuity follow-through (owner: PM triage). Closed by CTO comment (`2026-05-05`: "already shipped", close as done) after sprint/backlog stagnation map publication.
    Done when each stagnated `in_progress` issue has one owner, one explicit next action, one blocker owner/action line, and either terminal status (`done`/`blocked`) or child split/handoff linkage, while Sprint 1 scope remains locked.
    Dependencies: platform engineer restores freshness preflight to pass (`/api/health?soft=1` HTTP 200 and `npm run freshness:check` exit 0); CTO/platform sets Vercel `SENTRY_DSN` and provides canary evidence; CTO/board confirms AGN-58 lineage decision for `AGN-172`, `AGN-173`, `AGN-185`, `AGN-230`, `AGN-231`.

- 2026-05-05 AGN-1514 [Sprint 1 audit] Sprint Triage parent-child linkage hygiene refresh (documentation scope this heartbeat):
  - Mandatory opening re-run completed (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`).
  - Verified `npm run freshness:check` timed out while contacting `http://localhost:3023`; localhost was unreachable from this heartbeat path, so preflight close-readiness verification is blocked.
  - Linkage hygiene continuity scope: keep AGN-58/AGN-172 parent-child rows synchronized with one owner, explicit blocker owner/action lines, and binary done-state wording; keep out-of-scope execution backlog-only unless CTO reprioritizes.
  - [ ] AGN-1514 parent-child linkage hygiene continuity follow-through (owner: PM triage). Done when AGN-58 mapping ambiguity (`AGN-172`, `AGN-173`, `AGN-185`, `AGN-230`, `AGN-231`) is resolved by CTO/board decision and sprint/backlog rows are aligned to that decision with one owner + explicit blockers/actions + binary done-state text.
    Dependencies: CTO/board confirms whether the five ambiguous issues are AGN-58 children or AGN-172-only descendants; platform engineer restores localhost:3023 reachability and reruns `npm run freshness:check` to a passing state.

- 2026-05-05 AGN-1482 Recover stalled issue AGN-1353 (documentation + recovery evidence this heartbeat):
  - Mandatory opening protocol completed in order:
    1) `CLAUDE.md`
    2) `docs/ENGINE.md`
    3) `docs/SITE-WIREMAP.md`
    4) `docs/AUDIT-2026-05-04.md`
    5) `docs/forensic/00-INDEX.md`
    6) `tasks/CURRENT-SPRINT.md`
    7) `tasks/BACKLOG.md`
  - Freshness execution evidence (`npm run freshness:check` at `2026-05-05T01:15:29.751Z`): localhost `http://localhost:3023` reachable, command completed, and failed on product freshness state with `green=37 yellow=11 red=2 dead=0 blocking_non_green=11 advisory_non_green=2`.
  - Failure classification for AGN-1353 recovery: **product failure**, not missing localhost. Highest-severity blockers in this run: `trending-repos=RED`, `producthunt=RED`; additional blocking yellows include `agent-commerce`, `awesome-skills`, `claude-rss`, `lobsters`, `npm`, `openai-rss`, `staleness-report`, `twitter`, `unknown-mentions`.
  - Paperclip control-plane blocker in this runtime: `curl http://192.168.192.1:3100` failed with connection refused, so queue-depth API reads and terminal issue PATCH could not be executed from this heartbeat environment.
  - [ ] AGN-1482 recovery continuity follow-through (owner: CTO). Done when AGN-1353 is re-advanced with (a) freshness failure mode logged as product-state failure, (b) explicit unblock owner/action for RED sources (`trending-repos`, `producthunt`), and (c) Paperclip issue status/comment successfully patched after API connectivity is restored.
    Dependencies: Paperclip API endpoint reachable from runtime; platform/data owners clear blocking non-green freshness rows; CTO posts terminal status PATCH once control-plane is available.

- 2026-05-05 AGN-1353 [Sprint 1 audit] Parent-child linkage integrity pass for AGN-58 tree (documentation scope this heartbeat):
  - Mandatory opening re-run completed (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`).
  - Verified AGN-58 linkage directly from Paperclip API payload (`/api/companies/{companyId}/issues?parentId=cb773b12-65b5-494c-a695-c8f409b47bf0&limit=1000`, 314 children). Parent/status/owner checks passed for AGN-58 graph rows except one drift: `AGN-363` is referenced in docs but is not returned as AGN-58 child.
  - Correction applied in this heartbeat: removed `AGN-363` from Sprint AGN-58 child graph and tagged AGN-363 linkage as a board decision item (relink or keep out of AGN-58 graph).
  - [ ] AGN-1353 parent-child linkage integrity continuity follow-through (owner: PM triage). Done when AGN-58 parent-child rows stay synchronized across sprint/backlog notes with one owner + explicit `Blocked on`/`Needs` wording + binary done-state text, and out-of-scope execution remains backlog-only unless CTO reprioritizes.
    Dependencies: board/CTO decides whether AGN-363 should be relinked under AGN-58 parent (`cb773b12-65b5-494c-a695-c8f409b47bf0`) or remain excluded from AGN-58 graph references; PM triage mirrors decision in sprint/backlog docs.

- 2026-05-05 AGN-1354 [Sprint 1 audit] Blocked issue owner-action completeness sweep (documentation scope this heartbeat):
  - Mandatory opening re-run completed (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`).
  - Verified `npm run freshness:check` failed before endpoint checks because `tsx` is missing (`'tsx' is not recognized as an internal or external command`), and direct probe `http://localhost:3023/api/health?soft=1` failed with connection error (`Unable to connect to the remote server`), so localhost:3023 is missing.
  - [ ] AGN-1354 owner-action completeness continuity follow-through (owner: PM triage). Done when blocked issue rows remain owner/action complete with one owner + one unblock action + one binary done-state line across sprint/backlog notes.
    Dependencies: platform engineer restores local app reachability on localhost:3023 and local toolchain support so `npm run freshness:check` runs and exits 0; CTO/platform provides Vercel `SENTRY_DSN` canary evidence where Sprint 1 closure depends on it; CTO confirms any sprint-priority override before scope reassignment.

- 2026-05-05 AGN-1355 [Sprint 1 audit] Sprint/backlog boundary integrity recheck (documentation scope this heartbeat):
  - Mandatory opening re-run completed (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`).
  - Verified `npm run freshness:check` failed before health evaluation with `'tsx' is not recognized as an internal or external command`; localhost:3023 missing/stale status is unverified from this run due to toolchain failure.
  - Scope decision: keep Sprint 1 execution locked to Phase 1.5 + local freshness unblock and keep out-of-scope execution backlog-first unless CTO reprioritizes.
  - [ ] AGN-1355 boundary integrity continuity follow-through (owner: PM triage). Done when sprint/backlog ownership and acceptance metadata stay synchronized with one owner + explicit blocker/needs lines + binary done-state wording, and `npm run freshness:check` executes successfully and exits 0.
    Dependencies: platform engineer restores `tsx` availability in local toolchain so freshness preflight can run and classify localhost status; CTO/platform provides Vercel `SENTRY_DSN` verification evidence where Sprint closure depends on it.

- 2026-05-05 AGN-1293 [Sprint 1 audit] Parent-child dependency map synchronization check (documentation scope this heartbeat):
  - Mandatory opening re-run completed (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`).
  - Verified `npm run freshness:check` failed with `ECONNREFUSED` to `http://localhost:3023` (localhost missing in this heartbeat).
  - Tracker-vs-doc mismatch snapshot:
    - Missing AGN-58 tracker linkage for issues currently listed under AGN-58 graph in sprint docs: `AGN-172`, `AGN-173`, `AGN-185`, `AGN-230`, `AGN-231`.
  - [ ] AGN-1293 dependency-map synchronization continuity follow-through (owner: PM triage). Done when AGN-58 mismatch list is resolved by explicit CTO/board parent-model decision and sprint/backlog graph rows match tracker parent-link intent with one owner + explicit `Blocked on`/`Needs` wording + binary done-state text.
    Dependencies: CTO/board confirms whether `AGN-172`, `AGN-173`, `AGN-185`, `AGN-230`, `AGN-231` are true AGN-58 children or AGN-172-only descendants; PM triage applies resulting row-alignment patch in sprint/backlog notes.

- 2026-05-05 AGN-1294 [Sprint 1 audit] Blocked issue unblock-owner/action completeness pass (documentation scope this heartbeat):
  - Mandatory opening re-run completed (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`).
  - Verified `npm run freshness:check` failed with `GET http://localhost:3023/api/health?soft=1 -> HTTP 500 Internal Server Error`; localhost is reachable but product is stale/degraded.
  - [ ] AGN-1294 unblock-owner/action completeness continuity follow-through (owner: PM triage). Done when blocked issue rows remain owner/action complete with one owner + one unblock action + one binary done-state line, and freshness preflight returns to passing state.
    Dependencies: platform engineer restores `/api/health?soft=1` to HTTP 200 and clears blocking freshness failures so `npm run freshness:check` exits 0; CTO/platform sets Vercel `SENTRY_DSN` with canary evidence; CTO confirms any sprint-priority override before scope reassignment.
- 2026-05-05 AGN-1513 [Sprint 1 audit] Sprint Triage blocked-owner/action completeness pass (documentation scope this heartbeat):
  - Mandatory opening re-run completed (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`).
  - Verified `npm run freshness:check` at `2026-05-05T09:18:41.7074336+08:00` failed with `request timed out while contacting http://localhost:3023`.
  - [ ] AGN-1513 blocked-owner/action completeness continuity follow-through (owner: PM triage). Done when blocked issue rows remain owner/action complete with one owner + one unblock action + one binary done-state line, and freshness preflight returns to passing state.
    Dependencies: platform engineer restores local app responsiveness on `localhost:3023` and reruns `npm run freshness:check` to a non-timeout result (then exit 0); CTO/platform sets Vercel `SENTRY_DSN` with canary evidence; CTO confirms any sprint-priority override before scope reassignment.
- 2026-05-05 AGN-1292 [Sprint 1 audit] Sprint/backlog boundary integrity refresh (documentation scope this heartbeat):
  - Mandatory opening re-run completed (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`).
  - Verified `npm run freshness:check` failed with `ECONNREFUSED` (`local server not reachable at http://localhost:3023`), so localhost is missing in this heartbeat.
  - Scope decision: keep Sprint 1 execution constrained to Phase 1.5 + local freshness unblock and keep out-of-scope execution backlog-first unless CTO reprioritizes.
  - Explicit unblock steps (CTO sweep requirement):
    1. Env var name: `SENTRY_DSN` (Vercel Production).
    2. Dashboard URL: `https://vercel.com/dashboard` -> project `trendingrepo.com` -> `Settings` -> `Environment Variables`.
    3. Command: from repo root, run `npm run dev` (keep server running), then in a second terminal run `npm run freshness:check`.
    4. Decision needed: CTO confirms whether repeated Sprint boundary audit rows (`AGN-1293`, `AGN-1354`, `AGN-1355`) remain active in Sprint 1 or are collapsed to pointer-only.
  - [ ] AGN-1292 boundary integrity continuity follow-through (owner: PM triage). Done when sprint/backlog scope lines remain synchronized with one owner + explicit blocker/needs lines + binary done-state wording, and non-Sprint-1 execution stays backlog-only unless CTO reprioritizes.
    Dependencies: platform engineer restores local app reachability on `localhost:3023` and returns `npm run freshness:check` to executable/pass state; CTO/platform provides Vercel `SENTRY_DSN` verification evidence where Sprint closure depends on it.
- 2026-05-05 AGN-1212 [Sprint 1 audit] Sprint Triage parent-child dependency hygiene scan (AGN-58 tree) (documentation scope this heartbeat):
  - Mandatory opening re-run completed (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`).
  - Verified `npm run freshness:check` failed with `GET http://localhost:3023/api/health?soft=1 -> HTTP 500 Internal Server Error`; localhost is reachable but the product is stale/degraded.
  - [ ] AGN-1212 parent-child dependency hygiene continuity follow-through (owner: PM triage). Done when AGN-58 parent-child rows stay synchronized across sprint/backlog notes with one owner + explicit blocker/action lines + binary done-state wording, and out-of-scope execution remains backlog-first unless CTO reprioritizes.
    Dependencies: platform engineer restores `/api/health?soft=1` to HTTP 200 and returns `npm run freshness:check` to exit 0; CTO/platform provides Vercel `SENTRY_DSN` canary evidence where Sprint closure depends on it; CTO confirms any sprint-priority override before cross-sprint reassignment.
- 2026-05-05 AGN-1211 [Sprint 1 audit] Sprint Triage sprint/backlog boundary integrity check (documentation scope this heartbeat):
  - Mandatory opening re-run completed (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`).
  - Verified `npm run freshness:check` at `2026-05-05T05:08:34.2075113+08:00` reached localhost (`http://localhost:3023`, not missing) but failed with `GET /api/health?soft=1 -> HTTP 500 Internal Server Error` (product stale/degraded).
  - Scope decision: keep Sprint 1 execution locked to Phase 1.5 + local freshness unblock; keep out-of-scope execution backlog-only unless CTO reprioritizes.
  - [ ] AGN-1211 boundary integrity continuity follow-through (owner: PM triage). Done when sprint/backlog ownership and acceptance metadata remain synchronized with one owner + explicit blocker/needs lines + binary done-state wording, and non-Sprint-1 execution stays backlog-first unless CTO reprioritizes.
    Dependencies: platform engineer restores local freshness endpoint behavior (`/api/health?soft=1` returns HTTP 200 and `npm run freshness:check` exits 0); CTO/platform provides Vercel `SENTRY_DSN` verification evidence for closure readiness.
- 2026-05-05 AGN-1156 [Sprint 1 audit] Parent-child linkage drift scan for active epics (documentation scope this heartbeat):
  - Mandatory opening re-run completed (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`).
  - Verified `npm run freshness:check` at `2026-05-05T04:39:31.294Z` reached localhost (`http://localhost:3023`, not missing) with `health=ok sourceStatus=ok`, but failed with `green=40`, `yellow=9`, `red=1`, `blocking_non_green=8`, and `Sentry: MISSING`.
  - Drift scan result: active epic AGN-58 child table included `AGN-201` without a backlog continuity row; AGN-201 continuity row is now added to restore sprint/backlog parent-child parity.
  - [ ] AGN-1156 linkage drift continuity follow-through (owner: PM triage). Done when every active AGN-58/AGN-172 child listed in `tasks/CURRENT-SPRINT.md` has a matching backlog continuity row with one owner + explicit dependencies + binary done-state wording.
    Dependencies: platform engineer restores blocking freshness rows to GREEN and keeps localhost preflight passing; CTO/platform sets Vercel `SENTRY_DSN` with canary evidence; CTO confirms any sprint-priority override before cross-sprint scope changes.
- 2026-05-05 AGN-201 freshness gate root-cause packet linkage parity restoration (documentation scope this heartbeat):
  - Parent-child drift fix: AGN-201 is present in active AGN-58 graph in Sprint notes and is now explicitly mirrored in backlog continuity notes to remove orphan-linkage risk.
  - [ ] AGN-201 continuity row maintenance (owner: platform engineer). Done when AGN-201 remains present across sprint/backlog linkage surfaces with one owner, explicit blocker/needs text, and binary done-state wording aligned to latest preflight evidence.
    Dependencies: platform engineer keeps `npm run freshness:check` evidence current and drives freshness-state recovery to exit 0; PM triage keeps AGN-58 graph and backlog continuity lines synchronized.
- 2026-05-05 AGN-1157 [Sprint 1 audit] In-progress stagnation triage with handoff recommendations (documentation scope this heartbeat):
  - Mandatory opening re-run completed (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`).
  - Verified `npm run freshness:check` at `2026-05-05T04:39:25.788Z` reached localhost (`http://localhost:3023`, not missing) but failed with `green=40`, `yellow=9`, `red=1`, `blocking_non_green=8`, `advisory_non_green=2`, `Sentry: MISSING` (`trending-repos` RED).
  - [ ] AGN-1157 stagnation-handoff continuity follow-through (owner: PM triage). Done when every stagnated `in_progress` issue has one owner, one explicit next action, one blocker owner/action line, and either a terminal status (`done`/`blocked`) or a child split/handoff reference, without pulling out-of-scope execution into Sprint 1.
    Dependencies: platform engineer restores blocking freshness rows to GREEN within budget; CTO/platform sets Vercel `SENTRY_DSN` and provides canary evidence; CTO confirms any sprint-priority override before cross-sprint reassignment.
- 2026-05-05 AGN-1140 [Sprint 1 audit] Parent-child dependency hygiene refresh under AGN-58 (documentation scope this heartbeat):
  - Mandatory opening re-run completed (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`).
  - Verified `npm run freshness:check` at `2026-05-05T04:25:24.6604535+08:00` reached localhost (`http://localhost:3023`, not missing) and failed with `health=stale`, `blocking_non_green=27`, `dead=18`, `Sentry: MISSING`.
  - [ ] AGN-1140 dependency hygiene continuity follow-through (owner: PM triage). Done when AGN-58 parent-child rows stay synchronized across sprint/backlog notes with one owner, explicit `Blocked on`/`Needs` wording, and binary done-state text on each related issue row.
    Dependencies: platform engineer restores freshness blockers and dead sources to budget-compliant green state so preflight can pass; CTO/platform sets Vercel `SENTRY_DSN` with canary evidence; CTO confirms any sprint-priority override before cross-sprint dependency reassignment.
- 2026-05-05 AGN-1139 [Sprint 1 audit] Sprint/backlog boundary integrity pass (documentation scope this heartbeat):
  - Mandatory opening re-run completed (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`).
  - Verified `npm run freshness:check` at `2026-05-05T04:24:59.563Z` reached localhost (`http://localhost:3023`, not missing) with `health=stale sourceStatus=ok` but failed with `blocking_non_green=8`, `red=1` (`trending-repos`), `yellow=9`, and `Sentry: MISSING`.
  - Scope decision: keep Sprint 1 execution locked to Phase 1.5 + local freshness unblock; keep out-of-scope discoveries backlog-only unless CTO reprioritizes.
  - [ ] AGN-1139 boundary integrity continuity follow-through (owner: PM triage). Done when sprint/backlog ownership and acceptance metadata stay synchronized with one owner + binary done-state text per issue, and non-Sprint-1 execution remains backlog-first unless CTO reprioritizes.
    Dependencies: platform engineer restores blocking freshness rows to GREEN within budget (especially `trending-repos`, `producthunt`, `twitter`, `npm`, `lobsters`, `awesome-skills`, `claude-rss`, `openai-rss`); CTO/platform provides Vercel `SENTRY_DSN` canary evidence.
- 2026-05-05 AGN-1047 [Sprint 1 audit] Sprint/backlog boundary integrity pass (documentation scope this heartbeat):
  - Mandatory opening re-run completed (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`).
  - Retry-pass evidence (2026-05-05): `npm run freshness:check` timed out contacting `http://localhost:3023` (localhost unstable/unreachable in this heartbeat path).
  - Live in-progress scope sample (`GET /api/companies/{companyId}/issues?status=in_progress&limit=20`) still includes out-of-scope implementation tickets: `AGN-386`, `AGN-799`, `AGN-885`, `AGN-544`, `AGN-899`, `AGN-1484`, `AGN-876`.
  - Scope decision: keep Sprint 1 execution locked to Phase 1.5 + local freshness unblock; keep all out-of-scope discoveries backlog-only unless CTO reprioritizes.
  - [ ] AGN-1047 boundary integrity continuity follow-through (owner: PM triage). Done when sprint/backlog ownership and acceptance metadata stay synchronized with one owner + binary done-state text per issue, and non-Sprint-1 execution remains backlog-first unless CTO reprioritizes.
    Dependencies: platform engineer restores localhost freshness responsiveness and returns `npm run freshness:check` to pass state; CTO/board confirms move-to-backlog vs child-split routing for sampled non-Sprint-1 active issues; CTO/platform provides Vercel `SENTRY_DSN` verification evidence where required for sprint closure.
- 2026-05-04 AGN-756 [GAP-AUDIT-21] Privacy Policy + Terms of Service pages (out of Sprint 1 implementation scope):
  - Mandatory opening re-run completed (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`).
  - Verification evidence: `rg -n "privacy|terms|tos|terms of service" src/app docs tasks` returned no product route implementations; `Get-ChildItem -Name src/app` shows no `privacy` or `terms` route folders.
  - Verified `npm run freshness:check` reached localhost (`http://localhost:3023`, not missing) but failed with `GET /api/health?soft=1 -> HTTP 500 Internal Server Error` (stale/degraded), so this heartbeat remains triage/documentation-only.
  - [ ] AGN-756 compliance pages delivery follow-through (owner: frontend engineer). Done when `/privacy` and `/terms` routes are deployed with approved legal copy, linked from at least one persistent global nav/footer surface, and both routes return HTTP 200 in production verification evidence.
    Dependencies: CTO/legal approves canonical Privacy Policy + Terms copy; frontend engineer implements routes and linkage; release owner verifies production route health after merge.
- 2026-05-04 AGN-757 [GAP-AUDIT-22] Cookie consent banner (PostHog) (out of Sprint 1 implementation scope):
  - Mandatory opening re-run completed (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`).
  - Verification evidence: no existing AGN-757/GAP-AUDIT-22 tracking row was present in sprint/backlog docs before this heartbeat; `rg -n "AGN-757|GAP-AUDIT-22|cookie consent" tasks docs` returned no scoped triage entry.
  - Verified `npm run freshness:check` reached localhost (`http://localhost:3023`, not missing) but failed with `GET /api/cron/freshness/state -> HTTP 500 Internal Server Error`, so this heartbeat remains triage/documentation-only.
  - [ ] AGN-757 cookie-consent compliance delivery follow-through (owner: frontend engineer). Done when a cookie consent banner is deployed on production, blocks PostHog client tracking before consent, records consent decision state, and has verification evidence from one fresh production run showing pre-consent no-event and post-consent event capture behavior.
    Dependencies: CTO/legal confirms consent-copy/legal basis and required jurisdictions; frontend engineer implements banner + consent gating for PostHog provider; release owner verifies production behavior with timestamped evidence.
- 2026-05-04 AGN-758 [GAP-AUDIT-24] DMCA / repo-author takedown procedure (out of Sprint 1 implementation scope):
  - Mandatory opening re-run completed (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`).
  - Verification evidence: no existing AGN-758/GAP-AUDIT-24 tracking row was present in sprint/backlog docs before this heartbeat; `rg -n "AGN-758|GAP-AUDIT-24|DMCA|takedown|repo-author" tasks docs` returned no scoped triage entry.
  - Verified `npm run freshness:check` reached localhost (`http://localhost:3023`, not missing) but failed with `GET /api/health?soft=1 -> HTTP 500 Internal Server Error`, so this heartbeat remains triage/documentation-only.
  - [ ] AGN-758 DMCA/takedown procedure delivery follow-through (owner: policy/compliance owner). Done when a publicly reachable takedown procedure is published (route or docs URL), includes DMCA notice intake requirements, designates a contact channel, defines verification/review/removal timelines, and has one production verification evidence entry showing HTTP 200 plus internal owner handoff path for execution.
    Dependencies: CTO/legal provides approved DMCA/takedown policy text and designated contact channel; frontend/content owner publishes the procedure page and links it from a persistent legal/navigation surface; release owner verifies production accessibility and escalation path evidence.
- 2026-05-04 AGN-607 [Sprint 1 audit] Child-issue acceptance criteria lint audit (documentation scope this heartbeat):
  - Mandatory opening re-run completed (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`).
  - Verified `npm run freshness:check` reached localhost (`http://localhost:3023`, not missing) but failed with `GET /api/cron/freshness/state -> HTTP 401 unauthorized`.
  - [ ] AGN-607 child-issue acceptance-criteria lint continuity follow-through (owner: PM triage). Done when newly seeded child triage audit rows keep one owner, one binary done-state line, and explicit blocker/dependency wording across sprint/backlog notes.
    Dependencies: platform engineer restores local freshness authorization path so freshness-state output is readable; CTO/platform sets Vercel `SENTRY_DSN` and provides canary evidence; CTO confirms any sprint-priority override before scope reassignment.
- 2026-05-05 AGN-1048 [Sprint 1 audit] Blocked issue unblock-owner completeness scan (documentation scope this heartbeat):
  - Mandatory opening re-run completed (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`).
  - Verified `npm run freshness:check` failed with `GET /api/cron/freshness/state -> HTTP 500 Internal Server Error` while localhost stayed reachable (`http://localhost:3023`, not missing), so product is stale/degraded.
  - [ ] AGN-1048 unblock-owner completeness continuity follow-through (owner: PM triage). Done when blocked issue rows stay owner/action complete with one owner + one unblock action + one binary done-state line, and freshness preflight returns to passing state.
    Dependencies: platform engineer restores `/api/cron/freshness/state` HTTP 200 behavior for `npm run freshness:check`; CTO/platform sets Vercel `SENTRY_DSN` with canary evidence; CTO confirms any sprint-priority override before scope reassignment.
- 2026-05-05 AGN-1138 [Sprint 1 audit] Blocked-issue unblock owner/action completeness pass (documentation scope this heartbeat):
  - Mandatory opening re-run completed (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`).
  - Verified `npm run freshness:check` at `2026-05-05T04:25:16+08:00` reached localhost (`http://localhost:3023`, not missing) but failed with stale/degraded status (`blocking_non_green=27`, `dead=18`, `Sentry: MISSING`).
  - [ ] AGN-1138 unblock-owner/action completeness continuity follow-through (owner: PM triage). Done when blocked issue rows stay owner/action complete with one owner + one unblock action + one binary done-state line, and freshness preflight returns to passing state.
    Dependencies: platform engineer restores blocking freshness rows (`category-metrics`, `trending-repos`, `star-snapshots`, `mcp-downloads`, plus remaining blocking non-green sources) until `npm run freshness:check` exits 0; CTO/platform sets Vercel `SENTRY_DSN` with canary evidence; CTO confirms any sprint-priority override before scope reassignment.
- 2026-05-05 AGN-1155 [Sprint 1 audit] Blocked issue unblock-owner/action completeness sweep (documentation scope this heartbeat):
  - Mandatory opening re-run completed (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`).
  - Verified `npm run freshness:check` at `2026-05-05T04:39:30.743Z` reached localhost (`http://localhost:3023`, not missing) with `health=ok` and `sourceStatus=ok`, but failed policy with `green=40`, `yellow=9`, `red=1`, `blocking_non_green=8`, `advisory_non_green=2`, and `Sentry: MISSING` (`trending-repos` RED).
  - [ ] AGN-1155 unblock-owner/action completeness continuity follow-through (owner: PM triage). Done when blocked issue rows stay owner/action complete with one owner + one unblock action + one binary done-state line, and freshness preflight returns to passing state.
    Dependencies: platform engineer restores blocking non-green sources (`trending-repos` RED; `awesome-skills`, `claude-rss`, `lobsters`, `npm`, `openai-rss`, `producthunt`, `twitter` YELLOW) to GREEN within budget; CTO/platform sets Vercel `SENTRY_DSN` with canary evidence; CTO confirms any sprint-priority override before scope reassignment.
- 2026-05-05 AGN-1210 [Sprint 1 audit] Sprint Triage blocked-issue unblock-owner completeness pass (documentation scope this heartbeat):
  - Mandatory opening re-run completed (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`).
  - Verified `npm run freshness:check` reached localhost (`http://localhost:3023`, not missing) but failed with `GET /api/health?soft=1 -> HTTP 500 Internal Server Error`, so product is stale/degraded.
  - [ ] AGN-1210 unblock-owner completeness continuity follow-through (owner: PM triage). Done when blocked issue rows remain owner/action complete (one owner + one unblock action + one binary done-state line per row) and freshness preflight returns to passing state.
    Dependencies: platform engineer restores `/api/health?soft=1` to HTTP 200 and clears blocking freshness failures; CTO/platform sets Vercel `SENTRY_DSN` with canary evidence; CTO confirms any sprint-priority override before scope reassignment.
- 2026-05-04 AGN-606 [Sprint 1 audit] Blocked issue unblock-owner completeness audit (documentation scope this heartbeat):
  - Mandatory opening re-run completed (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`).
  - Verified `npm run freshness:check` at `2026-05-04T22:03:49.5441998+08:00` reached localhost (`http://localhost:3023`, not missing) but failed with `GET /api/cron/freshness/state -> HTTP 401 unauthorized`.
  - [ ] AGN-606 unblock-owner completeness continuity follow-through (owner: PM triage). Done when blocked issue rows stay owner/action complete with one owner + one unblock action + one binary done-state line, and freshness preflight returns to passing state.
    Dependencies: platform engineer restores local freshness-state authorization path; CTO/platform sets Vercel `SENTRY_DSN` with canary evidence; CTO confirms any sprint-priority override before scope reassignment.
- 2026-05-04 AGN-605 [Sprint 1 audit] Sprint/backlog boundary hygiene audit (documentation scope this heartbeat):
  - Mandatory opening re-run completed (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`).
  - Verified `npm run freshness:check` reached localhost (`http://localhost:3023`, not missing) but failed with `GET /api/cron/freshness/state -> HTTP 401 unauthorized`.
  - Evidence refresh: `npm run freshness:check` reached localhost (`http://localhost:3023`, not missing) but failed with `GET /api/cron/freshness/state -> HTTP 500 Internal Server Error`.
  - Explicit operator steps: set `SENTRY_DSN` in Vercel Production (`https://vercel.com/dashboard` -> project `trendingrepo.com` -> Settings -> Environment Variables), restore freshness-state auth path so `/api/cron/freshness/state` returns 200, then rerun `npm run freshness:check`.
  - [ ] AGN-605 boundary-hygiene continuity follow-through (owner: PM triage). Done when Sprint 1 remains scope-locked to Phase 1.5 + local freshness unblock, all non-Sprint-1 execution updates are backlog-first unless CTO reprioritizes, and each active issue row keeps one owner plus explicit blocker/action wording.
    Dependencies: platform engineer restores local freshness-state authorization path so preflight can complete; CTO/platform sets Vercel `SENTRY_DSN` + canary evidence; CTO confirms any sprint-priority overrides before scope reassignment.
- 2026-05-04 AGN-552 [Recovery follow-up] Resolve cross-agent checkout locks on stale `in_progress` cohort (out of Sprint 1 implementation scope):
  - Mandatory opening re-run completed (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`).
  - Verified `npm run freshness:check` at `2026-05-04T13:13:36.826Z` reached localhost (`http://localhost:3023`) and reported stale/degraded (`blocking_non_green=2` from `npm` + `producthunt`; `Sentry: MISSING`), so this heartbeat remains triage/documentation-only.
  - [ ] AGN-552 stale `in_progress` cohort normalization continuity (owner: PM triage). Done when each stale `in_progress` issue has one explicit owner, one next action, one blocker/dependency line, and either a terminal status (`done`/`blocked`) or a child split/handoff reference.
    Dependencies: PM triage updates stale-cohort issue comments/status transitions; platform engineer restores `npm` and `producthunt` freshness to GREEN budget compliance; CTO/platform sets Vercel `SENTRY_DSN`; CTO confirms any sprint-priority overrides before scope reassignment.
- 2026-05-04 AGN-393 [T1-9] Audit-08 backlog decomposition:
  - Mandatory opening bundle re-run completed (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`).
  - `npm run freshness:check` at `2026-05-04T12:23:24.728Z`: localhost `3023` reachable (not missing), but stale/degraded with `blocking_non_green=1` (`producthunt` YELLOW) and `Sentry: MISSING`.
  - Created child issues from Audit-08 §A T1-9: `AGN-396` (CSP), `AGN-397` (CORS), `AGN-398` (response-size cap), `AGN-399` (log PII scrubbing), `AGN-400` (dependency audit), `AGN-401` (k8s probe hardening), `AGN-402` (admin UX hardening), `AGN-403` (log rotation), `AGN-404` (observability dashboards).
- 2026-05-04 AGN-364 [Sprint 1 audit] Issue evidence quality and closure gate check (documentation scope this heartbeat):
  - Mandatory opening re-run completed (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`).
  - Verified `npm run freshness:check` at `2026-05-04T12:08:43.913Z` reached localhost (`http://localhost:3023`) with `health=ok` and `sourceStatus=degraded`, then failed with `green=44`, `yellow=1`, `dead=5`, `blocking_non_green=5`, `advisory_non_green=1`, `Sentry: MISSING`.
  - [ ] AGN-364 closure-gate continuity follow-through (owner: PM triage). Done when sprint/backlog closure-gate rows keep one owner, one unblock action, and one binary done-state line with command-timestamped evidence, and freshness exits 0 with no blocking non-green rows.
    Dependencies: platform engineer restores blocking freshness rows (`category-metrics`, `mcp-downloads`, `star-snapshots`, `trending-repos`, `producthunt` budget recovery); CTO/platform sets Vercel `SENTRY_DSN` and canary evidence; CTO confirms any sprint-priority override before scope reassignment.
- 2026-05-04 AGN-363 [Sprint 1 audit] AGN dependency graph hygiene refresh (documentation scope this heartbeat):
  - Mandatory opening re-run completed (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`).
  - Verified `npm run freshness:check` at `2026-05-04T12:06:58.994Z` reached localhost (`http://localhost:3023`) and failed stale/degraded with `blocking_non_green=5`, `dead=5`, `advisory_non_green=1`, `Sentry: MISSING`; blocking non-green rows include `category-metrics` (DEAD), `mcp-downloads` (DEAD), `star-snapshots` (DEAD), `trending-repos` (DEAD), and `producthunt` (YELLOW).
  - Linkage refresh (2026-05-05 AGN-1353): live AGN-58 child payload does not include `AGN-363`; AGN-363 is treated as non-child for AGN-58 graph until board/CTO decides relink.
  - [ ] AGN-363 linkage decision follow-through (owner: PM triage). Done when board/CTO either relinks AGN-363 under AGN-58 parent or confirms AGN-363 stays out of AGN-58 graph, and sprint/backlog notes are synchronized to that decision.
    Dependencies: board/CTO parent-linkage decision for AGN-363.
- 2026-05-04 AGN-362 [Sprint 1 audit] Sprint-vs-backlog boundary compliance pass (documentation scope this heartbeat):
  - Mandatory opening re-run completed (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`).
  - Verified `npm run freshness:check` in this heartbeat reached localhost (`http://localhost:3023`) but failed with `GET /api/health?soft=1 -> HTTP 500 Internal Server Error` (localhost not missing; product stale/degraded), so this heartbeat remained triage/documentation-only.
  - Boundary compliance result: Sprint 1 remains limited to Phase 1.5 + local freshness unblock; Sprint 2 audit execution stays backlog-first/pointer-only unless CTO reprioritizes.
  - [ ] AGN-362 boundary compliance continuity follow-through (owner: PM triage). Done when Sprint 1 notes remain scope-locked to Phase 1.5 + local freshness unblock and all Sprint 2 audit execution/dependency updates continue landing in backlog entries first, with one owner and binary done-state wording per issue.
    Dependencies: platform engineer restores localhost freshness endpoints (`/api/health?soft=1` and `/api/cron/freshness/state`) and clears blocking freshness failures; CTO/platform sets Vercel `SENTRY_DSN`; CTO confirms any sprint-priority override before scope reassignment.
- 2026-05-04 AGN-343 PM Blocker Triage (out of Sprint 1 implementation scope):
  - Mandatory opening re-run completed (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`).
  - Board retry context handled: latest board comment requested retry pickup.
  - Verified `npm run freshness:check` on this heartbeat failed with `local server not reachable at http://localhost:3023` (`ECONNREFUSED`), so localhost is missing.
  - Blocked-issue inventory from Paperclip (`/api/companies/{companyId}/issues?status=blocked`) now returns `blocked_count=16`; latest comments read and classified:
    - `external-fix`: `AGN-343`, `AGN-671`, `AGN-584`, `AGN-768`, `AGN-662`, `AGN-740`, `AGN-71`, `AGN-772`, `AGN-403`, `AGN-822`, `AGN-329`, `AGN-765`, `AGN-72`.
    - `creds`: `AGN-819`, `AGN-210`.
    - `decision`: `AGN-50`.
  - Per-issue unblock highlights:
    - `AGN-819`/`AGN-210`: restore GitHub auth to clear `gh`/Actions evidence pulls.
    - `AGN-50`: board/user approval decision on active hire interaction.
    - `AGN-343`/`AGN-329` plus multiple external-fix issues: restore localhost service/freshness endpoint and baseline typecheck/test/build gates for closure checks.
  - [ ] AGN-343 PM blocker triage continuity follow-through (owner: PM triage). Done when active blocker rows in sprint/backlog docs retain one owner, one unblock action, and one binary done-state line aligned to the latest verified preflight evidence.
    Dependencies: platform engineer restores localhost:3023 reachability and freshness endpoint health; CTO/platform restores GH auth for `AGN-819`/`AGN-210` and sets Vercel `SENTRY_DSN`; board/user resolves AGN-50 approval; platform/frontend/backend owners resolve remaining external-fix blockers and baseline gates (`AGN-343`,`AGN-671`,`AGN-584`,`AGN-768`,`AGN-662`,`AGN-740`,`AGN-71`,`AGN-772`,`AGN-403`,`AGN-822`,`AGN-329`,`AGN-765`,`AGN-72`).
- 2026-05-04 AGN-318 [Sprint 1 audit] Acceptance-criteria lint delta pass (documentation scope this heartbeat):
  - Mandatory opening re-run completed (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`).
  - Verified `npm run freshness:check` at `2026-05-04T19:21:57.6874876+08:00` reached localhost (`http://localhost:3023`) but failed with `GET /api/cron/freshness/state -> HTTP 500 Internal Server Error` (localhost not missing; product stale/degraded), so this heartbeat remained triage/documentation-only.
  - Delta lint scope result recorded in `tasks/CURRENT-SPRINT.md`: `AGN-316`, `AGN-317` both PASS for one-owner, binary done-state, and explicit blocker/dependency fields.
  - [ ] AGN-318 lint delta continuity follow-through (owner: PM triage). Done when new sprint/backlog delta rows continue to preserve one owner, one binary done-state line, and explicit blocker/dependency wording across heartbeat updates.
    Dependencies: platform engineer restores `/api/cron/freshness/state` and clears blocking freshness regressions; CTO/platform sets Vercel `SENTRY_DSN`; CTO confirms any sprint-priority override before scope reassignment.
- 2026-05-04 AGN-317 [Sprint 1 audit] Sprint/backlog boundary consistency scan (documentation scope this heartbeat):
  - Mandatory opening re-run completed (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`).
  - Verified `npm run freshness:check` at `2026-05-04T19:20:20.9948245+08:00` reached localhost (`http://localhost:3023`) but failed with `GET /api/health?soft=1 -> HTTP 500 Internal Server Error` (localhost not missing; product stale/degraded).
  - Boundary consistency result: Sprint 1 remains locked to Phase 1.5 + local freshness unblock, and out-of-scope discoveries remain backlog-only with one owner + binary done-state wording.
  - [ ] AGN-317 boundary consistency continuity follow-through (owner: PM triage). Done when sprint/backlog boundary notes remain synchronized each heartbeat with one owner, explicit blocker/needs wording, and binary done-state text while Sprint 2 execution stays backlog-first unless CTO reprioritizes.
    Dependencies: platform engineer restores local freshness endpoint health (`/api/health?soft=1`); CTO/platform sets Vercel `SENTRY_DSN`; CTO confirms any sprint-priority override before scope reassignment.
- 2026-05-04 AGN-316 [Sprint 1 audit] blocked issue ownership drift check (documentation scope only this heartbeat):
  - Mandatory opening re-run completed (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`).
  - Verified `npm run freshness:check` at `2026-05-04T11:17:49.186Z` reached localhost (`http://localhost:3023`) but failed with degraded/stale status (`green=45`, `dead=5`, `blocking_non_green=4`, `advisory_non_green=1`, `Sentry: MISSING`), so this heartbeat remained triage/documentation-only.
  - Ownership drift result: active blocker rows remain owner-explicit (platform engineer owns blocking freshness DEAD rows `category-metrics`, `mcp-downloads`, `star-snapshots`, `trending-repos`; CTO/platform owns Vercel `SENTRY_DSN` unblock).
  - [ ] AGN-316 ownership-drift continuity follow-through (owner: PM triage). Done when blocker ownership lines remain stable and explicit across sprint/backlog notes on each heartbeat until freshness blockers and `SENTRY_DSN` unblock are cleared.
    Dependencies: platform engineer clears blocking freshness DEAD rows; CTO/platform sets Vercel `SENTRY_DSN`; CTO confirms any sprint-priority override before scope reassignment.
- 2026-05-04 AGN-310 [Sprint 1 audit] PM acceptance-criteria lint for new audit tasks (documentation scope only this heartbeat):
  - Mandatory opening re-run completed (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`).
  - Verified `npm run freshness:check` at `2026-05-04T11:15:00.077Z` reached localhost (`http://localhost:3023`) but failed with degraded/stale status (`green=45`, `dead=5`, `blocking_non_green=4`, `advisory_non_green=1`, `Sentry: MISSING`), so this heartbeat remained triage/documentation-only.
  - Lint scope result recorded in `tasks/CURRENT-SPRINT.md`: `AGN-300`, `AGN-301`, `AGN-302`, `AGN-308`, `AGN-309` all PASS for one-owner, binary done-state, and explicit blocker/dependency fields.
  - [ ] AGN-310 lint continuity follow-through (owner: PM triage). Done when newly seeded audit tasks continue to preserve one owner, one binary done-state line, and explicit blocker/dependency wording across sprint/backlog notes on each heartbeat.
    Dependencies: platform engineer clears blocking freshness rows (`category-metrics`, `mcp-downloads`, `star-snapshots`, `trending-repos`); CTO/platform sets Vercel `SENTRY_DSN`; CTO confirms any sprint-priority override before Sprint 2 scope reassignment.
- 2026-05-04 AGN-309 [Sprint 1 audit] blocked-owner/action completeness sweep (documentation scope only this heartbeat):
  - Mandatory opening re-run completed (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`).
  - Verified `npm run freshness:check` at `2026-05-04T11:13:11.580Z` reached localhost (`http://localhost:3023`) but failed with degraded/stale status (`green=45`, `dead=5`, `blocking_non_green=4`, `advisory_non_green=1`, `Sentry: MISSING`), so this heartbeat remained triage/documentation-only.
  - Evidence refresh: `npm run freshness:check` at `2026-05-04T13:04:03.046Z` reached localhost (`http://localhost:3023`) but failed with `green=47`, `yellow=2`, `dead=1`, `blocking_non_green=2`, `advisory_non_green=1`, `Sentry: MISSING`.
  - Live blocked inventory (`GET /api/companies/{companyId}/issues?status=blocked`) now returns `AGN-464`, `AGN-419`, `AGN-343`, `AGN-379`; all four have explicit owner plus `Blocked on`/`Needs` lines in latest comments (no missing owner/action fields).
  - Remediation queue by impact: `AGN-464` workflow merge + lock sync/rerun, `AGN-419` prod deploy + 24h CSP verify, `AGN-379` telemetry credential provisioning, then `AGN-343` closeout.
  - [ ] AGN-309 blocked-owner/action completeness continuity follow-through (owner: PM triage). Done when all active blocker rows in sprint/backlog notes keep one owner, one unblock action, and one binary done-state line aligned to latest verified preflight evidence.
    Dependencies: platform engineer restores blocking freshness sources (`npm`, `producthunt`) to GREEN; CTO/platform sets Vercel `SENTRY_DSN` and canary evidence; CTO/platform provide telemetry credentials for `AGN-379` (`ADMIN_TOKEN` or Redis/Upstash read access).
- 2026-05-04 AGN-308 [Sprint 1 audit] PM sprint-boundary pointer-only enforcement:
  - Mandatory opening re-run completed (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`).
  - Verified `npm run freshness:check` at `2026-05-04T11:10:54.348Z` reached localhost (`http://localhost:3023`) and is stale/degraded (not missing): `green=45`, `dead=5`, `blocking_non_green=4`, `advisory_non_green=1`, `Sentry: MISSING`.
  - Sprint boundary action in this heartbeat: active Sprint 1 blocker/lint scopes in `tasks/CURRENT-SPRINT.md` now exclude Sprint 2 issue rows; Sprint 2 audit issue details remain backlog-first (`AGN-253`, `AGN-254`, `AGN-255`, `AGN-290`, `AGN-291`, `AGN-292`) unless CTO reprioritizes.
  - [ ] Pointer-only enforcement continuity follow-through (owner: PM triage). Done when Sprint 1 notes retain Sprint 2 references as pointer-only context and all Sprint 2 execution/dependency updates continue to land in backlog entries first.
    Dependencies: CTO confirms any sprint-priority override before Sprint 2 issues re-enter active Sprint 1 execution scope; platform engineer/CTO-platform clear current freshness + Sentry blockers for close-readiness evidence.
- 2026-05-04 AGN-302 [Sprint 1 audit] Parent-child dependency map hygiene pass (documentation scope only this heartbeat):
  - Mandatory opening re-run completed (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`).
  - Verified `npm run freshness:check` at `2026-05-04T11:07:27.683Z` reached localhost (`http://localhost:3023`) but failed with degraded/stale status (`green=45`, `dead=5`, `blocking_non_green=4`, `advisory_non_green=1`, `Sentry: MISSING`), so this heartbeat remained triage/documentation-only.
  - Dependency-map hygiene result: Sprint 2 audit dependency execution remains backlog-first (`AGN-253`, `AGN-254`, `AGN-255`, `AGN-290`, `AGN-291`, `AGN-292`), while Sprint 1 notes keep pointer-only context unless CTO reprioritizes.
  - [ ] Parent-child dependency map hygiene continuity follow-through (owner: PM triage). Done when sprint/backlog dependency rows remain synchronized with one owner, explicit blocker/needs wording, and binary done-state text per issue, while Sprint 2 audit execution stays backlog-first.
    Dependencies: platform engineer clears blocking freshness rows (`category-metrics`, `mcp-downloads`, `star-snapshots`, `trending-repos`); CTO/platform sets Vercel `SENTRY_DSN`; CTO confirms any sprint-priority override before scope reassignment.
- 2026-05-04 AGN-301 [Sprint 1 audit] Blocked-issue metadata completeness sweep (documentation scope only this heartbeat):
  - Mandatory opening re-run completed (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`).
  - Verified `npm run freshness:check` at `2026-05-04T11:05:38.114Z` reached localhost (`http://localhost:3023`) but failed with degraded/stale status (`blocking_non_green=4`, `dead=5`, `advisory_non_green=1`, `Sentry: MISSING`), so this heartbeat remained triage/documentation-only.
  - [ ] Blocked-issue metadata completeness continuity follow-through (owner: PM triage). Done when all active blocked-issue rows across sprint/backlog notes keep one owner, one unblock action, and one binary done-state line aligned to the latest verified preflight evidence.
    Dependencies: platform engineer clears blocking freshness rows (`category-metrics`, `mcp-downloads`, `star-snapshots`, `trending-repos`); CTO/platform sets Vercel `SENTRY_DSN`; CTO confirms any sprint-priority override before scope reassignment.
- 2026-05-04 AGN-300 [Sprint 1 audit] Sprint-vs-backlog boundary drift ledger refresh:
  - Mandatory opening re-run completed (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`).
  - Verified `npm run freshness:check` at `2026-05-04T11:03:28.332Z` reached localhost (`http://localhost:3023`) but failed with degraded/stale status (`blocking_non_green=4`, `dead=5`, `advisory_non_green=1`, `Sentry: MISSING`), so this heartbeat remained triage/documentation-only.
  - Drift ledger refresh result: Sprint 2 audit set (`AGN-253`, `AGN-254`, `AGN-255`, `AGN-290`, `AGN-291`, `AGN-292`) remains backlog-first; Sprint doc now carries boundary pointer context only for this set unless CTO reprioritizes.
  - [ ] Boundary drift ledger continuity follow-through (owner: PM triage). Done when Sprint 2 audit execution updates remain in backlog entries and Sprint 1 notes keep only pointer references for those issues.
    Dependencies: platform engineer clears blocking non-green freshness rows (`category-metrics`, `mcp-downloads`, `star-snapshots`, `trending-repos`); CTO/platform sets Vercel `SENTRY_DSN`; CTO confirms any sprint-priority override before scope reassignment.
- 2026-05-04 AGN-292 [Sprint 2 audit] acceptance-criteria lint for newly seeded audit tasks (out of Sprint 1 implementation scope):
  - Mandatory opening re-run completed (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`).
  - Verified `npm run freshness:check` at `2026-05-04T10:59:47.986Z` reached localhost (`http://localhost:3023`) but failed with degraded/stale status (`blocking_non_green=4`, `dead=5`, `advisory_non_green=1`, `Sentry: MISSING`), so this heartbeat remained triage/documentation-only.
  - Lint scope result recorded in `tasks/CURRENT-SPRINT.md`: `AGN-275`, `AGN-276`, `AGN-277`, `AGN-282`, `AGN-290`, `AGN-291` all PASS for one-owner, binary done-state, and explicit dependency/blocker fields.
  - [ ] Acceptance-criteria lint continuity follow-through (owner: PM triage). Done when newly seeded audit tasks continue to maintain one owner, one binary done-state line, and explicit blocker/dependency wording across sprint/backlog notes on each heartbeat.
    Dependencies: platform engineer resolves blocking freshness rows; CTO/platform sets Vercel `SENTRY_DSN`; CTO confirms any sprint-priority override before scope reassignment.
- 2026-05-04 AGN-291 [Sprint 2 audit] Sprint boundary leakage check (Sprint 1 vs Sprint 2):
  - Mandatory opening re-run completed (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`).
  - Verified `npm run freshness:check` at `2026-05-04T10:58:05.245Z` reached localhost (`http://localhost:3023`) but failed with `blocking_non_green=4`, `dead=5`, `advisory_non_green=1`, and `Sentry: MISSING` (product stale/degraded, localhost not missing).
  - Leakage finding: Sprint 2 audit issues (`AGN-253`, `AGN-254`, `AGN-255`, `AGN-290`) are still represented in Sprint 1 tracking, so boundary clarity depends on backlog-first handling for Sprint 2 updates.
  - [ ] Sprint boundary leakage follow-through (owner: PM triage). Done when Sprint 2 audit issue updates are maintained backlog-first and Sprint 1 notes only retain pointer references unless CTO explicitly changes sprint priority.
    Dependencies: CTO confirms any sprint-priority override; platform engineer resolves freshness blockers; CTO/platform sets Vercel `SENTRY_DSN`.
- 2026-05-04 AGN-282 PM Blocker Triage (out of Sprint 1 implementation scope):
  - Mandatory opening re-run completed (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`).
  - Verified `npm run freshness:check` at `2026-05-04T10:53:36.658Z` reached localhost (`http://localhost:3023`) but failed with degraded freshness (`blocking_non_green=5`, `dead=5`, `yellow=1`) and `Sentry: MISSING`, so this heartbeat remains triage/documentation-only.
  - [ ] PM blocker triage continuity follow-through (owner: PM triage). Done when all active blocker rows in sprint/backlog docs preserve one owner, one unblock action, and one binary done-state line aligned to the latest verified preflight evidence.
    Dependencies: platform engineer resolves blocking freshness rows (`category-metrics`, `mcp-downloads`, `star-snapshots`, `trending-repos`, `reddit` stale budget); CTO/platform sets Vercel `SENTRY_DSN`; PM reruns mandatory opening checks in the same heartbeat before closing AGN-282.
  - 2026-05-04 blocked inventory snapshot (live API): `AGN-419`, `AGN-343`, `AGN-379`.
    - AGN-419 classification: `external-fix` (prod deployment + 24h CSP monitoring proof pending).
    - AGN-343 classification: `creds + external-fix` (freshness blockers plus missing telemetry credentials).
    - AGN-379 classification: `creds` (missing ADMIN_TOKEN and Redis/Upstash read credentials).
    - Reality check: `ADMIN_TOKEN`, `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, `REDIS_URL`, `UPSTASH_REDIS_REST_URL`, and `UPSTASH_REDIS_REST_TOKEN` are all missing in the current runtime, so no blocked issue can be safely unblocked to `todo` in this heartbeat.
- 2026-05-04 AGN-276 [Sprint 1 audit] blocked issue unblock-owner completeness sweep (out of Sprint 1 implementation scope):
  - Mandatory opening re-run completed (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`).
  - Verified `npm run freshness:check` at `2026-05-04T10:50:00.291Z` reached localhost (`http://localhost:3023`) but failed with degraded freshness (`blocking_non_green=5`, `dead=5`, `yellow=1`) and `Sentry: MISSING`, so this heartbeat remains triage/documentation-only.
  - [ ] Blocked issue unblock-owner completeness sweep follow-through (owner: PM triage). Done when all active blocker rows in sprint/backlog docs preserve one owner, one unblock action, and one binary done-state line aligned to the latest verified preflight evidence.
    Dependencies: platform engineer resolves blocking freshness rows (`category-metrics`, `mcp-downloads`, `star-snapshots`, `trending-repos`, `reddit` stale budget); CTO/platform sets Vercel `SENTRY_DSN`; PM reruns mandatory opening checks in the same heartbeat before closing AGN-276.
- 2026-05-04 AGN-275 [Sprint 1 audit] Sprint scope lock compliance pass (documentation scope only this heartbeat):
  - Mandatory opening re-run completed (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`).
  - Verified `npm run freshness:check` at `2026-05-04T10:48:16.389Z` reached localhost (`http://localhost:3023`) but failed with `blocking_non_green=5`, `dead=5`, `yellow=1`, and `Sentry: MISSING`, so scope-lock closure remains triage/documentation-only.
  - Continuation evidence: reran `npm run freshness:check` at `2026-05-04T13:07:38.596Z`; localhost remained reachable and previous blocking DEAD rows recovered, but check still failed with `blocking_non_green=2` (`npm`, `producthunt` both YELLOW) plus `Sentry: MISSING`.
  - Continuation evidence: board inventory via `GET /api/companies/{companyId}/issues?status=in_progress&limit=200` shows cross-sprint mixed execution remains active (examples outside Sprint 1 scope: `AGN-544`, `AGN-545`, `AGN-514`, `AGN-517`, `AGN-520`, `AGN-531` all `in_progress`), so scope-lock enforcement requires CTO lane-split confirmation.
  - Continuation evidence: latest `npm run freshness:check` failed at `2026-05-04T13:33:45+08:00` with `GET /api/health?soft=1 -> HTTP 500` on localhost:3023, so Sprint 1 local freshness unblock is hard-blocked again.
  - [ ] Sprint scope lock compliance continuity follow-through (owner: PM triage). Done when Sprint 1 remains limited to Phase 1.5 + local freshness unblock and out-of-scope discoveries remain backlog-only with one owner, explicit dependencies, and binary done-state wording.
    Dependencies: platform engineer restores localhost freshness endpoint health (`/api/health?soft=1` HTTP 200) and blocking freshness sources (`npm`, `producthunt`) to GREEN budget compliance; CTO/platform sets Vercel `SENTRY_DSN`; CTO confirms mixed-priority execution intent or enforces lane split before scope reassignment.
- 2026-05-04 AGN-254 [Sprint 2 audit] blocked issue unblock-owner completeness (out of Sprint 1 implementation scope):
  - Mandatory opening re-run completed (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`).
  - Verified `npm run freshness:check` at `2026-05-04T10:26:13.386Z` reached localhost (`http://localhost:3023`) but failed with degraded freshness (`blocking_non_green=5`, `dead=5`) and `Sentry: MISSING`, so this remains triage/documentation-only.
  - [ ] Blocked issue unblock-owner completeness follow-through (owner: PM triage). Done when all active blocker rows in sprint/backlog docs preserve one owner, one unblock action, and one binary done-state line aligned to the latest verified preflight evidence.
    Dependencies: platform engineer resolves blocking freshness rows; CTO/platform sets Vercel `SENTRY_DSN`; PM reruns mandatory opening checks in the same heartbeat before closing AGN-254.
- 2026-05-04 AGN-253 [Sprint 2 audit] parent-child linkage integrity (out of Sprint 1 implementation scope):
  - Mandatory opening re-run completed (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`).
  - Verified `npm run freshness:check` at `2026-05-04T10:22:58.377Z` reached localhost (`http://localhost:3023`) but returned stale/degraded status (`blocking_non_green=5`, `dead=5`, `yellow=1`, `Sentry: MISSING`), so linkage work remains triage/documentation-only.
  - [ ] Parent-child linkage integrity continuity follow-through (owner: PM triage). Done when sprint/backlog parent-child references for AGN-253 scope stay synchronized with one owner per issue, explicit blocker/needs lines, and binary done-state wording.
    Dependencies: platform engineer remediates blocking freshness sources; CTO confirms any intentional Sprint 2 priority overrides before scope reassignment.
- 2026-05-04 AGN-255 [Sprint 2 audit] sprint boundary drift watch (out of Sprint 1 implementation scope):
  - Mandatory opening re-run completed (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`).
  - Verified `npm run freshness:check` at `2026-05-04T10:27:49.846Z` reached localhost (`http://localhost:3023`) but returned degraded/stale status (`blocking_non_green=5`, `dead=5`, `yellow=1`, `Sentry: MISSING`), so this heartbeat remains triage/documentation-only.
  - [ ] Sprint boundary drift watch continuity follow-through (owner: PM triage). Done when Sprint 1 remains explicitly scoped to Phase 1.5 + local freshness unblock, and all out-of-scope discoveries are backlog-only with one owner, explicit dependencies, and binary done-state wording.
    Dependencies: platform engineer resolves blocking freshness rows; CTO/platform sets Vercel `SENTRY_DSN`; CTO confirms any Sprint priority changes before scope reassignment.
- 2026-05-04 AGN-232 acceptance-criteria quality lint for new Sprint tasks (out of Sprint 1 implementation scope):
  - Mandatory opening re-run completed (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`).
  - Verified `npm run freshness:check` failed at `2026-05-04T17:35:26.1985645+08:00` with `ECONNREFUSED` for `http://localhost:3023` (localhost missing), so Sprint 1 remains blocked on local preflight restore.
  - [ ] Acceptance-criteria lint continuity follow-through (owner: PM triage). Done when each newly created sprint triage issue keeps one owner, one binary done-state line, and explicit dependency/blocker wording synchronized across sprint/backlog notes.
    Dependencies: platform engineer restores localhost preflight endpoints; CTO confirms any intentional cross-sprint priority exceptions.
- 2026-05-04 AGN-230 sprint doc to issue-board consistency pass (out of Sprint 1 implementation scope):
  - Mandatory opening re-run completed (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`).
  - Verified `npm run freshness:check` failed at `2026-05-04T17:31:52+08:00` with `ECONNREFUSED` for `http://localhost:3023` (localhost missing), so Sprint 1 remains blocked on local preflight restore.
  - [ ] Sprint doc and issue-board consistency follow-through (owner: PM triage). Done when sprint/backlog issue metadata stays synchronized with board scope using one owner, explicit blocker/needs lines, and binary done-state wording for AGN-230-linked updates.
    Dependencies: platform engineer restores localhost preflight endpoints; CTO confirms any intentional cross-sprint priority exceptions.
- 2026-05-04 AGN-231 blocked-issue unblock owner/action completeness pass (out of Sprint 1 implementation scope):
  - Mandatory opening re-run completed (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`).
  - Verified `npm run freshness:check` failed at `2026-05-04T17:57:46+08:00` with `ECONNREFUSED` for `http://localhost:3023` (localhost missing), so Sprint 1 remains blocked on local preflight restore.
  - [ ] Blocked-issue owner/action completeness continuity follow-through (owner: PM triage). Done when AGN-231-linked blocker rows in sprint/backlog keep one owner, one unblock action, and one binary done-state line synchronized to latest preflight evidence.
    Dependencies: platform engineer restores localhost preflight endpoints; CTO confirms any cross-sprint priority exceptions if blocker ownership changes.
- 2026-05-04 AGN-226 sprint boundary guardrail enforcement spot-check (out of Sprint 1 implementation scope):
  - Mandatory opening re-run completed (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`).
  - Verified `npm run freshness:check` failed at `2026-05-04T17:41:00+08:00` with `ECONNREFUSED` for `http://localhost:3023` (localhost missing), so Sprint 1 remains blocked on local preflight restore.
  - [ ] Sprint boundary guardrail continuity follow-through (owner: PM triage). Done when Sprint 1 notes stay scoped to Phase 1.5 + localhost freshness unblock and all out-of-scope discoveries are backlog-only with one owner and binary done-state wording.
    Dependencies: platform engineer restores localhost preflight endpoints; CTO confirms any intentional cross-sprint priority exceptions.
- 2026-05-04 AGN-224 stalled in-progress recovery board sweep (out of Sprint 1 implementation scope):
  - Mandatory opening re-run completed (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`).
  - Verified `npm run freshness:check` failed at `2026-05-04T17:25:00+08:00` with `ECONNREFUSED` for `http://localhost:3023` (localhost missing), so this remains a Sprint 1 blocker and not backlog implementation work.
  - [ ] In-progress recovery lane split confirmation (owner: PM triage). Done when all non-Sprint-1 active issues are either explicitly assigned to non-Sprint-1 lanes or paused, and Sprint 1 notes keep scope limited to Phase 1.5 + localhost freshness unblock.
    Dependencies: CTO confirms whether mixed in-progress execution is intentional; platform engineer restores localhost preflight to unblock close-readiness verification.
- 2026-05-04 AGN-204 sprint-boundary enforcement heartbeat (out of Sprint 1 implementation scope):
  - Verified mandatory opening bundle was re-read (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`).
  - Verified `npm run freshness:check` failed because localhost is missing (`http://localhost:3023` -> `ECONNREFUSED`), so this remains a Sprint 1 blocker and not a backlog implementation task.
  - [ ] Local localhost preflight restore follow-through (owner: platform engineer). Done when `npm run freshness:check` exits 0 with localhost reachable and no blocking non-green rows.
    Dependencies: platform engineer starts local app stack and restores `/api/health?soft=1` plus `/api/cron/freshness/state` HTTP 200 behavior.
- 2026-05-04 sprint triage update (AGN-184): local freshness gate is restored (`npm run freshness:check` at `2026-05-04T08:13:05.686Z` passed with `green=50`, `blocking_non_green=0`); unblock note retained for audit traceability.
- 2026-05-04 sprint triage follow-up (AGN-184): `freshness-check` still reports `health=stale sourceStatus=degraded` with `Sentry: MISSING`. Keep Sprint 1 focus on Sentry DSN + canary verification; do not reopen local `/api/health?soft=1` repair unless regressions reappear.
- 2026-05-04 AGN-186 child-hygiene heartbeat (out of Sprint 1 implementation scope):
  - Parent linkage: this issue performs documentation hygiene for `AGN-58` children only; it does not add product/platform implementation scope.
  - [ ] AGN-58 child issue graph maintenance (owner: PM triage). Done when `tasks/CURRENT-SPRINT.md` contains a canonical AGN-58 child dependency table with parent, owner, blocker, needs, and binary done fields for `AGN-172`, `AGN-173`, `AGN-174`, `AGN-185`, `AGN-186`, `AGN-203`, and `AGN-225`.
    Dependencies: freshness evidence must be re-checked in the same heartbeat before graph updates; if `localhost:3023` is down, mark blocked and hand off to platform owner.
- 2026-05-04 AGN-225 AGN-58 child metadata consistency pass (out of Sprint 1 implementation scope):
  - [ ] AGN-58 child metadata parity lock (owner: PM triage). Done when AGN-58 child references in `tasks/CURRENT-SPRINT.md` and `tasks/BACKLOG.md` include AGN-225 with one owner, explicit blocker/needs lines, and binary done-state wording.
    Dependencies: platform engineer restores localhost preflight (`npm run freshness:check` currently `ECONNREFUSED` on `http://localhost:3023`) so same-heartbeat verification can remain current.
- 2026-05-04 AGN-203 ownership consistency heartbeat (out of Sprint 1 implementation scope):
  - [ ] Freshness regression handoff tracking (owner: platform engineer). Done when `npm run freshness:check` exits 0 locally and `GET /api/cron/freshness/state` returns HTTP 200 after the 2026-05-04 regression (`HTTP 500` at `2026-05-04T16:39:35.6975136+08:00`).
    Dependencies: PM triage keeps AGN-58 child table + blocker lines synchronized; platform engineer provides fix evidence.
- 2026-05-04 AGN-277 [Sprint 1 audit] Parent-child linkage integrity under AGN-58 (documentation scope only this heartbeat):
  - Mandatory opening re-run completed (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`).
  - Verified `npm run freshness:check` at `2026-05-04T10:51:44.773Z` reached localhost (`http://localhost:3023`) but failed with degraded freshness (`blocking_non_green=5`, `dead=5`, `yellow=1`) and `Sentry: MISSING`, so this heartbeat remains triage/documentation-only.
  - [ ] AGN-277 parent-child linkage continuity follow-through (owner: PM triage). Done when AGN-58 parent-child references across sprint/backlog docs include AGN-277 with one owner, explicit blocker/needs lines, and binary done-state wording synchronized to latest verified preflight evidence.
    Dependencies: platform engineer clears blocking freshness rows (`category-metrics`, `mcp-downloads`, `star-snapshots`, `trending-repos`, `reddit` stale budget); CTO/platform sets Vercel `SENTRY_DSN`; PM reruns mandatory opening checks in same heartbeat before closure.
- 2026-05-04 AGN-290 [Sprint 2 audit] Parent-child dependency drift sweep under AGN-58 (documentation scope only this heartbeat):
  - Mandatory opening re-run completed (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`).
  - Verified `npm run freshness:check` at `2026-05-04T10:56:23.428Z` reached localhost (`http://localhost:3023`) but failed with degraded freshness (`blocking_non_green=4`, `dead=5`) and `Sentry: MISSING`, so this heartbeat remains triage/documentation-only.
  - [ ] AGN-290 parent-child dependency drift continuity follow-through (owner: PM triage). Done when AGN-58 parent-child dependency references across sprint/backlog docs include AGN-290 with one owner, explicit blocker/needs lines, and binary done-state wording synchronized to latest verified preflight evidence.
    Dependencies: platform engineer clears blocking freshness rows (`category-metrics`, `mcp-downloads`, `star-snapshots`, `trending-repos`); CTO/platform sets Vercel `SENTRY_DSN`; PM reruns mandatory opening checks in same heartbeat before closure.
- 2026-05-04 AGN-172 scope guardrail audit (out of Sprint 1; owner PM triage unless reassigned):
  - Parent linkage: all items below are children of `AGN-172` scope guardrail and must not be pulled into Sprint 1 unless CTO reprioritizes.
  - Current audit decision: no backlog item is promoted into Sprint 1 by default; Sprint 1 keeps only Phase 1.5 + local freshness unblock.
  - [ ] Workflow failure triage packet (owner: PM triage). Done when each currently failing workflow has one assigned implementation issue with binary acceptance criteria (`Cron - freshness check`, `Audit - source freshness`, `Source health watch`, `Refresh fast discovery`, `Refresh collection rankings`).
    Dependencies: local freshness gate no longer blocks (`2026-05-04T08:13:05.686Z` pass). Depends on PM assignment capacity and Sprint 1 scope lock to avoid parallel scope expansion.
  - [ ] Twitter persistence path consistency task (owner: data pipeline engineer). Done when `/twitter` reads from the canonical store path and freshness evidence shows data newer than 24h without dual-writer ambiguity.
    Dependencies: waits on workflow failure triage packet owner assignment and source-of-truth writer decision.
  - [ ] MCP freshness provenance task (owner: data pipeline engineer). Done when `trending-mcp`, `mcp-dependents`, and `mcp-smithery-rank` publish non-null freshness metadata and pass freshness checks.
    Dependencies: waits on workflow failure triage packet owner assignment.
  - [ ] Snapshot workflow reliability task (owner: platform engineer). Done when `/top10`, `/top10 sparklines`, and `/consensus` snapshot workflows complete successfully for 2 consecutive scheduled runs.
    Dependencies: waits on workflow failure triage packet owner assignment.
  - [ ] Source-of-truth writer decision issue (owner: CTO/PM). Done when each shared key has one declared primary writer (worker vs GHA) and the decision is documented in `docs/ENGINE.md`.
    Dependencies: none. This is the decision parent for dual-writer children above.
- 2026-05-04 AGN-184 in-progress scope audit:
  - [ ] Cross-sprint in-progress queue normalization (owner: PM triage). Done when all non-Sprint-1 active issues (`AGN-73`, `AGN-88`, `AGN-93`, `AGN-96`) are either moved under explicit non-Sprint-1 execution lanes or paused so Sprint 1 reporting stays coherent.
    Dependencies: CTO confirmation if priorities are intentionally mixed.
- 2026-05-03 wire/UI inspection:
  - [ ] Sidebar route drift reconciliation (owner: frontend engineer). Done when `SidebarContent.tsx`, production routes, and `docs/SITE-WIREMAP.md` all match (`/` vs `/githubrepo`, `/top` visibility) with verification links.
  - [ ] `/githubrepo` release decision (owner: frontend engineer). Done when route is either deployed and reachable in production or removed/reverted with docs updated.
  - [ ] Mobile topbar overflow fix (owner: frontend engineer). Done when 390px viewport screenshots show no clipping for `/`, `/skills`, `/mcp`, `/signals`, `/compare`, and `/top10`.
  - [ ] Mobile `/twitter` table overflow fix (owner: frontend engineer). Done when no horizontal page overflow occurs at 390px and table remains usable.
  - [ ] `/watchlist` unauth behavior decision (owner: product/PM). Done when expected unauth responses are documented and 503s are either removed or explicitly accepted.
  - [ ] External avatar/icon fallback hardening (owner: frontend engineer). Done when failed external image loads degrade gracefully without broken UI markers.
  - [ ] Windows OneDrive `.next` workaround codified (owner: platform engineer). Done when local setup docs or script enforce the workaround and local dev/typecheck no longer race on generated files.
- Document or script the Windows OneDrive `.next` dev/build workaround. On 2026-05-03 the local `.next` directory was a junction at `%TEMP%\trendingrepo-next-dev`; `next dev` and `next build` both need `NODE_PATH=C:\Users\mirko\OneDrive\Desktop\STARSCREENER\node_modules` so chunks emitted under `%TEMP%` can resolve externals like `react/jsx-runtime` and Next's app-route runtime.
- Decide expanded freshness semantics for advisory side channels: `mcp-dependents` needs `LIBRARIES_IO_API_KEY`, `mcp-smithery-rank` needs `SMITHERY_API_KEY`, `skill-install-snapshots` currently has no install data, `model-usage` can have successful zero-event cron runs, and `hotness-snapshots` can publish only populated domains. Either provision the missing keys/data or mark these rows non-blocking in `/api/cron/freshness/state`.
- Normalize Vercel project targeting across local shells: repo link file `.vercel/project.json` points to `projectId=prj_ycY0bM38UMyAl9jPcAgrmQGUc4tQ` / `orgId=team_NrVhqhXUDEYB9YOWaqkBIQ4w`, while ambient env may inject a different `VERCEL_PROJECT_ID` without `VERCEL_ORG_ID`, causing wrong-target deploy/list behavior and stale-build confusion.
- 2026-05-04 AGN-122 Lighthouse perf budget audit top-3 wins (artifacts in `docs/perf/agn-122-lighthouse-*.report.{html,json}`):
  - [ ] Reduce server response latency on key routes (owner: platform engineer). Done when Lighthouse no longer reports `server-response-time` savings in the multi-second range on `/` and `/signals` (baseline savings: ~12,233ms home, ~4,121ms signals).
  - [ ] Eliminate large unused JavaScript payloads on landing/signal surfaces (owner: frontend engineer). Done when Lighthouse `unused-javascript` savings drop materially from current baselines (~3,940ms home, ~1,210ms signals).
  - [ ] Minify and bundle JS/CSS consistently in production path (owner: platform engineer). Done when Lighthouse no longer flags `unminified-javascript`/`unminified-css` on audited routes (baseline JS savings: ~2,730ms home, ~570ms signals).

## EngineError completeness gaps (from AGN-148, 2026-05-04)
- [ ] Migrate backend/platform untyped throws in `src/lib/data-store.ts` and `src/lib/pipeline/ingestion/**` to `EngineError` categories (`recoverable|quarantine|fatal`) with source tags. Owner: Backend (AGN-187).
- [ ] Migrate security/admin/auth-adjacent untyped throws in `src/app/api/admin/**` and session verification paths to typed `EngineError` mapping with explicit quarantine/fatal behavior. Owner: Platform Security (AGN-188).
- [ ] AGN-189 scoped backend bare-Error guardrail (owner: platform engineer). Done when lint/guard checks reject a newly introduced bare `throw new Error(...)` in `src/lib/**` and `src/app/api/**` while still allowing tests/client exceptions, and issue evidence includes one fail-proof plus one pass-proof run. Dependencies: none.

## CVE breaking-upgrade backlog (from AGN-125, 2026-05-04)
- [ ] AGN-125-A Next/PostCSS chain breaking upgrade plan + validation (owner: platform engineer). Scope: move from `next@15.5.15` to a patched major path that clears `GHSA-qx2v-qp2m-jg93`; re-verify App Router behavior, admin API route auth gates, and Sentry Next wiring before merge. Done when `npm audit` no longer reports the Next/PostCSS chain and smoke validation passes on `/`, `/admin`, `/api/health`, `/api/admin/stats`.
- [ ] AGN-125-B Vitest/Vite/esbuild chain breaking upgrade plan + validation (owner: platform engineer). Scope: move from `vitest@2.1.9` to a patched major path that clears `GHSA-4w7w-66w2-5vf9` and `GHSA-67mh-4wv8-2f99`; update test runner config/contracts as required. Done when test suites pass and `npm audit` no longer reports the vitest/vite/esbuild chain.
- [ ] AGN-125-C Resend/Svix/uuid chain breaking upgrade plan + validation (owner: backend/api). Scope: move from `resend@6.12.2` to a patched major path that clears `GHSA-w5hq-g745-h8pq`; re-verify webhook signing/idempotency and outbound email paths. Done when webhook flow tests pass and `npm audit` no longer reports the resend/svix/uuid chain.

## Phase 1 Follow-Up Rewrites (from 2026-05-05 docs restructure)

- [ ] **ENGINE.md full rewrite** â€” re-derive from `.github/workflows/` glob; cover all ~83 workflows with correct schedules; include 21 SRE workflows currently absent
- [ ] **DATABASE.md full rewrite** â€” document current Redis + Supabase duality; reference ADR 0001 + `apps/trendingrepo-worker/src/lib/db.ts:upsertItem()`
- [ ] **SCORING.md full rewrite** â€” document v3 8-source consensus + Kimi K2.6 AI Analyst (refs `apps/trendingrepo-worker/src/fetchers/consensus-trending/{types.ts,scoring.ts}`)
- [ ] **Phase 1.0.D verification sweep** â€” drift-audit `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`, `docs/runbooks/*` (5 files), `docs/protocols/*` (5 files), `docs/RUNBOOK-secret-rotation.md`, `docs/DESIGN_SYSTEM.md`; mark living/snapshot/needs-rewrite




