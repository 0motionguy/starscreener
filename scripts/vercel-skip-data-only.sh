#!/usr/bin/env bash
# Vercel ignoreCommand: skip build if only data/** or .data/** files changed.
# Exit 0 = skip build. Exit 1 = build.
#
# Vercel sets VERCEL_GIT_COMMIT_REF (branch) + VERCEL_GIT_PREVIOUS_SHA (last deployed SHA).
# When previous SHA missing (first deploy / forked repo / preview), default to building.
set -euo pipefail

branch="${VERCEL_GIT_COMMIT_REF:-}"

# Hard skip for data-bot branches AND the ship/home-polish integration
# branch — both produce many small commits that should not each fire a
# preview build. Local dev (port 3025) is the canonical preview surface
# for ship/home-polish; Vercel previews are reserved for actual feature
# branches and main.
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
