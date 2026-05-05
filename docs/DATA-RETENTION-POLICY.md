---
last-verified: 2026-05-05
verified-by: claude
status: living
---

# DATA RETENTION POLICY

Last verified: 2026-05-05

This policy documents current STARSCREENER retention behavior for GDPR/CCPA audit readiness.

| Data type | Retention | Deletion mechanism |
|---|---|---|
| Repo submissions (`.data/repo-submissions.jsonl`, `.data/revenue-submissions.jsonl`) | Indefinite (audit/moderation history) | Manual admin moderation/review flow; no automatic purge job in repo today. |
| User reactions (`.data/reactions.jsonl`) | Indefinite until user toggles off reaction | User-driven delete by re-toggling same reaction tuple (`userId`, `objectId`, `reactionType`); no age-based auto-purge. |
| Digest recipient emails (`DIGEST_USER_EMAILS_JSON`) | Until unsubscribe/removal from recipient map | Operational removal from `DIGEST_USER_EMAILS_JSON` (current implementation). No dedicated `digest-cleanup` cron exists in this repo as of 2026-05-05. |
| Sentry events | Per Sentry plan retention window (commonly 90 days, workspace-config dependent) | Upstream Sentry retention and deletion controls. |
| PostHog events | Per PostHog project retention settings | Upstream PostHog retention and deletion controls. |
| Redis ephemeral cache keys (`ss:data:v1:*`, `ss:meta:v1:*`) | TTL-based (default 24h unless per-key override or `ttlSeconds: 0`) | Redis key expiry (TTL) in `src/lib/data-store.ts`. |

## Notes

- This document reflects implemented behavior in the current codebase, not aspirational behavior.
- Where retention is upstream (Sentry/PostHog), legal retention enforcement lives in those provider consoles.
- For finite retention guarantees on digest recipients inside the app layer, add a first-party subscription table and cleanup cron before claiming automated in-repo deletion.