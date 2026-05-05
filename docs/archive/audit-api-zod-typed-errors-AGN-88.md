# AGN-88 API Route Zod + Typed-Error Coverage Audit

Generated: 2026-05-04T16:03:25.888Z

Total routes scanned: 111

- validates-input=NO gaps: 80
- uses-src/lib/errors.ts-typed-errors=NO gaps: 109

| Route | Validates input via zod/schema? | Uses src/lib/errors.ts typed categories? | Evidence |
|---|---|---|---|
| /%5Finternal/sentry-canary | NO | YES | src/app/api/%5Finternal/sentry-canary/route.ts:15 |
| /admin/drop-events | NO | NO | src/app/api/admin/drop-events/route.ts:51 |
| /admin/ideas-queue | YES | NO | src/app/api/admin/ideas-queue/route.ts:46 |
| /admin/login | YES | NO | src/app/api/admin/login/route.ts:149 |
| /admin/overview | NO | NO | src/app/api/admin/overview/route.ts:114 |
| /admin/pool-state | NO | NO | src/app/api/admin/pool-state/route.ts:693 |
| /admin/queues/repo | YES | NO | src/app/api/admin/queues/repo/route.ts:50 |
| /admin/revenue-queue | YES | NO | src/app/api/admin/revenue-queue/route.ts:73 |
| /admin/scan-log | NO | NO | src/app/api/admin/scan-log/route.ts:191 |
| /admin/scan | NO | NO | src/app/api/admin/scan/route.ts:218 |
| /admin/sentry-verify | YES | NO | src/app/api/admin/sentry-verify/route.ts:31 |
| /admin/stats | NO | NO | src/app/api/admin/stats/route.ts:144 |
| /admin/unknown-mentions | YES | NO | src/app/api/admin/unknown-mentions/route.ts:95 |
| /agent-commerce/[slug] | NO | NO | src/app/api/agent-commerce/[slug]/route.ts:21 |
| /agent-commerce/categories | NO | NO | src/app/api/agent-commerce/categories/route.ts:19 |
| /agent-commerce | NO | NO | src/app/api/agent-commerce/route.ts:41 |
| /agent-commerce/signals | NO | NO | src/app/api/agent-commerce/signals/route.ts:16 |
| /agent-commerce/trending | NO | NO | src/app/api/agent-commerce/trending/route.ts:14 |
| /auth/session | YES | NO | src/app/api/auth/session/route.ts:90 |
| /categories | NO | NO | src/app/api/categories/route.ts:13 |
| /checkout/stripe | YES | NO | src/app/api/checkout/stripe/route.ts:108 |
| /collections/[slug] | NO | NO | src/app/api/collections/[slug]/route.ts:62 |
| /collections | NO | NO | src/app/api/collections/route.ts:22 |
| /compare/github | NO | NO | src/app/api/compare/github/route.ts:121 |
| /compare/payloads | NO | NO | src/app/api/compare/payloads/route.ts:28 |
| /compare | NO | NO | src/app/api/compare/route.ts:72 |
| /compare/share | YES | NO | src/app/api/compare/share/route.ts:51 |
| /cron/aiso-drain | YES | NO | src/app/api/cron/aiso-drain/route.ts:308 |
| /cron/digest/weekly | NO | NO | src/app/api/cron/digest/weekly/route.ts:83 |
| /cron/freshness/state | NO | NO | src/app/api/cron/freshness/state/route.ts:710 |
| /cron/llm/aggregate | NO | NO | src/app/api/cron/llm/aggregate/route.ts:56 |
| /cron/llm/sync-models | NO | NO | src/app/api/cron/llm/sync-models/route.ts:126 |
| /cron/mcp/rotate-usage | NO | NO | src/app/api/cron/mcp/rotate-usage/route.ts:38 |
| /cron/news-auto-recover | NO | NO | src/app/api/cron/news-auto-recover/route.ts:66 |
| /cron/predictions/calibrate | YES | NO | src/app/api/cron/predictions/calibrate/route.ts:89 |
| /cron/predictions | YES | NO | src/app/api/cron/predictions/route.ts:108 |
| /cron/subdomain-takeover | NO | NO | src/app/api/cron/subdomain-takeover/route.ts:13 |
| /cron/twitter-daily | NO | NO | src/app/api/cron/twitter-daily/route.ts:93 |
| /cron/twitter-weekly-recap | NO | NO | src/app/api/cron/twitter-weekly-recap/route.ts:40 |
| /cron/webhooks/flush | NO | NO | src/app/api/cron/webhooks/flush/route.ts:321 |
| /cron/webhooks/scan | NO | NO | src/app/api/cron/webhooks/scan/route.ts:197 |
| /export/csv | YES | NO | src/app/api/export/csv/route.ts:245 |
| /funding/events | NO | NO | src/app/api/funding/events/route.ts:51 |
| /funding/sectors | NO | NO | src/app/api/funding/sectors/route.ts:32 |
| /health/cron-activity | NO | NO | src/app/api/health/cron-activity/route.ts:41 |
| /health/portal | NO | NO | src/app/api/health/portal/route.ts:24 |
| /health | NO | NO | src/app/api/health/route.ts:204 |
| /health/sources | NO | NO | src/app/api/health/sources/route.ts:93 |
| /ideas/[id] | NO | NO | src/app/api/ideas/[id]/route.ts:32 |
| /ideas | YES | NO | src/app/api/ideas/route.ts:82 |
| /internal/signals/twitter/v1/candidates | NO | NO | src/app/api/internal/signals/twitter/v1/candidates/route.ts:30 |
| /internal/signals/twitter/v1/ingest | YES | NO | src/app/api/internal/signals/twitter/v1/ingest/route.ts:43 |
| /internal/twitter/v1/findings | YES | NO | src/app/api/internal/twitter/v1/findings/route.ts:37 |
| /internal/twitter/v1/review/[owner]/[name] | NO | NO | src/app/api/internal/twitter/v1/review/[owner]/[name]/route.ts:10 |
| /mcp/record-call | YES | NO | src/app/api/mcp/record-call/route.ts:66 |
| /mcp/usage | NO | NO | src/app/api/mcp/usage/route.ts:69 |
| /model-usage/[modelId] | NO | NO | src/app/api/model-usage/[modelId]/route.ts:30 |
| /model-usage/features | NO | NO | src/app/api/model-usage/features/route.ts:19 |
| /model-usage/models | NO | NO | src/app/api/model-usage/models/route.ts:26 |
| /model-usage/overview | NO | NO | src/app/api/model-usage/overview/route.ts:26 |
| /model-usage/rankings | NO | NO | src/app/api/model-usage/rankings/route.ts:34 |
| /oembed | NO | NO | src/app/api/oembed/route.ts:70 |
| /og/mindshare | NO | NO | src/app/api/og/mindshare/route.tsx:417 |
| /og/star-activity | NO | NO | src/app/api/og/star-activity/route.tsx:879 |
| /og/tier-list | YES | NO | src/app/api/og/tier-list/route.tsx:107 |
| /og/top10 | NO | NO | src/app/api/og/top10/route.tsx:629 |
| /openapi.json | NO | YES | src/app/api/openapi.json/route.ts:146 |
| /pipeline/alerts | YES | NO | src/app/api/pipeline/alerts/route.ts:43 |
| /pipeline/alerts/rules | YES | NO | src/app/api/pipeline/alerts/rules/route.ts:54 |
| /pipeline/backfill-history | YES | NO | src/app/api/pipeline/backfill-history/route.ts:55 |
| /pipeline/cleanup | YES | NO | src/app/api/pipeline/cleanup/route.ts:101 |
| /pipeline/deltas | YES | NO | src/app/api/pipeline/deltas/route.ts:142 |
| /pipeline/featured | NO | NO | src/app/api/pipeline/featured/route.ts:250 |
| /pipeline/freshness | NO | NO | src/app/api/pipeline/freshness/route.ts:23 |
| /pipeline/ingest | YES | NO | src/app/api/pipeline/ingest/route.ts:152 |
| /pipeline/meta-counts | NO | NO | src/app/api/pipeline/meta-counts/route.ts:18 |
| /pipeline/persist | NO | NO | src/app/api/pipeline/persist/route.ts:33 |
| /pipeline/profiles/enrich | YES | NO | src/app/api/pipeline/profiles/enrich/route.ts:135 |
| /pipeline/rebuild | YES | NO | src/app/api/pipeline/rebuild/route.ts:88 |
| /pipeline/recompute | NO | NO | src/app/api/pipeline/recompute/route.ts:34 |
| /pipeline/refresh | NO | NO | src/app/api/pipeline/refresh/route.ts:59 |
| /pipeline/sidebar-data | NO | NO | src/app/api/pipeline/sidebar-data/route.ts:26 |
| /pipeline/status | NO | NO | src/app/api/pipeline/status/route.ts:124 |
| /predict/calibration | NO | NO | src/app/api/predict/calibration/route.ts:50 |
| /predict | NO | NO | src/app/api/predict/route.ts:69 |
| /profile/[handle] | NO | NO | src/app/api/profile/[handle]/route.ts:29 |
| /reactions | YES | NO | src/app/api/reactions/route.ts:63 |
| /repo-submissions | YES | NO | src/app/api/repo-submissions/route.ts:69 |
| /repos/[owner]/[name]/aiso | NO | NO | src/app/api/repos/[owner]/[name]/aiso/route.ts:126 |
| /repos/[owner]/[name]/events | NO | NO | src/app/api/repos/[owner]/[name]/events/route.ts:50 |
| /repos/[owner]/[name]/freshness | NO | NO | src/app/api/repos/[owner]/[name]/freshness/route.ts:27 |
| /repos/[owner]/[name]/mentions | NO | NO | src/app/api/repos/[owner]/[name]/mentions/route.ts:111 |
| /repos/[owner]/[name] | NO | NO | src/app/api/repos/[owner]/[name]/route.ts:87 |
| /repos/batch | NO | NO | src/app/api/repos/batch/route.ts:58 |
| /repos | NO | NO | src/app/api/repos/route.ts:120 |
| /scoring/consensus | NO | NO | src/app/api/scoring/consensus/route.ts:49 |
| /scoring/engagement | NO | NO | src/app/api/scoring/engagement/route.ts:56 |
| /search | NO | NO | src/app/api/search/route.ts:163 |
| /skills | NO | NO | src/app/api/skills/route.ts:44 |
| /stream | NO | NO | src/app/api/stream/route.ts:64 |
| /submissions/revenue | YES | NO | src/app/api/submissions/revenue/route.ts:69 |
| /tier-lists/[shortId] | NO | NO | src/app/api/tier-lists/[shortId]/route.ts:17 |
| /tier-lists | YES | NO | src/app/api/tier-lists/route.ts:22 |
| /tier-lists/templates/[slug] | NO | NO | src/app/api/tier-lists/templates/[slug]/route.ts:19 |
| /tools/revenue-estimate | NO | NO | src/app/api/tools/revenue-estimate/route.ts:17 |
| /twitter/leaderboard | NO | NO | src/app/api/twitter/leaderboard/route.ts:25 |
| /twitter/repos/[owner]/[name] | NO | NO | src/app/api/twitter/repos/[owner]/[name]/route.ts:11 |
| /watchlist/private | YES | NO | src/app/api/watchlist/private/route.ts:119 |
| /webhooks/stripe | NO | NO | src/app/api/webhooks/stripe/route.ts:50 |
| /worker/health | NO | NO | src/app/api/worker/health/route.ts:173 |
| /worker/pulse | NO | NO | src/app/api/worker/pulse/route.ts:32 |

