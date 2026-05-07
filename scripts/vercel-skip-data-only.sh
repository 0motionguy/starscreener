#!/usr/bin/env bash
# Vercel ignoreCommand: skip build if only data/** or .data/** files changed.
# Exit 0 = skip build. Exit 1 = build.
#
# Vercel sets VERCEL_GIT_COMMIT_REF (branch) + VERCEL_GIT_PREVIOUS_SHA (last deployed SHA).
# When previous SHA missing (first deploy / forked repo / preview), default to building.
set -euo pipefail

branch="${VERCEL_GIT_COMMIT_REF:-}"

# Hard skip for data-bot branches — they only ever touch data/** by construction.
# Skipping unconditionally beats the SHA fallback because shallow clones
# routinely hide the previous SHA and would otherwise default to building.
case "$branch" in
  data/*)
    echo "[ignoreCommand] data-bot branch ($branch) — skipping build unconditionally"
    exit 0
    ;;
esac

prev="${VERCEL_GIT_PREVIOUS_SHA:-}"
if [ -z "$prev" ]; then
  echo "[ignoreCommand] no VERCEL_GIT_PREVIOUS_SHA — building"
  exit 1
fi

# Compare current commit to last deployed; list changed files
git fetch --depth=50 origin "$prev" 2>/dev/null || true

if ! git rev-parse --verify "$prev" >/dev/null 2>&1; then
  echo "[ignoreCommand] previous SHA $prev not in history (shallow clone) — building"
  exit 1
fi

changed=$(git diff --name-only "$prev" HEAD || true)
if [ -z "$changed" ]; then
  echo "[ignoreCommand] no diff vs $prev — skipping"
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
