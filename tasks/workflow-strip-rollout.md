# Workflow Strip Rollout — stop the every-20-min Vercel deploys

**Status:** Phase 1B code is shipped (commit `87e3f4e`). This doc is the LAST step that flips the deploy savings on.

## Why this is a separate step

Removing `git push` from the 12 cron workflows BEFORE Upstash is live in CI would freeze data forever:
- Workflows still scrape every hour
- File write happens on the GH runner (ephemeral)
- Without `git push`, file writes are thrown away with the runner
- Without Upstash secrets in CI, the Redis write is silently skipped
- Net effect: data freshness halts at the last committed snapshot

## Three-step rollout (do in order)

### 1. Add Upstash secrets to GitHub Actions
After provisioning Upstash (see [data-api.md](data-api.md)):

```bash
gh secret set UPSTASH_REDIS_REST_URL --body "https://xxx.upstash.io"
gh secret set UPSTASH_REDIS_REST_TOKEN --body "xxx-token-xxx"
```

Verify:
```bash
gh secret list | grep UPSTASH
```

### 2. Verify Upstash is being written in CI
Trigger one workflow manually and check the run output for `[redis: redis]`:

```bash
gh workflow run scrape-trending.yml
gh run watch  # or open https://github.com/0motionguy/starscreener/actions
```

The "Refresh OSSInsight trending" step output should include lines like:
```
wrote /path/to/data/trending.json (1234 rows across 15 buckets) [redis: redis]
wrote /path/to/data/hot-collections.json (...) [redis: redis]
```

If you see `[redis: skipped]`, the secrets aren't reaching the workflow — fix step 1 first.

### 3. Apply the workflow strip + push to main

For each of the 12 workflows below, two changes:

**A. Add Upstash secrets to the scrape step env block**

```yaml
- name: Refresh <source>
  env:
    # ... existing env vars ...
    UPSTASH_REDIS_REST_URL: ${{ secrets.UPSTASH_REDIS_REST_URL }}
    UPSTASH_REDIS_REST_TOKEN: ${{ secrets.UPSTASH_REDIS_REST_TOKEN }}
  run: node scripts/<scrape>.mjs
```

**B. Delete the entire `Commit if changed` step**

Pre-commit pattern to find:
```yaml
      - name: Commit if changed
        run: |
          git config user.name  "starscreener-bot"
          git config user.email "bot@starscreener.local"
          git add data/...
          if git diff --quiet --staged; then
            echo "no changes - skipping commit"
            exit 0
          fi
          TS=$(date -u +%Y-%m-%dT%H:%M:%SZ)
          git commit -m "chore(data): refresh ... ${TS}"
          git pull --rebase origin main
          git push
```

Replace with:
```yaml
      # Phase 1B (data-API): data-store writes to Redis are the durable
      # path. File writes on the GH runner are intentionally ephemeral —
      # collectors no longer git-push to main. To re-enable file push as
      # an emergency rollback, restore the pre-87e3f4e block.
```

Also drop `permissions: contents: write` (no longer needed without push) and the `concurrency:` group around git push (the data-store handles its own deduplication).

### The 12 workflows

| File | Output files | Cadence |
|---|---|---|
| `scrape-trending.yml` | trending.json, hot-collections.json, deltas.json, repo-metadata.json, recent-repos.json | hourly :27 |
| `scrape-reddit.yml` (in scrape-trending.yml) | reddit-mentions.json, reddit-all-posts.json | hourly :27 |
| `scrape-hackernews.yml` (in scrape-trending.yml) | hackernews-trending.json, hackernews-repo-mentions.json | hourly :27 |
| `scrape-bluesky.yml` | bluesky-mentions.json, bluesky-trending.json | hourly :17 |
| `scrape-devto.yml` | devto-mentions.json, devto-trending.json | daily 08:30 |
| `scrape-lobsters.yml` | lobsters-mentions.json, lobsters-trending.json | hourly :37 |
| `scrape-npm.yml` | npm-packages.json | daily 09:17 |
| `scrape-producthunt.yml` | producthunt-launches.json | 4×/day |
| `enrich-repo-profiles.yml` | repo-profiles.json | hourly :41 |
| `refresh-collection-rankings.yml` | collection-rankings.json | every 6h :17 |
| `refresh-reddit-baselines.yml` | reddit-baselines.json | weekly Mon 03:17 |
| `sync-trustmrr.yml` | trustmrr-startups.json + meta sidecar, revenue-overlays.json, revenue-benchmarks.json | hourly :27 + full daily 02:27 |
| `collect-funding.yml` | funding-news.json | every 6h |
| `collect-twitter.yml` | (`.data/twitter-*.jsonl` — Phase 2 scope, leave alone) | every 3h |

**Note:** `collect-twitter.yml` writes to `.data/*.jsonl` (different shape — append-only logs). Out of Phase 1B scope. Leave its git push intact for now; it migrates in Phase 2.

### Expected impact after step 3

- Vercel deploys per day from data churn: ~17 → **~0** (only real code pushes deploy)
- Data freshness on the homepage: 30-60 seconds (Redis read latency + per-source 30s refresh dedupe)
- Bundled JSON files in repo: stay frozen at last commit before the strip — they're still the cold-start seed

## Rollback plan

If something breaks after the strip:
1. Revert the workflow strip commit
2. Workflows resume committing data files to main
3. Vercel deploys resume their pre-strip cadence
4. Data is fresh again within one cron tick

The data-store reader path stays intact in either direction — it's tier 2 (file) that just becomes more important during a rollback.

## Verification checklist post-strip

- [ ] Trigger `scrape-trending.yml` manually — completes green, no commit step in run log
- [ ] Hit `https://trendingrepo.com/api/health` — `lastFetchedAt` updates within ~1 hour of the run
- [ ] Check Vercel dashboard — no new prod deploy triggered by the run
- [ ] Wait 24h — Vercel deploy count for the day should be < 5 (was 30+)
