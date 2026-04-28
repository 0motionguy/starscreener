# Portal v0.1 integration

TrendingRepo speaks the [Portal v0.1 protocol](https://visitportal.dev) so any LLM client with a Portal visitor SDK can discover and call TrendingRepo's tools without installation.

## Try it in 60 seconds

```bash
# 1. Fetch the manifest.
curl -s https://trendingrepo.com/portal | jq '.portal_version, .tools[].name'

# 2. Call a tool.
curl -s -X POST https://trendingrepo.com/portal/call \
  -H 'Content-Type: application/json' \
  -d '{"tool":"top_gainers","params":{"limit":3,"window":"7d"}}' | jq .

# 3. Call with a language filter.
curl -s -X POST https://trendingrepo.com/portal/call \
  -H 'Content-Type: application/json' \
  -d '{"tool":"top_gainers","params":{"language":"Rust","limit":5}}' | jq .

# 4. Maintainer lookup.
curl -s -X POST https://trendingrepo.com/portal/call \
  -H 'Content-Type: application/json' \
  -d '{"tool":"maintainer_profile","params":{"handle":"anthropics"}}' | jq .
```

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/portal` | v0.1 manifest. `Cache-Control: public, max-age=60`, CORS `*`. |
| `POST` | `/portal/call` | Dispatch `{ tool, params }`, returns envelope. CORS echoes Origin. |
| `GET` | `/api/health/portal` | Liveness probe — returns 200 iff the in-process manifest validates. |

## Tools

| Name | Params | Returns |
|---|---|---|
| `top_gainers` | `{ limit?: 1-50, window?: "24h"\|"7d"\|"30d", language?: string }` | `{ window, count, repos: RepoCard[] }` |
| `search_repos` | `{ query: string, limit?: 1-50 }` | `{ query, count, repos: RepoCard[] }` |
| `maintainer_profile` | `{ handle: string }` | `MaintainerProfileMinimal` |

`RepoCard`: `{ full_name, owner, name, description, url, language, stars, stars_delta_24h, stars_delta_7d, stars_delta_30d, momentum_score, movement_status, category_id, topics }`.

`MaintainerProfileMinimal`: `{ handle, repo_count, total_stars, total_stars_delta_7d, languages, category_ids, top_repos, scope_note }`.

## Envelope shapes

**Success:**
```json
{ "ok": true, "result": { ... } }
```

**Error:**
```json
{ "ok": false, "error": "human-readable message", "code": "NOT_FOUND" }
```

`code` is one of: `NOT_FOUND`, `INVALID_PARAMS`, `UNAUTHORIZED`, `RATE_LIMITED`, `INTERNAL`.

All handled errors return HTTP 200 with the envelope; rate-limit breaches return HTTP 429 with the envelope plus a `Retry-After` header.

## Rate limits

- **Unauthenticated**: 10 req/min per IP (token bucket).
- **With `X-API-Key` header**: 1000 req/min per key.
- Only `/portal/*` paths are metered — the existing `/api/*` surface is untouched.

Rate-limit state is per Vercel serverless instance (in-memory `Map`), so a burst across cold-started instances can exceed the advertised ceiling. This is documented as acceptable for v0.1 and will migrate to Upstash in v0.2.

## Running conformance locally

The upstream spec ships a conformance runner. From this repo:

```bash
# 1. Start the dev server.
npm run dev                                       # http://localhost:3023

# 2. Run the upstream runner (requires visitportal.dev checked out).
npm run portal:conformance                        # or:
tsx C:/Users/mirko/OneDrive/Desktop/visitportal.dev/packages/spec/conformance/runner.ts \
    http://localhost:3023/portal
```

Expected: `{ manifestOk: true, notFoundOk: true }`.

## Schema + validator source of truth

- Manifest schema: [src/portal/schema/manifest-v0.1.0.json](../../src/portal/schema/manifest-v0.1.0.json) — vendored verbatim from `visitportal.dev/packages/spec/manifest.schema.json` at commit `98ec8d9`.
- Runtime validator: [src/portal/validate.ts](../../src/portal/validate.ts) — TypeScript port of the upstream dependency-free `lean-validator.ts`.
- Re-sync procedure: [src/portal/schema/README.md](../../src/portal/schema/README.md).

## Drift-free guarantee

All three Portal tools are backed by pure functions in [src/tools/](../../src/tools/). The MCP server's `top_gainers` / `maintainer_profile` tools POST to this same `/portal/call` endpoint, so an identical request returns an identical response regardless of transport.
