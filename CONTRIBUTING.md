# Contributing

Thanks for improving TrendingRepo. The repo contains the web app, REST API, CLI, MCP server, data pipeline, and docs.

## Development

```bash
npm install
npm run dev
```

Common checks:

```bash
npm run lint
npm run typecheck
npm run build
```

For the MCP package:

```bash
npm run mcp:build
```

For the CLI:

```bash
node bin/ss.mjs help
STARSCREENER_API_URL=http://localhost:3023 node bin/ss.mjs status
```

## Pull requests

- Keep changes focused.
- Update docs when behavior, environment variables, API contracts, CLI commands, or MCP tools change.
- Add or update targeted tests for behavior changes.
- Do not commit generated secrets, local `.env*` files, or unrelated formatting churn.

## Data and external services

Some pipeline jobs depend on third-party APIs and scheduled workflows. Prefer small, repeatable fixtures or targeted smoke checks when changing ingestion logic.
