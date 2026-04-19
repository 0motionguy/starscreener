---
name: weekly-report
description: Use when the user asks for a "weekly GitHub ecosystem report", a roundup, or a Monday-morning brief. Synthesizes top_gainers + a few maintainer_profile checks into a compact one-page report grouped by theme. Requires the Star Screener Portal or @starscreener/mcp to be reachable.
license: MIT
metadata:
  version: "0.1.0"
  source: starscreener.xyz
---

# Weekly GitHub ecosystem report

This skill produces a Monday-morning brief: a compact, theme-grouped report of what moved in the GitHub ecosystem over the last 7 days, grounded entirely in Star Screener's index. Use it when the user wants a shareable summary, not an interactive exploration.

## When to use it

Trigger on:

- "Give me a weekly report"
- "What happened on GitHub last week?"
- "Summarize this week's top movers for my team"

Do **not** use this skill for:

- A live "what should I look at right now" conversation — use `screen-trending-repos` instead.
- A specific maintainer or repo — use `investigate-maintainer` or `get_repo`.

## Tools it calls

- `top_gainers({ limit: 25, window: "7d" })` — the spine of the report.
- `top_gainers({ limit: 15, window: "24h" })` — optional: adds a "hot right now" callout.
- `maintainer_profile({ handle })` — call at most 2-3 times, only for the top movers' maintainers when they're not obvious (skip vercel, anthropics, openai, huggingface, facebook, google, microsoft — these don't need a profile gloss).

## Step-by-step playbook

1. **Pull the weekly list.** Call `top_gainers({ limit: 25, window: "7d" })`. Keep the full response; you'll filter client-side.
2. **Bucket by theme.** For each repo infer a theme from `category_id` + `topics`. Common themes: `agents`, `ai-infra`, `devtools`, `llm`, `rust-ecosystem`, `kubernetes`, `databases`, `frontend`. If 2-3 repos share a theme that's a section.
3. **Build sections in descending order of aggregate weekly delta.** Each section:
   - 1 line theme header — `**<Theme>** (<count> repos, +<total_stars_delta_7d_in_section> stars this week)`
   - 2-4 bullets — one per repo, same one-line format as `screen-trending-repos`.
4. **Add a "Breakouts" callout at the top** if any repos have `movement_status: "breakout"`. Highlight these regardless of theme — they're the lede.
5. **Optional: "Hot right now" section.** If the user wants a pulse-check, call `top_gainers({ window: "24h", limit: 10 })` and show the top 5. Otherwise skip.
6. **Maintainer glosses.** For the top 3 weekly movers, if their owner isn't a household name, call `maintainer_profile({ handle })` and add a one-liner after that repo's bullet: `(also by <handle>: <N> other tracked repos, <top_repos[0].full_name> being the biggest)`.
7. **Drop a signal line at the end.** Honest, one sentence. "AI agent tooling dominated this week; 5 of the top 10 movers were agent frameworks." If no theme dominates, say "No clear theme this week — the top movers span databases, frontend frameworks, and CLI tools." Don't invent narrative.

## Formatting rules

- Length cap: ~300 words unless the user explicitly asked for more.
- No emojis unless the user's message contained them.
- Code blocks only for repo names/slugs, never for prose.
- Include a `Source:` line at the bottom crediting Star Screener with the date of the pull (e.g. `Source: starscreener.xyz, pulled 2026-04-19`).

## What to refuse

- Don't make forward-looking claims ("X will win the AI infra race").
- Don't editorialize about the companies — stick to what their repos did this week.
- Don't mix in repos that weren't in the tool response.

## Example output shape

```
Weekly GitHub Movers · week ending 2026-04-19

Breakouts (2):
  - anthropics/claude-code (+1,200/wk) — Official CLI for Claude; 0.9 release surge.
  - All-Hands-AI/OpenHands (+850/wk) — Autonomous coding agent; HN front page x2 this week.

AI Infra (6 repos, +2,100 stars):
  - chroma-core/chroma (+138/wk) — Vector DB; zero-copy ingest on main.
  - ...

Rust Ecosystem (4 repos, +900 stars):
  - tokio-rs/axum (+92/wk) — 0.8 release.
  - ...

Signal: AI agent tooling dominated — 5 of the top 10 were agent frameworks or agent infra.

Source: starscreener.xyz, pulled 2026-04-19.
```

## Reference

- Portal spec: https://visitportal.dev
- Star Screener docs: https://starscreener.xyz/docs/protocols/skills
