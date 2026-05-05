---
last-verified: 2026-05-05
verified-by: claude
status: living
---

# STARSCREENER (trendingrepo.com)

Real-time trend-discovery scanner. Aggregates GitHub, Twitter, Reddit,
Hacker News, Bluesky, ProductHunt, Dev.to, Lobsters, arXiv, and npm
signals and surfaces breakout repos before they go mainstream.

Live at: https://trendingrepo.com

## Quick start

```
npm install   # Node 22.x
npm run dev   # Turbopack on port 3023
```

Required env vars (see `.env.example`):

- `GITHUB_TOKEN` -- for GitHub API
- `CRON_SECRET` -- for cron auth
- One of: `REDIS_URL` (Railway) OR `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` (Upstash)

## Tech stack

- Next.js 15 (App Router, Turbopack, RSC + client islands)
- TypeScript 5 strict
- React 19, Tailwind 4, Recharts, Framer Motion, Zustand
- Redis (`ioredis` or Upstash REST) as primary store
- Supabase (worker-only, see [ADR 0004](docs/decisions/0004-redis-primary-worker-only-supabase.md)) for analytics
- Stripe for payments (configured, not yet billed)
- Vercel for the app, Railway for the worker, GitHub Actions for crons

## Where to go

- **Operators** -> [`docs/OPERATOR.md`](docs/OPERATOR.md)
- **Architecture** -> [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- **Doc index** -> [`docs/INDEX.md`](docs/INDEX.md)
- **Engine map** (workflows / crons / keys) -> [`docs/ENGINE.md`](docs/ENGINE.md)
- **Site wire-map** (route -> data -> collector) -> [`docs/SITE-WIREMAP.md`](docs/SITE-WIREMAP.md)
- **Decisions / ADRs** -> [`docs/decisions/`](docs/decisions/)
- **Agent instructions** -> [`CLAUDE.md`](CLAUDE.md) (Claude Code) or [`AGENTS.md`](AGENTS.md) (Cursor / Codex)

## Common tasks

| Task | Command |
|---|---|
| Run dev server | `npm run dev` |
| Type-check | `npm run typecheck` |
| Lint | `npm run lint` |
| All tests | `npm test` |
| Doc-freshness check | `npm run freshness:docs` |
| All guards | `npm run lint:guards` |
| Engine inventory regen | `npm run engine:derive` |
| Trigger Twitter collector | `gh workflow run collect-twitter.yml` |

## Repo health

Refreshed every wave (last: 2026-05-05).

- 88 GH Actions workflows, 14 cron API routes, 44 active worker fetchers
- 0 inline Redis-key violations (`npm run lint:redis-keys`)
- 0 frontmatter violations (`npm run lint:doc-frontmatter`)
- Re-derive with `npm run engine:derive`; see [`docs/_generated/engine.md`](docs/_generated/engine.md) for the auto-derived digest

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md). The TL;DR: every commit runs
`eslint --fix --max-warnings=0` plus `scripts/check-redis-keys.mjs` via
husky + lint-staged. Markdown changes pass through the frontmatter +
internal-link guards. New workflows must be documented in
[`docs/ENGINE.md`](docs/ENGINE.md) (PR-gated).

## License

MIT -- see [`LICENSE`](LICENSE).
