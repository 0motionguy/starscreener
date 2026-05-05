---
last-verified: 2026-05-05
verified-by: claude
status: living
---

# Apify Down (Twitter Signal Stop) Runbook

Target MTTR: <= 30 minutes

## Symptoms
- `/signals` Twitter/X column reports 0 fresh or stale beyond budget.
- `/twitter` panel stops updating even when other sources are fresh.
- `collect-twitter` workflow may succeed while local JSONL remains stale (persistence mismatch).

## Diagnosis
1. Confirm freshness timestamps for Twitter payload.
2. Check `collect-twitter` workflow outcome and logs.
3. Validate Apify credentials and actor config (`APIFY_API_TOKEN`, actor id).
4. If Apify is unavailable, test fallback provider path (Nitter/provider chain).

## Mitigation (30-min path)
1. Confirm `APIFY_API_TOKEN` validity and actor availability in Apify console.
2. Re-run `collect-twitter` once after token/config fix.
3. If Apify remains down, switch to Nitter fallback mode for continuity.
4. Verify `/signals` and `/twitter` freshness after rerun.

## Real Example (Past Quarter)
- 2026-05-04 audit found Twitter workflow success but stale `.data/twitter-*.jsonl` (`2026-04-23`), indicating persistence-path inconsistency and effective signal outage. See `docs/AUDIT-2026-05-04.md` Twitter row and Apify status notes.

## Rollback
- If fallback introduces low-quality/noisy signals, roll back provider override to last known stable Apify config and keep Twitter lane marked degraded until primary path is healthy.