## Missing input validation gaps

- src/app/api/%5Finternal/sentry-canary/route.ts:15
- src/app/api/admin/drop-events/route.ts:51
- src/app/api/admin/overview/route.ts:114
- src/app/api/admin/pool-state/route.ts:693
- src/app/api/admin/scan-log/route.ts:191
- src/app/api/admin/scan/route.ts:218
- src/app/api/admin/stats/route.ts:144
- src/app/api/agent-commerce/[slug]/route.ts:21
- src/app/api/agent-commerce/categories/route.ts:19
- src/app/api/agent-commerce/route.ts:41
- src/app/api/agent-commerce/signals/route.ts:16
- src/app/api/agent-commerce/trending/route.ts:14
- src/app/api/categories/route.ts:13
- src/app/api/collections/[slug]/route.ts:62
- src/app/api/collections/route.ts:22
- src/app/api/compare/github/route.ts:121
- src/app/api/compare/payloads/route.ts:28
- src/app/api/compare/route.ts:72
- src/app/api/cron/digest/weekly/route.ts:83
- src/app/api/cron/freshness/state/route.ts:710
- src/app/api/cron/llm/aggregate/route.ts:56
- src/app/api/cron/llm/sync-models/route.ts:126
- src/app/api/cron/mcp/rotate-usage/route.ts:38
- src/app/api/cron/news-auto-recover/route.ts:66
- src/app/api/cron/subdomain-takeover/route.ts:13
- src/app/api/cron/twitter-daily/route.ts:93
- src/app/api/cron/twitter-weekly-recap/route.ts:40
- src/app/api/cron/webhooks/flush/route.ts:321
- src/app/api/cron/webhooks/scan/route.ts:197
- src/app/api/funding/events/route.ts:51
- src/app/api/funding/sectors/route.ts:32
- src/app/api/health/cron-activity/route.ts:41
- src/app/api/health/portal/route.ts:24
- src/app/api/health/route.ts:204
- src/app/api/health/sources/route.ts:93
- src/app/api/ideas/[id]/route.ts:32
- src/app/api/internal/signals/twitter/v1/candidates/route.ts:30
- src/app/api/internal/twitter/v1/review/[owner]/[name]/route.ts:10
- src/app/api/mcp/usage/route.ts:69
- src/app/api/model-usage/[modelId]/route.ts:30
- src/app/api/model-usage/features/route.ts:19
- src/app/api/model-usage/models/route.ts:26
- src/app/api/model-usage/overview/route.ts:26
- src/app/api/model-usage/rankings/route.ts:34
- src/app/api/oembed/route.ts:70
- src/app/api/og/mindshare/route.tsx:417
- src/app/api/og/star-activity/route.tsx:879
- src/app/api/og/top10/route.tsx:629
- src/app/api/openapi.json/route.ts:146
- src/app/api/pipeline/featured/route.ts:250
- src/app/api/pipeline/freshness/route.ts:23
- src/app/api/pipeline/meta-counts/route.ts:18
- src/app/api/pipeline/persist/route.ts:33
- src/app/api/pipeline/recompute/route.ts:34
- src/app/api/pipeline/refresh/route.ts:59
- src/app/api/pipeline/sidebar-data/route.ts:26
- src/app/api/pipeline/status/route.ts:124
- src/app/api/predict/calibration/route.ts:50
- src/app/api/predict/route.ts:69
- src/app/api/profile/[handle]/route.ts:29
- src/app/api/repos/[owner]/[name]/aiso/route.ts:126
- src/app/api/repos/[owner]/[name]/events/route.ts:50
- src/app/api/repos/[owner]/[name]/freshness/route.ts:27
- src/app/api/repos/[owner]/[name]/mentions/route.ts:111
- src/app/api/repos/[owner]/[name]/route.ts:87
- src/app/api/repos/batch/route.ts:58
- src/app/api/repos/route.ts:120
- src/app/api/scoring/consensus/route.ts:49
- src/app/api/scoring/engagement/route.ts:56
- src/app/api/search/route.ts:163
- src/app/api/skills/route.ts:44
- src/app/api/stream/route.ts:64
- src/app/api/tier-lists/[shortId]/route.ts:17
- src/app/api/tier-lists/templates/[slug]/route.ts:19
- src/app/api/tools/revenue-estimate/route.ts:17
- src/app/api/twitter/leaderboard/route.ts:25
- src/app/api/twitter/repos/[owner]/[name]/route.ts:11
- src/app/api/webhooks/stripe/route.ts:50
- src/app/api/worker/health/route.ts:173
- src/app/api/worker/pulse/route.ts:32

