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
| `STARSCREENER_API_URL`    | no       | `http://localhost:3004`   | Base URL of the StarScreener Next.js app. |
| `STARSCREENER_API_TOKEN`  | no       | —                         | Sent as `Authorization: Bearer <token>` when set. Reserved for future auth; the public REST endpoints don't require it today. |

The StarScreener Next.js dev server must be reachable at that URL for the tools to return data.

## Tools

| Name                 | Args                                                                                    | Returns                                                           |
| -------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `get_trending`       | `{ window?: "24h"\|"7d"\|"30d", limit?: 1-100 }`                                        | `{ repos: Repo[], meta }` sorted by momentum                      |
| `get_breakouts`      | `{ limit?, window? }`                                                                   | Breakout repos sorted by momentum                                 |
| `get_new_repos`      | `{ limit?, window? }`                                                                   | Repos under 30 days old                                           |
| `search_repos`       | `{ query: string, limit?, category? }`                                                  | `{ results: Repo[], meta }`                                       |
| `get_repo`           | `{ fullName: "owner/name" }`                                                            | Full detail incl. sparkline, score, reasons, social, related      |
| `compare_repos`      | `{ fullNames: string[2..4] }`                                                           | Side-by-side repos + winner picks                                 |
| `get_categories`     | `{}`                                                                                    | Categories with repoCount + avgMomentum                           |
| `get_category_repos` | `{ categoryId, limit?, window? }`                                                       | Repos in one category                                             |

Every result is `{ content: [{ type: "text", text: "<pretty JSON>" }] }`. Parse the `text` field to get the structured data.

## Local test

In one terminal run the StarScreener app:

```bash
npm run dev   # serves on http://localhost:3004 per current config
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
        "STARSCREENER_API_URL": "http://localhost:3004"
      }
    }
  }
}
```

Restart Claude Desktop. The eight tools above should appear in the tool picker.

## Claude Code / other MCP clients

Any MCP-compatible client that supports stdio transport works the same way — point it at `node /absolute/path/to/mcp/dist/server.js` and set `STARSCREENER_API_URL` in its env.
