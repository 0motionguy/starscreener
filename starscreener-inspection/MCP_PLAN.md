# StarScreener MCP Server — P0.1 Plan

**Scope:** one-page plan for the four MCP tool contracts that ship under P0.1, plus auth model, rate-limit tiers, and the MCP Registry PR shape. **No code** — this feeds the implementation workstream.

**Current state** (verified in repo): `mcp/src/server.ts` already registers 8 read-only discovery tools (`get_trending`, `get_breakouts`, `get_new_repos`, `search_repos`, `get_repo`, `compare_repos`, `get_categories`, `get_category_repos`). P0.1 renames the customer-facing surface to four clean `starscreener.*`-prefixed tools and adds the subscribe channel the 8-trigger alert engine needs to reach agents.

---

## The 4 tool contracts

### 1. `starscreener.trending`

Top-N repos by momentum right now. Maps onto existing `get_trending` with a richer payload.

```jsonschema
{
  "name": "starscreener.trending",
  "description": "List repos with the highest current momentum score (0-100), sorted descending. Default window: 24h. Agent-native — ideal for weekly OSS-landscape summaries and competitive-intel scans.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "category":  { "type": "string", "enum": ["ai-ml","ai-agents","mcp","local-llm","dev-tools","web-frameworks","infra","backend","data","security","devops","databases","crypto-web3","other","all"], "default": "all" },
      "window":    { "type": "string", "enum": ["1h","6h","24h","7d","30d"], "default": "24h" },
      "limit":     { "type": "integer", "minimum": 1, "maximum": 100, "default": 20 },
      "min_stars": { "type": "integer", "minimum": 0, "default": 0 }
    }
  },
  "outputSchema": {
    "type": "object",
    "properties": {
      "as_of":  { "type": "string", "format": "date-time" },
      "window": { "type": "string" },
      "items":  {
        "type": "array",
        "items": {
          "type": "object",
          "required": ["fullName","stars","momentum","movementStatus","category","delta"],
          "properties": {
            "fullName":       { "type": "string" },
            "stars":          { "type": "integer" },
            "momentum":       { "type": "number", "minimum": 0, "maximum": 100 },
            "movementStatus": { "type": "string", "enum": ["hot","rising","steady","cooling","breakout"] },
            "category":       { "type": "string" },
            "delta":          { "type": "object", "properties": { "stars_24h": {"type":"integer"}, "stars_7d": {"type":"integer"} } },
            "reasons":        { "type": "array", "items": { "type": "string" } },
            "url":            { "type": "string", "format": "uri" }
          }
        }
      }
    }
  }
}
```

### 2. `starscreener.emerging`

Low-star high-velocity candidates — the "before they're trending" surface. New synthesis over `get_new_repos` + velocity filter. This is the unique value proposition — no competitor ships this agent-exposed.

```jsonschema
{
  "name": "starscreener.emerging",
  "description": "Repos under a star ceiling (default 1000) with exceptional short-window velocity. The 'about to blow up' feed — use for early-mover alerts and next-week-predictions.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "category":      { "type": "string", "default": "ai-agents" },
      "max_stars":     { "type": "integer", "minimum": 0, "maximum": 10000, "default": 1000 },
      "min_velocity":  { "type": "number", "description": "Min stars/day over last 7 days", "default": 5 },
      "min_age_days":  { "type": "integer", "description": "Floor to filter out 1-day hype", "default": 14 },
      "limit":         { "type": "integer", "minimum": 1, "maximum": 50, "default": 10 }
    }
  },
  "outputSchema": {
    "type": "object",
    "properties": {
      "as_of": { "type": "string", "format": "date-time" },
      "items": {
        "type": "array",
        "items": {
          "type": "object",
          "required": ["fullName","stars","velocity_per_day","momentum","first_seen_at"],
          "properties": {
            "fullName":          { "type": "string" },
            "stars":             { "type": "integer" },
            "velocity_per_day":  { "type": "number" },
            "momentum":          { "type": "number" },
            "first_seen_at":     { "type": "string", "format": "date-time" },
            "reasons":           { "type": "array", "items": { "type": "string" } }
          }
        }
      }
    }
  }
}
```

### 3. `starscreener.repo_signal`

Full signal bundle for a single repo. Maps onto existing `get_repo` with added score breakdown + reason codes.