## Missing typed-error usage gaps

- src/app/api/admin/drop-events/route.ts:51
- src/app/api/admin/ideas-queue/route.ts:46
- src/app/api/admin/login/route.ts:149
- src/app/api/admin/overview/route.ts:114
- src/app/api/admin/pool-state/route.ts:693
- src/app/api/admin/queues/repo/route.ts:50
- src/app/api/admin/revenue-queue/route.ts:73
- src/app/api/admin/scan-log/route.ts:191
- src/app/api/admin/scan/route.ts:218
- src/app/api/admin/sentry-verify/route.ts:31
- src/app/api/admin/stats/route.ts:144
- src/app/api/admin/unknown-mentions/route.ts:95
- src/app/api/agent-commerce/[slug]/route.ts:21
- src/app/api/agent-commerce/categories/route.ts:19
- src/app/api/agent-commerce/route.ts:41
- src/app/api/agent-commerce/signals/route.ts:16
- src/app/api/agent-commerce/trending/route.ts:14
- src/app/api/auth/session/route.ts:90
- src/app/api/categories/route.ts:13
- src/app/api/checkout/stripe/route.ts:108
- src/app/api/collections/[slug]/route.ts:62
- src/app/api/collections/route.ts:22
- src/app/api/compare/github/route.ts:121
- src/app/api/compare/payloads/route.ts:28
- src/app/api/compare/route.ts:72
- src/app/api/compare/share/route.ts:51
- src/app/api/cron/aiso-drain/route.ts:308
- src/app/api/cron/digest/weekly/route.ts:83
- src/app/api/cron/freshness/state/route.ts:710
- src/app/api/cron/llm/aggregate/route.ts:56
- src/app/api/cron/llm/sync-models/route.ts:126
- src/app/api/cron/mcp/rotate-usage/route.ts:38
- src/app/api/cron/news-auto-recover/route.ts:66
- src/app/api/cron/predictions/calibrate/route.ts:89
- src/app/api/cron/predictions/route.ts:108
- src/app/api/cron/subdomain-takeover/route.ts:13
- src/app/api/cron/twitter-daily/route.ts:93
- src/app/api/cron/twitter-weekly-recap/route.ts:40
- src/app/api/cron/webhooks/flush/route.ts:321
- src/app/api/cron/webhooks/scan/route.ts:197
- src/app/api/export/csv/route.ts:245
- src/app/api/funding/events/route.ts:51
- src/app/api/funding/sectors/route.ts:32
- src/app/api/health/cron-activity/route.ts:41
- src/app/api/health/portal/route.ts:24
- src/app/api/health/route.ts:204
- src/app/api/health/sources/route.ts:93
- src/app/api/ideas/[id]/route.ts:32
- src/app/api/ideas/route.ts:82
- src/app/api/internal/signals/twitter/v1/candidates/route.ts:30
- src/app/api/internal/signals/twitter/v1/ingest/route.ts:43
- src/app/api/internal/twitter/v1/findings/route.ts:37
- src/app/api/internal/twitter/v1/review/[owner]/[name]/route.ts:10
- src/app/api/mcp/record-call/route.ts:66
- src/app/api/mcp/usage/route.ts:69
- src/app/api/model-usage/[modelId]/route.ts:30
- src/app/api/model-usage/features/route.ts:19
- src/app/api/model-usage/models/route.ts:26
- src/app/api/model-usage/overview/route.ts:26
- src/app/api/model-usage/rankings/route.ts:34
- src/app/api/oembed/route.ts:70
- src/app/api/og/mindshare/route.tsx:417
- src/app/api/og/star-activity/route.tsx:879
- src/app/api/og/tier-list/route.tsx:107
- src/app/api/og/top10/route.tsx:629
- src/app/api/pipeline/alerts/route.ts:43
- src/app/api/pipeline/alerts/rules/route.ts:54
- src/app/api/pipeline/backfill-history/route.ts:55
- src/app/api/pipeline/cleanup/route.ts:101
- src/app/api/pipeline/deltas/route.ts:142
- src/app/api/pipeline/featured/route.ts:250
- src/app/api/pipeline/freshness/route.ts:23
- src/app/api/pipeline/ingest/route.ts:152
- src/app/api/pipeline/meta-counts/route.ts:18
- src/app/api/pipeline/persist/route.ts:33
- src/app/api/pipeline/profiles/enrich/route.ts:135
- src/app/api/pipeline/rebuild/route.ts:88
- src/app/api/pipeline/recompute/route.ts:34
- src/app/api/pipeline/refresh/route.ts:59
- src/app/api/pipeline/sidebar-data/route.ts:26
- src/app/api/pipeline/status/route.ts:124
- src/app/api/predict/calibration/route.ts:50
- src/app/api/predict/route.ts:69
- src/app/api/profile/[handle]/route.ts:29
- src/app/api/reactions/route.ts:63
- src/app/api/repo-submissions/route.ts:69
- src/app/api/repos/[owner]/[name]/aiso/route.ts:126
- src/app/api/repos/[owner]/[name]/events/route.ts:50
- src/app/api/repos/[owner]/[name]/freshness/route.ts:27
- src/app/api/repos/[owner]/[name]/mentions/route.ts:111
- src/app/api/repos/[owner]/[name]/route.ts:87
- src/app/api/repos/batch/route.ts:58
- src/app/api/repos/route.ts:120
- src/app/api/scoring/consensus/route.ts:49
- src/app/api/scoring/engagement/route.ts:56
- src/app/api/search/route.ts:163
- src/app/api/skills/route.ts:44
- src/app/api/stream/route.ts:64
- src/app/api/submissions/revenue/route.ts:69
- src/app/api/tier-lists/[shortId]/route.ts:17
- src/app/api/tier-lists/route.ts:22
- src/app/api/tier-lists/templates/[slug]/route.ts:19
- src/app/api/tools/revenue-estimate/route.ts:17
- src/app/api/twitter/leaderboard/route.ts:25
- src/app/api/twitter/repos/[owner]/[name]/route.ts:11
- src/app/api/watchlist/private/route.ts:119
- src/app/api/webhooks/stripe/route.ts:50
- src/app/api/worker/health/route.ts:173
- src/app/api/worker/pulse/route.ts:32
