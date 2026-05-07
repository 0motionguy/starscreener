#!/usr/bin/env bash
# Vercel ignoreCommand: skip build if only data/** or .data/** files changed.
# Exit 0 = skip build. Exit 1 = build.
#
# Vercel sets VERCEL_GIT_COMMIT_REF (branch) + VERCEL_GIT_PREVIOUS_SHA (last
# deployed SHA). Fresh data-bot PR branches often have no previous deployment
# SHA, so fall back to a merge-base diff against the default branch before
# deciding to build.
set -euo pipefail

DATA_PATH_RE='^(data/|\.data/)'

classify_changed_paths() {
  local base="$1"
  local label="$2"
  local changed
  local non_data

  changed=$(git diff --name-only "$base" HEAD || true)
  if [ -z "$changed" ]; then
    echo "[ignoreCommand] no diff vs $label - skipping"
    exit 0
  fi

  non_data=$(echo "$changed" | grep -vE "$DATA_PATH_RE" || true)
  if [ -z "$non_data" ]; then
    echo "[ignoreCommand] data-only change detected vs $label - skipping build"
    echo "$changed" | head -10 | sed 's/^/  - /'
    exit 0
  fi

  echo "[ignoreCommand] non-data paths changed vs $label - building"
  echo "$non_data" | head -10 | sed 's/^/  - /'
  exit 1
}

fetch_branch() {
  local branch="$1"
  [ -z "$branch" ] && return 0
  git fetch --no-tags --depth=200 origin \
    "+refs/heads/${branch}:refs/remotes/origin/${branch}" >/dev/null 2>&1 || true
}

prev="${VERCEL_GIT_PREVIOUS_SHA:-}"
if [ -n "$prev" ]; then
  # Compare current commit to last deployed when Vercel provides it.
  commit_ref="${VERCEL_GIT_COMMIT_REF:-}"
  fetch_branch "$commit_ref"

  if git rev-parse --verify "$prev" >/dev/null 2>&1; then
    classify_changed_paths "$prev" "$prev"
  fi

  echo "[ignoreCommand] previous SHA $prev not in local history; falling back to branch base"
fi

default_branch="${VERCEL_GIT_REPO_DEFAULT_BRANCH:-main}"
commit_ref="${VERCEL_GIT_COMMIT_REF:-}"

# First preview deploys for data-bot PR branches usually have no previous SHA.
# Diff against the default branch instead, matching the GitHub data-only gates.
if [ -n "$commit_ref" ] && [ "$commit_ref" != "$default_branch" ]; then
  fetch_branch "$default_branch"
  if git rev-parse --verify "origin/${default_branch}" >/dev/null 2>&1; then
    merge_base=$(git merge-base "origin/${default_branch}" HEAD 2>/dev/null || true)
    if [ -n "$merge_base" ]; then
      classify_changed_paths "$merge_base" "origin/${default_branch}...HEAD"
    fi
  fi
fi

# Last-resort main/default-branch fallback for a shallow first production deploy.
if git rev-parse --verify HEAD^ >/dev/null 2>&1; then
  classify_changed_paths "HEAD^" "HEAD^"
fi

echo "[ignoreCommand] no reliable comparison base found - building"
exit 1
