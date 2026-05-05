# AGN-634 Redis Backup Automation Validation

Date: 2026-05-05
Owner: Release SRE
Workflow: `.github/workflows/backup-redis-snapshot.yml`

## Purpose
Daily Redis snapshot backup at 03:00 UTC to Cloudflare R2 with 30-day retention.

## Required GitHub Secrets (workflow runtime)
- `REDIS_URL`
- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET` (expected value: `trendingrepo-redis-backups`)
- `R2_PREFIX` (optional; default `redis-daily`)

## Operator Credentials Landing
Mirko action packet says Vercel/Railway env vars should be set first:
- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET=trendingrepo-redis-backups`

For this GitHub workflow to execute, the same values must also exist in GitHub repo secrets with identical names.

## Validation Steps
1. Trigger manual run: `gh workflow run backup-redis-snapshot.yml`.
2. Verify run succeeds and artifact `redis-backup-metadata-<run_id>` exists.
3. Verify backup object exists:
   `aws --endpoint-url https://$R2_ACCOUNT_ID.r2.cloudflarestorage.com s3 ls s3://$R2_BUCKET/$R2_PREFIX/`
4. Verify checksum object exists (`.sha256`) beside `.rdb`.
5. Confirm retention path runs (check logs for `Deleted expired backup:` lines when old objects exist).

## Restore Smoke Test (staging)
1. Download latest backup:
   `aws --endpoint-url https://$R2_ACCOUNT_ID.r2.cloudflarestorage.com s3 cp s3://$R2_BUCKET/$R2_PREFIX/<latest>.rdb ./restore.rdb`
2. Restore into staging Redis:
   - Stop staging app traffic.
   - Load RDB into staging Redis instance using provider-supported restore path.
   - Start staging app traffic.
3. Validate staging health endpoint and one data page after restore.

## Rollback Path
If backup workflow fails after deployment:
1. Disable schedule trigger for `backup-redis-snapshot.yml`.
2. Keep production runtime unchanged (backup workflow is out-of-band).
3. Fix R2 secret/config issue and re-run via `workflow_dispatch`.
4. Re-enable schedule only after one clean manual run.
