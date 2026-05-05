# GitHub Actions workflow conventions

Collectors run from GitHub Actions, not Vercel. Vercel's serverless
filesystem is read-only / ephemeral; any "api"-mode write vanishes
when the lambda dies. Reference: `collect-twitter.yml`,
`scrape-trending.yml`.

## Collector mode — `direct`, never `api`

Collectors that produce `.data/*.jsonl` or `data/*.json` MUST run in
`direct` mode (env `TWITTER_COLLECTOR_MODE: direct` or equivalent).
`direct` writes to the workflow's local filesystem so the next step
can commit. `api` mode POSTs to a Vercel ingest endpoint and the
write evaporates. Burned in `edf99d2`.

## Always commit + push from the workflow

After a collector step, run the shared `./.github/actions/git-commit-data`
composite action. It stages the listed paths, commits with
`HUSKY=0`, and pushes. `permissions: contents: write` is required at
the job or workflow level.

## Never `git add -A` in parallel-agent contexts

When multiple agents work the same checkout concurrently, `git add
-A` / `git add .` silently steals adjacent staged work into the
wrong commit. Always stage explicit file paths via the composite
action's `paths:` block (one path per line). Same rule applies to
any inline `git add` in workflow steps.

## Redis credential gate

Snapshot workflows MUST fail loud when both `REDIS_URL` and the
Upstash pair are unset (see the `Assert data-store credentials
present` step in `scrape-trending.yml`). Silent skips produce DEAD
keys.

## Concurrency

Use `concurrency: { group: data-refresh, cancel-in-progress: false }`
for any workflow that writes the same data files — prevents
interleaved commits.