```jsonschema
{
  "name": "starscreener.repo_signal",
  "description": "Full momentum signal for a single repo. Returns the 10-component score breakdown, recent delta history, and active reason codes. Use to justify a recommendation with cited signal evidence.",
  "inputSchema": {
    "type": "object",
    "required": ["repo"],
    "properties": {
      "repo": { "type": "string", "pattern": "^[^/]+/[^/]+$", "description": "owner/name" }
    }
  },
  "outputSchema": {
    "type": "object",
    "required": ["fullName","stars","momentum","components","movementStatus","reasons"],
    "properties": {
      "fullName":       { "type": "string" },
      "stars":          { "type": "integer" },
      "forks":          { "type": "integer" },
      "momentum":       { "type": "number" },
      "movementStatus": { "type": "string" },
      "category":       { "type": "string" },
      "components": {
        "type": "object",
        "properties": {
          "starVelocityScore":       { "type": "number" },
          "forkVelocityScore":       { "type": "number" },
          "contributorGrowthPct":    { "type": "number" },
          "freshness":               { "type": "number" },
          "releaseSignal":           { "type": "number" },
          "issueActivity":           { "type": "number" },
          "commitFreshness":         { "type": "number" },
          "socialBuzzScore":         { "type": "number" },
          "categoryMomentum":        { "type": "number" },
          "rankMomentum":            { "type": "number" }
        }
      },
      "modifiers": {
        "type": "object",
        "properties": {
          "decayFactor":          { "type": "number" },
          "antiSpamDampening":    { "type": "number" },
          "breakoutMultiplier":   { "type": "number" },
          "quietKillerBonus":     { "type": "number" }
        }
      },
      "reasons":  { "type": "array", "items": { "type": "object", "required": ["code","label"], "properties": { "code": {"type":"string"}, "label": {"type":"string"} } } },
      "delta":    { "type": "object", "properties": { "stars_24h": {"type":"integer"}, "stars_7d": {"type":"integer"}, "stars_30d": {"type":"integer"} } },
      "sparkline":{ "type": "array", "items": { "type": "object", "properties": { "ts": {"type":"string"}, "stars": {"type":"integer"} } } }
    }
  }
}
```

### 4. `starscreener.subscribe` — the moat tool

Subscribe an agent to a filter and receive `alert_triggered` events as MCP resource updates. Backs onto the existing 8-trigger alert engine (already shipped in `src/lib/pipeline/alerts/engine.ts`) — this tool only adds the MCP-side delivery pipe.

```jsonschema
{
  "name": "starscreener.subscribe",
  "description": "Subscribe to future trend events matching a filter. Returns a subscription_id that the MCP client uses to receive push notifications of breakout, rank_jump, or new-release events. Requires an API key.",
  "inputSchema": {
    "type": "object",
    "required": ["triggers"],
    "properties": {
      "triggers": {
        "type": "array",
        "minItems": 1,
        "items": { "type": "string", "enum": ["star_spike","new_release","rank_jump","discussion_spike","momentum_threshold","breakout_detected","daily_digest","weekly_digest"] }
      },
      "category": { "type": "string" },
      "repo":     { "type": "string", "pattern": "^[^/]+/[^/]+$" },
      "threshold":         { "type": "number" },
      "cooldown_minutes":  { "type": "integer", "minimum": 5, "maximum": 1440, "default": 60 }
    }
  },
  "outputSchema": {
    "type": "object",
    "required": ["subscription_id","delivery_transport","events_resource_uri"],
    "properties": {
      "subscription_id":     { "type": "string" },
      "delivery_transport":  { "type": "string", "enum": ["mcp-resource","sse","webhook"], "default": "mcp-resource" },
      "events_resource_uri": { "type": "string", "description": "mcp resource URI the client subscribes to — e.g. starscreener://alerts/sub_abc123" },
      "expires_at":          { "type": "string", "format": "date-time", "description": "TTL on a subscription; refresh via re-subscribe" }
    }
  }
}
```

