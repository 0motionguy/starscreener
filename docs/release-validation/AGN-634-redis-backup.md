# AGN-634 Redis Backup Automation Validation

Date: 2026-05-05
Owner: Release SRE
Workflow: `.github/workflows/backup-redis-snapshot.yml`

## Purpose
Daily Redis snapshot backup at 03:00 UTC to S3-compatible object storage (AWS S3 or Cloudflare R2) with 30-day retention.

## Required GitHub Secrets
- `REDIS_URL`
- `BACKUP_S3_BUCKET`
- `BACKUP_AWS_ACCESS_KEY_ID`
- `BACKUP_AWS_SECRET_ACCESS_KEY`
- `BACKUP_AWS_REGION` (optional for R2 but recommended)
- `BACKUP_S3_ENDPOINT_URL` (required for R2, e.g. `https://<accountid>.r2.cloudflarestorage.com`)
- `BACKUP_S3_PREFIX` (optional; default `redis-daily`)
- `BACKUP_AWS_SESSION_TOKEN` (optional)

## Validation Steps
1. Trigger manual run: `gh workflow run backup-redis-snapshot.yml`.
2. Verify run succeeds and artifact `redis-backup-metadata-<run_id>` exists.
3. Verify backup object exists in bucket prefix:
   `aws s3 ls s3://$BACKUP_S3_BUCKET/$BACKUP_S3_PREFIX/`
4. Verify checksum object exists (`.sha256`) beside `.rdb`.
5. Confirm retention path runs (check run logs for `Deleted expired backup:` lines when old objects exist).

## Restore Smoke Test (staging)
1. Download latest backup:
   `aws s3 cp s3://$BACKUP_S3_BUCKET/$BACKUP_S3_PREFIX/<latest>.rdb ./restore.rdb`
2. Restore into staging Redis:
   - Stop staging app traffic.
   - Load RDB into staging Redis instance using provider-supported restore path.
   - Start staging app traffic.
3. Validate core health endpoint and a data page after restore.

## Rollback Path
If backup workflow fails after deployment:
1. Disable schedule trigger for `backup-redis-snapshot.yml`.
2. Continue existing Redis operations unchanged (no runtime dependency on backup workflow).
3. Fix secret/config issue and re-run via `workflow_dispatch`.
4. Re-enable schedule only after one clean manual run.
