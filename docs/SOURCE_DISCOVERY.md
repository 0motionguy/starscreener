# Source Discovery

How TrendingRepo decides what to watch on Bluesky and DEV when hunting for AI-dev momentum.

## Why this exists

Reddit has obvious channel boundaries: subreddits.

Bluesky and DEV do not work the same way:

- Bluesky is best treated as `search + feeds + lists + starter packs`, not one fixed "AI channel".
- DEV is best treated as `tags + rising/fresh + popularity-ranked feeds`.

That means we need curated watcher registries per source instead of a single hard-coded keyword list.

## Current registry

Source of truth: [`scripts/_source-watchers.mjs`](../scripts/_source-watchers.mjs)

### Bluesky

We track AI-dev **query families**, currently covering:

- AI agents
- LLMs
- Coding agents
- MCP
- RAG / retrieval
- Workflow / automation
- Context / prompts / memory
- Skills
- Open source AI

Why query families instead of one list:

- Bluesky search supports advanced operators like `lang:`, `from:`, `mentions:`, `domain:`, `since:` and `until:`.
- Bluesky's own product direction treats discovery as feed-centric; their January 26, 2026 post says custom feeds power trending topics.
- For full-fidelity monitoring, Jetstream / firehose is the long-term path, but query-family search is the pragmatic current watcher layer.

### DEV

We track **discovery slices**, currently combining:

- global `top=7`
- global `state=rising`
- global `state=fresh`
- curated AI/dev tags such as `ai`, `agents`, `agentic`, `claudecode`, `claude`, `codex`, `cursor`, `llm`, `llms`, `mcp`, `rag`, `promptengineering`, `workflow`, `workflows`, `automation`, `cli`, `tooling`, `devtools`, `langchain`, `n8n`, `opensource`

Why slices instead of just `tag=ai`:

- DEV's API returns published articles ordered by descending popularity by default.
- Tag-filtered article queries are also popularity-ranked.
- DEV exposes `state=fresh` and `state=rising`, which catch things popularity-only windows can miss.
- DEV's `/api/tags` is popularity-ordered, so tags behave like the closest thing DEV has to channels.

## Cross-mention coverage

Repo-level cross-source mention coverage already includes:

- Reddit
- Hacker News
- Bluesky
- DEV
- Product Hunt

Primary code paths:

- cross-signal scoring: [`src/lib/pipeline/cross-signal.ts`](../src/lib/pipeline/cross-signal.ts)
- repo detail mention feed: [`src/app/repo/[owner]/[name]/page.tsx`](../src/app/repo/[owner]/[name]/page.tsx)
- mention markers on repo charts: [`src/components/repo-detail/MentionMarkers.tsx`](../src/components/repo-detail/MentionMarkers.tsx)

## External references

- Bluesky search operators: https://bsky.social/about/blog/05-31-2024-search
- Bluesky roadmap note on custom feeds powering trending topics: https://bsky.social/about/blog/01-26-2026-whats-next-at-bluesky
- Bluesky Jetstream intro: https://docs.bsky.app/blog/jetstream
- Forem / DEV API docs: https://developers.forem.com/api/v1
- DEV tag moderation + aliasing notes: https://dev.to/tag-moderation