**Why `mcp-resource` as default transport:** MCP natively supports resource subscriptions with push updates (the spec's Resources + `resource_list_changed` notification pattern). An agent calls `starscreener.subscribe`, gets back a resource URI, then subscribes to that resource via the standard MCP `resources/subscribe` RPC. Every `alert_triggered` event on the pipeline side maps to a resource update on the subscribed URI. No new transport invented — we lean on what the MCP spec already ships.

---

## Auth model

| Tool | Auth | Rationale |
|------|------|-----------|
| `starscreener.trending`    | Anonymous | Read-only, low cost, drives MCP registry discoverability. |
| `starscreener.emerging`    | Anonymous | Same. |
| `starscreener.repo_signal` | Anonymous | Same. Single-repo query — O(1) cost. |
| `starscreener.subscribe`   | **API key (Bearer)** | Stateful — we need to identify the subscriber for delivery routing + rate-limit accounting. Anonymous subscribe is a DDoS vector. |

### API key shape

- Header: `Authorization: Bearer ss_live_<32-hex>`
- Keys issued from the web dashboard at `/account/api-keys` (future — stub today with one-off key generation via `pipeline.issueApiKey(userId)`)
- Stored hashed (bcrypt or argon2) in a new `.data/api-keys.jsonl` (migrate to Postgres with P1.5 source-swapper)
- Revocable from the same UI; revocation is immediate (in-memory invalidation + JSONL rewrite)

## Rate-limit tiers

| Tier | Requests/hr | Subscriptions | Identifier |
|------|-------------|---------------|------------|
| Anonymous       | 60/hr (IP) | — (no subscribe) | `X-Real-IP` behind Railway |
| Keyed — free    | 1,000/hr (key) | 5 concurrent | `sub:` prefix on the key-hash |
| Keyed — paid    | 10,000/hr | 50 concurrent | Future — not in P0.1 |

**Limits are enforced at the MCP server edge**, not on the Next.js REST surface (that keeps the MCP rate-limit logic local to `mcp/src/`). Implementation: in-memory token bucket per key/IP keyed in a `Map<string, TokenBucket>`; persistence is not required (bucket resets on restart are acceptable at this volume).

**Headers surfaced to the client on every response:**
- `X-RateLimit-Limit: 1000`
- `X-RateLimit-Remaining: 987`
- `X-RateLimit-Reset: 1712345678`

## How the existing server maps to the new surface

Keep the current 8 tools registered (backwards compatibility for anyone already using the MCP server). Register the 4 new `starscreener.*` tools alongside. Document the 4 as preferred and the 8 as deprecated in `mcp/README.md`. Remove the 8 after 1 full release cycle (Prompt 3 era).

Internal dispatch:
- `starscreener.trending`    → existing `get_trending` logic + enrich payload
- `starscreener.emerging`    → new composition: `get_new_repos` + velocity filter + age floor
- `starscreener.repo_signal` → existing `get_repo` + `get_score_breakdown` merge
- `starscreener.subscribe`   → **new** — calls `pipeline.createAlertRule()` (already implemented at `src/lib/pipeline/alerts/engine.ts`), then maps the returned rule-id onto an MCP resource URI and binds the in-process `alert_triggered` EventEmitter to resource-update notifications

## MCP Registry PR shape

**Target:** `github.com/modelcontextprotocol/servers` (the official community server registry)

**Flow:**
1. Fork the repo to the StarScreener GitHub org.
2. Branch: `add-starscreener-mcp-server`.
3. Edit `README.md` → add an entry under the relevant section (currently "🎖️ Community" or equivalent — confirm exact section header at PR time).
4. Entry format follows the existing table rows:

```markdown
- **[StarScreener](https://github.com/0motionguy/starscreener)** — Agent-native momentum signals for rising GitHub repos. Tools: `starscreener.trending`, `starscreener.emerging`, `starscreener.repo_signal`, `starscreener.subscribe`. Transport: SSE. Read-only discovery is anonymous; subscribe requires an API key.
```

5. PR body should:
   - Explain the product in ≤3 sentences
   - Link to the 4 tool contracts (this file or a published docs page)
   - Show 1 example conversation (agent calls `starscreener.emerging` → gets 10 candidates → calls `starscreener.repo_signal` on top match → subscribes for breakout on that repo)
   - Confirm the server is deployed and reachable at the advertised URL
6. After merge: the server appears in any MCP client's registry browser (Claude Desktop, Continue.dev, Cline, etc.).

**Parallel registrations to do in the same sprint:**
- **Smithery** (`smithery.ai`) — third-party MCP discovery surface. Similar PR-style add.
- **Anthropic's Claude Desktop docs** — if they add a "featured community servers" list, request inclusion.
- **pulse MCP** and **mcp.so** — secondary registries for breadth.

## Success metrics (Prompt 2 exit criteria for this workstream)

- [ ] All 4 `starscreener.*` tools registered and passing the MCP Inspector spec-compliance check.
- [ ] First `alert_triggered` event successfully delivered over MCP resource-update to a test Claude Desktop agent within 48h of merge.
- [ ] Paperclip fleet agent (Andy or Sentinel) configured as the first production subscriber with a real rule.
- [ ] MCP Registry PR merged into `modelcontextprotocol/servers`.
- [ ] One representative example conversation published in `mcp/README.md` showing discovery → signal lookup → subscribe → push-delivered alert.

## Non-goals in P0.1

- Paid tier, billing, Stripe, usage-based metering.
- OAuth or external auth provider integration (API-key-only in v1).
- Subscription-level filters beyond category + repo + trigger (e.g., "notify only between 9am-5pm PT" is v2).
- MCP prompts or resources beyond the subscription-update channel (no prompt templates, no exposed REST-as-resources surface).
