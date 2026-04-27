# starscreener-cli (`ss`)

Read-only terminal client for the [TrendingRepo](https://trendingrepo.com) open-source trend API. Native Node 18+, no external dependencies.

## Install

```bash
npm install -g starscreener-cli
```

Or run without installing:

```bash
npx starscreener-cli trending
```

## Configure

By default, the CLI talks to the live API:

```bash
ss trending --window=24h --limit=10
```

For local development, point it at your Next.js server:

```bash
export STARSCREENER_API_URL="http://localhost:3023"
```

Optional auth:

| Variable | Purpose |
| --- | --- |
| `STARSCREENER_API_KEY` | Preferred self-serve API key. Sent as `x-api-key`. |
| `STARSCREENER_USER_TOKEN` | Legacy per-user token. Sent as `x-user-token` when no API key is set. |

## Commands

| Command | Description |
| --- | --- |
| `ss trending [--window=24h\|7d\|30d] [--limit=20] [--json]` | Top movers for a time window. Default: 7d. |
| `ss breakouts [--limit=20] [--json]` | Repos currently flagged as breakouts. |
| `ss new [--limit=20] [--json]` | Repos created in the last 30 days. |
| `ss search <query> [--limit=10] [--json]` | Full-text search over name, description, and topics. |
| `ss repo <owner/name> [--json]` | Detailed view of one repo. |
| `ss compare <owner/name> <owner/name> [...] [--json]` | Side-by-side comparison. |
| `ss categories [--json]` | List categories with repo count and average momentum. |
| `ss status [--json]` | Check API health. |
| `ss stream [--types=...]` | Tail the live SSE event stream. |
| `ss help` | Show full help. |
| `ss --version` | Print CLI version. |

## Examples

```bash
ss trending --window=24h --limit=10
ss search "rust database" --limit=5
ss repo vercel/next.js
ss compare vercel/next.js ollama/ollama
ss status
ss trending --json | jq '.repos[].fullName'
```

## Related

- [`starscreener-mcp`](https://www.npmjs.com/package/starscreener-mcp) - MCP server exposing the same API to AI agents.
- Source repository: <https://github.com/0motionguy/starscreener>

## License

MIT
