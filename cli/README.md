# starscreener-cli (`ss`)

Read-only terminal client for the [StarScreener](https://github.com/Kermit457/STARSCREENER) GitHub trend API. Native Node 18+, no external dependencies.

## Install

```bash
npm install -g starscreener-cli
```

Or run without installing:

```bash
npx starscreener-cli trending
```

## Configure

Point the CLI at a running StarScreener backend via env var:

```bash
export STARSCREENER_API_URL="http://localhost:3004"   # default
```

If not set, it falls back to `http://localhost:3004`.

## Commands

| Command      | Description                                                 |
| ------------ | ----------------------------------------------------------- |
| `ss trending [--window=24h\|7d\|30d] [--limit=20] [--json]` | Top movers for a time window. Default: 7d. |
| `ss breakouts [--limit=20] [--json]`                        | Repos currently flagged as breakouts.       |
| `ss new [--limit=20] [--json]`                              | Repos created in the last 30 days.          |
| `ss search <query> [--limit=10] [--json]`                   | Full-text search over name / desc / topics. |
| `ss repo <owner/name> [--json]`                             | Detailed view of one repo.                  |
| `ss compare <owner/name> <owner/name> [...] [--json]`       | Side-by-side comparison.                    |
| `ss categories [--json]`                                    | List categories with repoCount + avg momentum. |
| `ss stream [--types=...]`                                   | Tail live SSE event stream (Ctrl+C stops).  |
| `ss help`                                                   | Show full help.                              |
| `ss --version`                                              | Print CLI version.                           |

## Examples

```bash
ss trending --window=24h --limit=10
ss search "rust database" --limit=5
ss repo vercel/next.js
ss compare vercel/next.js ollama/ollama
ss trending --json | jq '.repos[].fullName'
```

## Related

- [`starscreener-mcp`](https://www.npmjs.com/package/starscreener-mcp) — MCP server exposing the same API to AI agents.

## License

MIT
