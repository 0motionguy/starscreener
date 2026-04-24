# StarScreener MCP server

A [Model Context Protocol](https://modelcontextprotocol.io) server that exposes the StarScreener live-GitHub-trend REST API to AI agents over stdio.

All tools are **read-only** — the server never writes back to StarScreener.

## Install and build

```bash
cd mcp
npm install
npm run build
```

From the repo root you can also run:

```bash
npm run mcp:build   # installs deps + builds
npm run mcp:dev     # runs via tsx without building
```

The build output lands in `mcp/dist/server.js`.

## Environment

| Variable                  | Required | Default                   | Notes                                     |
| ------------------------- | -------- | ------------------------- | ----------------------------------------- |
| `STARSCREENER_API_URL`    | no       | `http://localhost:3023`   | Base URL of the StarScreener Next.js app. |
| `STARSCREENER_API_TOKEN`  | no       | —                         | Sent as `Authorization: Bearer <token>` when set. Reserved for future auth; the public REST endpoints don't require it today. |

The StarScreener Next.js dev server must be reachable at that URL for the tools to return data.

## Tools

### Canonical single-repo (wave-4 `/api/repos/[o]/[n]?v=2` stack)

| Name                 | Args                                                                                   | Returns                                                           |
| -------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `repo_profile_full`  | `{ fullName: "owner/name" }`                                                           | Full canonical profile in one call: repo, score, reasons, mentions (first-50 slice + `nextCursor`), freshness, twitter, npm (packages + 30d daily downloads + dependents), productHunt, revenue (verified / self-reported / trustmrr claim), funding, related, prediction, ideas. **Primary lookup for any question about a specific repo.** |
| `repo_mentions_page` | `{ fullName, source?: SocialPlatform, cursor?, limit?: 1-200 }`                        | Paginated evidence feed — walks beyond the 50-row profile slice. `{ ok, fetchedAt, repo, count, nextCursor, items }`. |
| `repo_freshness`     | `{ fullName }`                                                                         | Per-source scanner freshness `{ ok, fetchedAt, sources }`. Global snapshot + 404 when repo is unknown. |
| `repo_aiso`          | `{ fullName }`                                                                         | AISO (AI discoverability) scan status: `scanned` \| `queued` \| `rate_limited` \| `failed` \| `none`, with score, tier, dimensions, engine citations. Read-only — does not enqueue rescans. |

### Canonical discovery (also exposed via Portal v0.1 at `/portal`)

| Name                 | Args                                                                                   | Returns                                                           |
| -------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `top_gainers`        | `{ limit?: 1-50, window?: "24h"\|"7d"\|"30d", language?: string }`                     | `{ window, count, repos: RepoCard[] }` sorted by star delta       |
| `search_repos`       | `{ query: string, limit?, category? }`                                                 | Repos matching the query, sorted by momentum                      |
| `maintainer_profile` | `{ handle: string }`                                                                   | Aggregate profile for a GitHub handle (repos where owner == handle) |

### Legacy (kept for backwards compatibility)

| Name                 | Args                                                                                    | Returns                                                           |
| -------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `get_trending`       | `{ window?: "24h"\|"7d"\|"30d", limit?: 1-100 }`                                        | **Deprecated — use `top_gainers`.** `{ repos: Repo[], meta }`      |
| `get_repo`           | `{ fullName: "owner/name" }`                                                            | **Deprecated — use `repo_profile_full`.** Legacy v1 shape; a strict subset of the canonical profile. |
| `get_breakouts`      | `{ limit?, window? }`                                                                   | Breakout repos sorted by momentum                                 |
| `get_new_repos`      | `{ limit?, window? }`                                                                   | Repos under 30 days old                                           |
| `compare_repos`      | `{ fullNames: string[2..4] }`                                                           | Side-by-side repos + winner picks                                 |
| `get_categories`     | `{}`                                                                                    | Categories with repoCount + avgMomentum                           |
| `get_category_repos` | `{ categoryId, limit?, window? }`                                                       | Repos in one category                                             |

Every result is `{ content: [{ type: "text", text: "<pretty JSON>" }] }`. Parse the `text` field to get the structured data.

The three Portal-canonical tools (`top_gainers`, `search_repos`, `maintainer_profile`) are also callable over HTTP at `POST /portal/call` per the Portal v0.1 spec, so a drive-by LLM visitor sees identical behaviour to an installed MCP client.

## Local test

In one terminal run the StarScreener app:

```bash
npm run dev   # serves on http://localhost:3023
```

In another, run the MCP server directly:

```bash
node mcp/dist/server.js
```

It will print a banner to stderr and then speak MCP JSON-RPC on stdin/stdout.

## Claude Desktop configuration

Add an entry to `claude_desktop_config.json`:

**macOS** — `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows** — `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "starscreener": {
      "command": "node",
      "args": ["C:/Users/mirko/OneDrive/Desktop/STARSCREENER/mcp/dist/server.js"],
      "env": {
        "STARSCREENER_API_URL": "http://localhost:3023"
      }
    }
  }
}
```

Alternatively, once published to npm (see Phase 8 in the repo plan), you can use:

```json
{
  "mcpServers": {
    "starscreener": {
      "command": "npx",
      "args": ["-y", "starscreener-mcp"],
      "env": {
        "STARSCREENER_API_URL": "https://starscreener.xyz"
      }
    }
  }
}
```

Restart Claude Desktop. All tools above should appear in the tool picker.

## Claude Code / other MCP clients

Any MCP-compatible client that supports stdio transport works the same way — point it at `node /absolute/path/to/mcp/dist/server.js` and set `STARSCREENER_API_URL` in its env.
