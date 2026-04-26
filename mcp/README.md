# StarScreener MCP server

A [Model Context Protocol](https://modelcontextprotocol.io) server that exposes the TrendingRepo open-source trend API to AI agents over stdio.

All tools are read-only. The server never writes back to TrendingRepo.

## Install and build

```bash
cd mcp
npm install
npm run build
```

From the repo root you can also run:

```bash
npm run mcp:build
npm run mcp:dev
```

The build output lands in `mcp/dist/server.js`.

## Environment

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `STARSCREENER_API_URL` | no | `https://trendingrepo.com` | Base URL of the TrendingRepo Next.js app. Use `http://localhost:3023` for local development. |
| `STARSCREENER_API_KEY` | no | unset | Preferred self-serve API key. Sent as `x-api-key` and used for paid MCP metering. |
| `STARSCREENER_USER_TOKEN` | no | unset | Legacy user token. Sent as `x-user-token` when no API key is set. |
| `STARSCREENER_API_TOKEN` | no | unset | Optional bearer token. Sent as `Authorization: Bearer <token>` for legacy/private deployments. |

Credentials are never logged. If no credential is set, public read tools still work, but paid usage attribution is skipped.

## Tools

### Canonical single-repo

| Name | Args | Returns |
| --- | --- | --- |
| `repo_profile_full` | `{ fullName: "owner/name" }` | Full canonical profile in one call: repo, score, reasons, mentions, freshness, social signals, npm, ProductHunt, revenue, funding, related repos, prediction, and ideas. Primary lookup for any question about a specific repo. |
| `repo_mentions_page` | `{ fullName, source?: SocialPlatform, cursor?, limit?: 1-200 }` | Paginated evidence feed beyond the first profile slice. |
| `repo_freshness` | `{ fullName }` | Per-source scanner freshness snapshot. |
| `repo_aiso` | `{ fullName }` | AISO scan status and score. Read-only; does not enqueue rescans. |

### Canonical discovery

| Name | Args | Returns |
| --- | --- | --- |
| `top_gainers` | `{ limit?: 1-50, window?: "24h"\|"7d"\|"30d", language?: string }` | Repos sorted by star delta. |
| `search_repos` | `{ query: string, limit?, category? }` | Repos matching the query, sorted by momentum. |
| `maintainer_profile` | `{ handle: string }` | Aggregate profile for a GitHub handle. |

### Legacy compatibility

| Name | Args | Returns |
| --- | --- | --- |
| `get_trending` | `{ window?: "24h"\|"7d"\|"30d", limit?: 1-100 }` | Deprecated; use `top_gainers`. |
| `get_repo` | `{ fullName: "owner/name" }` | Deprecated; use `repo_profile_full`. |
| `get_breakouts` | `{ limit?, window? }` | Breakout repos sorted by momentum. |
| `get_new_repos` | `{ limit?, window? }` | Repos under 30 days old. |
| `compare_repos` | `{ fullNames: string[2..4] }` | Side-by-side repos and winner picks. |
| `get_categories` | `{}` | Categories with repo count and average momentum. |
| `get_category_repos` | `{ categoryId, limit?, window? }` | Repos in one category. |

Every MCP result is returned as `{ content: [{ type: "text", text: "<pretty JSON>" }] }`. Parse the `text` field to use the structured data.

The three Portal-canonical tools (`top_gainers`, `search_repos`, `maintainer_profile`) are also callable over HTTP at `POST /portal/call`, so HTTP and MCP clients see the same behavior.

## Local test

In one terminal run the app:

```bash
npm run dev
```

In another, run the MCP server:

```bash
npm run mcp:build
node mcp/dist/server.js
```

It prints a banner to stderr and then speaks MCP JSON-RPC on stdin/stdout.

## Claude Desktop configuration

Local development:

```json
{
  "mcpServers": {
    "starscreener": {
      "command": "node",
      "args": ["C:/Users/mirko/OneDrive/Desktop/STARSCREENER/mcp/dist/server.js"],
      "env": {
        "STARSCREENER_API_URL": "http://localhost:3023",
        "STARSCREENER_API_KEY": "YOUR_API_KEY"
      }
    }
  }
}
```

Published npm package:

```json
{
  "mcpServers": {
    "starscreener": {
      "command": "npx",
      "args": ["-y", "starscreener-mcp"],
      "env": {
        "STARSCREENER_API_URL": "https://trendingrepo.com",
        "STARSCREENER_API_KEY": "YOUR_API_KEY"
      }
    }
  }
}
```

Restart your MCP client after changing the configuration.

## Source

Repository: <https://github.com/0motionguy/starscreener>
