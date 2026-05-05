# AGN-1489 Last-7 Workflow Classification Refresh (2026-05-05)

## Scope and method
- Mandatory opening completed: `CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`.
- Freshness gate run at `2026-05-05T01:15:58.409Z` from `npm run freshness:check`.
- Last-7 workflow evidence pulled live with `gh run list --workflow <file> --limit 7 --json databaseId,createdAt,status,conclusion,headSha`.

## Freshness preflight result
- `localhost:3023` status: reachable (NOT missing).
- Product state: `health=stale`, `sourceStatus=degraded`.
- Summary: `green=37 yellow=11 red=2 dead=0 blocking_non_green=11 advisory_non_green=2`.
- RED freshness sources: `trending-repos`, `producthunt`.

## Last-7 classification for freshness-critical workflows

| Source (freshness) | Workflow file | Last-7 outcome pattern | Class | Evidence anchors |
|---|---|---|---|---|
| trending-repos (RED) | `scrape-trending.yml` | `F,F,F,F,F,F,F` | FAILING-HARD | runs: `25349394588, 25347040280, 25343958282, 25340045986, 25334549029, 25330147025, 25325105359` |
| producthunt (RED) | `scrape-producthunt.yml` | `F,F,F,F,S,S,S` | FAILING-REGRESSION | runs: `25350224301, 25341443402, 25331504701, 25318709118, 25294458156, 25289224325, 25283754992` |
| twitter (YELLOW) | `collect-twitter.yml` | `F,S,F,F,F,F,F` | FAILING-INTERMITTENT (mostly failing) | runs: `25345476405, 25338052433, 25330238552, 25321257884, 25320467654, 25319984417, 25314971263` |
| lobsters (YELLOW) | `scrape-lobsters.yml` | `F,F,F,F,F,F,F` | FAILING-HARD | runs: `25352519067, 25349212389, 25347222911, 25342754102, 25337829263, 25332554096, 25325344635` |
| npm (YELLOW) | `scrape-npm.yml` | `F,S,S,S,S,S,S` | DEGRADED-RECENT-FAIL | runs: `25316003524, 25279724898, 25276438291, 25249602908, 25211572422, 25162018186, 25105267666` |
| openai-rss (YELLOW) | `scrape-openai-rss.yml` | `F,S,S,S,S` | DEGRADED-RECENT-FAIL | runs: `25312866559, 25279725701, 25275071068, 25248310414, 25209463961` |
| claude-rss (YELLOW) | `scrape-claude-rss.yml` | `S,S,S,S,S` | STALE-NOT-FAILING | runs: `25311651641, 25279719262, 25274866607, 25248176472, 25209227711` |
| awesome-skills (YELLOW) | `scrape-awesome-skills.yml` | `S,S,S,S,S,S,S` | STALE-NOT-FAILING | runs: `25306568740, 25279717302, 25272255345, 25245694999, 25206068783, 25151426819, 25094648559` |
| staleness-report (YELLOW) | `sweep-staleness.yml` | `S,S,S,S,S,S,S` | STALE-NOT-FAILING | runs: `25302927910, 25279731477, 25270985876, 25244534281, 25216986511, 25216398656, 25204037211` |
| unknown-mentions (YELLOW) | `promote-unknown-mentions.yml` | `S,S,S,S,S` | STALE-NOT-FAILING | runs: `25306827403, 25279691667, 25272656561, 25245760319, 25206184731` |
| agent-commerce (YELLOW) | `cron-agent-commerce.yml` | `F,F,F,F,F,F` | FAILING-HARD | runs: `25320475449, 25306822428, 25305390978, 25279679738, 25272654894, 25245755398` |

## Distinguish stale deploy vs code failure
- Code/workflow failure dominant: `scrape-trending`, `scrape-lobsters`, `cron-agent-commerce`, `collect-twitter`, `scrape-producthunt` (recent cluster), plus recent single failures for `scrape-npm` and `scrape-openai-rss`.
- Stale-without-last-7-failure: `scrape-claude-rss`, `scrape-awesome-skills`, `sweep-staleness`, `promote-unknown-mentions`.
- This split indicates part of current non-green freshness is cron cadence/budget age drift, while RED rows and several YELLOW rows are active execution failures.

## Rollback readiness note
- No deploy/config edit executed in this heartbeat; rollback path remains unchanged.
- If remediation PRs are opened, keep one-workflow-at-a-time branching and retain previous workflow YAML revisions as immediate rollback target (`git revert <remediation-commit>`).
