---
name: investigate-maintainer
description: Use when the user wants to understand what a specific GitHub maintainer is up to — "who is this person/org", "what else have they shipped", "which of their repos are moving right now". Produces a one-page profile with their owned repos ranked by momentum. Requires the Star Screener Portal or @starscreener/mcp to be reachable.
license: MIT
metadata:
  version: "0.1.0"
  source: starscreener.xyz
---

# Investigate a GitHub maintainer

This skill walks through a single handle (e.g. `anthropics`, `vercel`, `All-Hands-AI`) and produces a compact "what are they shipping" brief grounded in Star Screener's index. It is intentionally narrow: it does NOT attempt to summarize the maintainer's whole GitHub presence, only what Star Screener already tracks.

## When to use it

Trigger on questions like:

- "What's `anthropics` been shipping lately?"
- "Tell me about `All-Hands-AI` — what's their top repo?"
- "Who's behind `openhands` and what else do they have?"

Do **not** use this skill for:

- A general GitHub profile lookup — Star Screener's index is curated, not exhaustive.
- A single repo deep-dive — use `get_repo` from `@starscreener/mcp` or the `screen-trending-repos` skill.

## Tools it calls

1. **`maintainer_profile({ handle })`** — primary. Returns `{ handle, repo_count, total_stars, total_stars_delta_7d, languages, category_ids, top_repos, scope_note }`.
2. **`search_repos({ query: "<handle>" })`** — fallback only. Use when `maintainer_profile` returns `NOT_FOUND`; the handle may have repos tracked under a different owner string (e.g. rename) or be a topic mentioned across multiple repos.
3. **`top_gainers({ limit: 30 })`** — optional. Use to cross-reference whether any of the maintainer's top repos also appear in the week's overall movers, which reinforces signal.

## Step-by-step playbook

1. **Normalize the handle.** GitHub usernames are case-insensitive; Star Screener's data preserves canonical casing. Pass the handle as the user wrote it; the tool normalizes internally.
2. **Call `maintainer_profile`.**
   - On success: jump to step 4.
   - On `NOT_FOUND`: jump to step 3 (fallback).
   - On `INVALID_PARAMS`: the handle didn't match GitHub's username rules. Tell the user the exact reason from the error envelope.
3. **Fallback search.** Call `search_repos({ query: "<handle>" })` to see if any indexed repos mention the handle. If zero hits, tell the user: "Star Screener's index has no repos owned by or referencing `<handle>`. The index is curated, not comprehensive — the maintainer may still be active on GitHub but isn't in our trending set." Stop here.
4. **Digest the profile.** Check `scope_note` and pass its gist along so the user knows we're reporting from the curated index, not live GitHub. Present in this order:
   - One-line summary: `<handle> — <repo_count> tracked repos, <total_stars> total stars, +<total_stars_delta_7d> this week.`
   - Language mix (the `languages` array), sorted desc by repo count — report the top 3.
   - Focus areas (the `category_ids` array) — translate to human-readable names if obvious (e.g. `agents`, `rust-ecosystem`, `devtools`).
   - Top repos — iterate `top_repos` (up to 5). Format each as: `name (<stars>, +<stars_delta_7d>/wk) — one-sentence take from description + topics`.
5. **Optional cross-reference.** If the user asked "what's hot", call `top_gainers({ limit: 30 })` and mention any of the maintainer's repos that appear in the top 30 movers this week. Don't call this if the user didn't ask — it's extra latency.
6. **Close with a signal note.** One honest sentence: "3 of their 4 tracked repos are gaining this week" or "They're steady — no breakouts, but consistent 7d positive delta across the board" or "Only 1 tracked repo is active; the others are archived."

## What to refuse

- Do **not** invent facts about the maintainer's intent, employment, or personal life. Stick to what the tool returned.
- Do **not** claim the profile is exhaustive. The `scope_note` field is there so downstream agents know the limits; pass its gist along.
- If the maintainer has zero owned repos in the index, say so. Don't pad with unrelated mentions from `search_repos` just to have something to report.

## Example output shape

```
anthropics — 4 tracked repos, 12,400 total stars, +850 this week.
Languages: TypeScript, Python
Focus: agents, sdks

Top repos:
  1. anthropics/claude-code (5,000★, +200/wk) — Official CLI for Claude; agent tooling.
  2. anthropics/anthropic-sdk-python (3,000★, +50/wk) — Python SDK with streaming + tool use.
  3. anthropics/anthropic-sdk-typescript (2,800★, +600/wk) — JS/TS SDK; surge this week from a new release.
  ...

Signal: 3 of 4 tracked repos gaining; the TS SDK had the biggest jump, likely tied to their release.

(Scope: derived from repos Star Screener indexes where owner == "anthropics". The maintainer may have
other repos on GitHub that aren't in the index.)
```

## Reference

- Portal spec: https://visitportal.dev
- Star Screener docs: https://starscreener.xyz/docs/protocols/portal
