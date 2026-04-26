# MCP integration

Star Screener ships an MCP server that exposes the live trend index as typed tools for Claude Desktop, Claude Code, Cursor, and any other agent that speaks the [Model Context Protocol](https://modelcontextprotocol.io).

Package: [`starscreener-mcp`](../../mcp/) | SDK pin: `@modelcontextprotocol/sdk@^1.0.4`

## Try it in 60 seconds

```bash
# 1. Build the server.
npm run mcp:build

# 2. Run the MCP Inspector to inspect schemas.
npx @modelcontextprotocol/inspector node mcp/dist/server.js

# 3. Or wire into Claude Desktop.
#    macOS:   ~/Library/Application Support/Claude/claude_desktop_config.json
#    Windows: %APPDATA%\Claude\claude_desktop_config.json
```

```json
{
  "mcpServers": {
    "starscreener": {
      "command": "node",
      "args": ["C:/absolute/path/to/starscreener/mcp/dist/server.js"],
      "env": {
        "STARSCREENER_API_URL": "https://trendingrepo.com",
        "STARSCREENER_API_KEY": "YOUR_API_KEY"
      }
    }
  }
}
```

For local development, set `STARSCREENER_API_URL` to `http://localhost:3023`.

## Tools

Full list in [mcp/README.md](../../mcp/README.md). The canonical three match the Portal manifest:

- `top_gainers({ limit?, window?, language? })`
- `search_repos({ query, limit?, category? })`
- `maintainer_profile({ handle })`

Legacy tools are kept for backwards compatibility: `get_trending` (deprecated; prefer `top_gainers`), `get_breakouts`, `get_new_repos`, `get_repo`, `compare_repos`, `get_categories`, `get_category_repos`.

## Transport

Stdio only in v0.1. The MCP streamable-HTTP transport is a later deployment option; for now stdio covers Claude Desktop and Claude Code.

## Drift-free guarantee

The three canonical tools in MCP route through HTTP to `POST /portal/call` (see [mcp/src/portal-client.ts](../../mcp/src/portal-client.ts)), which in turn calls into the shared [src/tools/](../../src/tools/) module. The same handlers back Portal visitors. An identical request returns an identical response regardless of whether the caller is using MCP or Portal.

The legacy tools call existing REST routes directly. They share the same underlying pipeline, but the wire shapes differ. New agents should use the Portal-canonical shape.

## Auth and metering

Set `STARSCREENER_API_KEY` for paid MCP usage attribution. The server sends it as `x-api-key`. `STARSCREENER_USER_TOKEN` remains supported for older installs.

## Security notes

Every tool response is prefixed with an `UNTRUSTED_CONTENT_NOTICE` so consuming LLMs know that string fields in `repo.description`, `repo.topics`, and `mention.content` are attacker-controlled and should be treated as data, not instructions. See [mcp/src/server.ts](../../mcp/src/server.ts) for the notice text.

## Publishing

The package is publish-ready but held behind a human gate. Before `npm publish`:

1. `cd mcp && npm publish --dry-run` - confirm the tarball only includes `dist/**`, `README.md`, `package.json`.
2. Review tool descriptions for accuracy.
3. Confirm the `starscreener-mcp` npm name is claimable.
4. `npm publish`.

Upgrade path: change MCP tool params or shapes only behind a new tool name. Renaming or removing existing tools breaks installed users.
