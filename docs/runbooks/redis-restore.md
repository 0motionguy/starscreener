---
last-verified: 2026-05-05
verified-by: claude
status: pointer
supersedes-by: docs/runbooks/redis-full.md
---

# Redis restore - see redis-full.md

The Redis restore procedure (restoring from backup, point-in-time
recovery, data-store rehydration from `data/*.json` snapshots, and
three-tier fallback validation) is covered in
**[docs/runbooks/redis-full.md](redis-full.md)**.

For OOM mitigation and write-path failure recovery see
**[docs/runbook-redis-oom.md](../runbook-redis-oom.md)**.

For the live weekly restore-drill workflow that exercises
`DUMP` / `RESTORE` integrity end-to-end, see
`.github/workflows/sre-redis-restore-drill.yml` (cadence
`20 3 * * 1`, also `workflow_dispatch`).

For the most recent verified drill evidence (RDB persistence
state, dump/restore SHA parity, TTL parity), see the archived
heartbeat
`docs/archive/release-validation-pre-2026-05-05/2026-05-04-agn-737-redis-backup-restore-drill.md`.
