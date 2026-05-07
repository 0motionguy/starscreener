#!/usr/bin/env bash
# Vercel ignoreCommand: skip build if only data/** or .data/** files changed.
# Exit 0 = skip build. Exit 1 = build.
#
# Vercel sets VERCEL_GIT_COMMIT_REF (branch) + VERCEL_GIT_PREVIOUS_SHA (last deployed SHA).
# When previous SHA missing (first deploy / forked repo / preview), default to building.
set -euo pipefail

branch="${VERCEL_GIT_COMMIT_REF:-}"

# Hard skip for data-bot branches AND ship/home-polish (local-preview branch).
# Both produce many small commits that should not each fire a preview build.
case "$branch" in
  data/*)
    echo "[ignoreCommand] data-bot branch ($branch) — skipping build unconditionally"
    exit 0
    ;;
  ship/home-polish)
    echo "[ignoreCommand] ship/home-polish (local-preview branch) — skipping build"
    exit 0
    ;;
esac

prev_raw="${VERCEL_GIT_PREVIOUS_SHA:-}"
head_sha=$(git rev-parse HEAD 2>/dev/null || echo "")

echo "[ignoreCommand] branch=$branch head=${head_sha:0:8} prev=${prev_raw:0:8}"

if [ -z "$prev_raw" ]; then
  echo "[ignoreCommand] no VERCEL_GIT_PREVIOUS_SHA — building"
  exit 1
fi

# Make the prev SHA fetchable + resolvable. Vercel passes a full SHA, but
# the shallow clone may not have it — we have to fetch first BEFORE
# attempting `git rev-parse --verify` (otherwise verify fails and we
# correctly fall through to build, but we'd miss the chance to do a
# proper diff if fetch would have succeeded).
git fetch --depth=50 origin "$prev_raw" 2>/dev/null || true

# Now resolve to a full SHA. If verify fails, we don't have the commit
# locally — build to be safe (this is the right behavior; we cannot
# decide skip-vs-build without seeing the diff).
if ! prev=$(git rev-parse --verify "$prev_raw" 2>/dev/null); then
  echo "[ignoreCommand] previous SHA $prev_raw not in history (shallow clone) — building"
  exit 1
fi

# Defensive: Vercel sometimes sets PREVIOUS_SHA == current HEAD on the
# first deploy of a new branch (or when the deploy queue is racing). Treat
# that as no prior deploy → build, never skip. Compare on the FULL SHAs
# (rev-parse normalized both sides).
if [ -n "$head_sha" ] && [ "$prev" = "$head_sha" ]; then
  echo "[ignoreCommand] prev SHA == HEAD (first deploy of branch) — building"
  exit 1
fi

# CRITICAL: do NOT swallow git diff failure with `|| true`. If diff fails
# (e.g. shallow clone is missing the tree we need), treat that as
# "uncertain" → BUILD. The previous version silently set $changed to empty
# and then the empty-diff branch below skipped — producing the "every
# build cancelled" outage on 2026-05-08 when Vercel's shallow clone
# couldn't compute a usable diff.
diff_status=0
changed=$(git diff --name-only "$prev" HEAD 2>&1) || diff_status=$?
if [ "$diff_status" -ne 0 ]; then
  echo "[ignoreCommand] git diff failed (exit=$diff_status) — building. Output:"
  echo "$changed" | head -5 | sed 's/^/  /'
  exit 1
fi

if [ -z "$changed" ]; then
  echo "[ignoreCommand] no diff vs $prev — skipping (genuinely identical trees)"
  exit 0
fi

non_data=$(echo "$changed" | grep -vE '^(data/|\.data/)' || true)

if [ -z "$non_data" ]; then
  echo "[ignoreCommand] data-only change detected — skipping build"
  echo "$changed" | head -10 | sed 's/^/  - /'
  exit 0
fi

echo "[ignoreCommand] non-data paths changed — building"
echo "$non_data" | head -10 | sed 's/^/  - /'
exit 1
