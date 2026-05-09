# Rollback Guide — `fix/starscreener-hardening-2026-04-18`

Per-commit revert steps. Each commit on this branch is independently revertable; no commit depends on later commits for correctness.

---

## If the whole PR needs to be reverted

```bash
# On main, after merge:
git revert <merge-commit-sha> -m 1
git push origin main
railway up    # redeploy
```

Pre-flight-2 warm-cron fix (`8771186`) stays in place — cron keeps doing real work via warm tier.

---

## Per-commit rollback

### Revert P0.3 watchlist integration

**Symptom:** the watchlist file is wrong (repos 404, seed-code conflict) OR the `TierContext` population breaks warm/cold tier selection.

```bash
git revert <p0.3-commit-sha>
git push origin main
railway up
```

**Effect after revert:** hot tier returns to processed:0 (the pre-commit bug). Pipeline stays green because `*/15 → warm` routing in `8771186` keeps producing real work every 15 min. No data loss.

**Zero-config fallback to keep the pipeline useful:** leave the interim `*/15 → warm` routing in place; the warm tier handles everything. Only the sub-15min-cadence-on-watchlist feature is lost.

### Revert P0.4 classifier + pre-release regex

**Symptom:** classifier F1 drops below baseline (measurable only once BACKTEST.md harness lands) OR some repo that was correctly tagged before gets mis-tagged.

```bash
git revert <p0.4-commit-sha>
git push origin main
railway up    # OR just wait for next ingest — classifier is pure, no migration
```

**Effect after revert:**
- `cline/cline`, `letta-ai/letta`, `huggingface/smolagents` go back to wrong primary categories.
- `release_major` starts firing on pre-release tags again (`1.3.0a3`).
- Test suite drops from 117 to 100 tests (the 17 P0.4+P0.3 tests vanish).

**Data migration:** none. Classifier runs on every ingest; old `.data/categories.jsonl` gets overwritten on the next recompute.

### Revert the pre-flight-2 warm-cron fix (`8771186`)

**Only do this AFTER P0.3 has been live for >1h in production** (so the watchlist populates the hot tier and `*/15 → hot` works end-to-end).

```bash
# After P0.3 is verified live:
git checkout main
# Edit .github/workflows/pipeline.yml — change the */15 arm back to tier=hot
git commit -am "revert interim: */15 → hot now that watchlist populates hot tier"
git push origin main
```

**Verification after re-revert:**
```bash
gh workflow run pipeline.yml --ref main
gh run watch
curl https://starscreener-production.up.railway.app/api/health   # expect 200
# Next */15 schedule trigger should also be green — watch for ~20 min.
```

**If the re-revert causes 404/verify-fail:** put the `*/15 → warm` routing back. Investigate why `/api/cron/ingest?tier=hot` still returns `processed:0` (watchlist data not deployed? import path wrong? Railway caching?).

---

## Known safe-to-rollback property

Each commit on this branch:
1. Touches **only** files listed in `PLAN.md` for its workstream.
2. Adds tests without deleting existing ones.
3. Does NOT change runtime schemas (no JSONL format bumps, no API shape changes).
4. Does NOT introduce new runtime dependencies.
5. Is **pure behavior change** — re-running classification / ingest after revert immediately restores pre-change behavior. No data migration needed.

---

## Non-revertable items (not on this branch)

Already-shipped secrets + Railway deploy:
- `STARSCREENER_URL` and `CRON_SECRET` in `0motionguy/starscreener/settings/secrets/actions` — revoke manually via GitHub UI if needed.
- UptimeRobot + BetterStack monitors on `/api/health` — pause or delete via their UIs (BetterStack monitor id `4294592`, UptimeRobot monitor already exists on `mirko.basil@googlemail.com` account).
- The BetterStack + UptimeRobot API tokens pasted into chat should be rotated regardless of rollback.
