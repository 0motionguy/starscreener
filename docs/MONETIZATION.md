# Monetization

StarScreener uses a file-backed MVP for commercial state and Stripe for billing.

## API keys

- `POST /api/keys` creates a key for the authenticated caller.
- `GET /api/keys` lists the caller's keys without exposing token hashes.
- `DELETE /api/keys/{id}` revokes a key.
- Clients authenticate with `x-api-key: sskey_...`.
- Data API endpoints (`/api/data/repos`, `/api/data/snapshot`) require API-key,
  user-token, or session auth and apply tier-aware rate limits.

Keys are stored in `.data/api-keys.jsonl` as SHA-256 hashes. The raw token is
returned only once at creation time.

## Stripe billing

- `POST /api/checkout/stripe` starts hosted Stripe Checkout for Pro or Team.
- `POST /api/webhooks/stripe` verifies Stripe signatures and writes the user
  tier to `.data/user-tiers.jsonl`.
- `STRIPE_PRO_*_PRICE_ID` and `STRIPE_TEAM_*_PRICE_ID` map Stripe prices to
  local tiers.

The Stripe SDK is pinned to the package's latest typed API version in
`src/lib/stripe/client.ts`.

## Usage metering

Every MCP tool call records a local row in `.data/mcp-usage.jsonl`. If
`STRIPE_MCP_METER_EVENT_NAME` is configured and the user has a Stripe customer
id from checkout, the same call is reported to Stripe Billing Meter Events with:

```json
{
  "stripe_customer_id": "cus_...",
  "value": "1",
  "user_id": "u_..."
}
```

Local usage reporting remains best-effort; a Stripe outage must not fail the
underlying MCP request.

## Webhooks

Operator-managed targets in `data/webhook-targets.json` still work without an
owner. Self-serve paid targets should set `ownerUserId`; enqueueing then checks
the shared `webhooks.create` entitlement before adding delivery rows.

## Status

Humans can use `/status`. Monitors should use:

- `/api/health?soft=1`
- `/api/health/sources`
- `/api/health/portal`
- `/api/pipeline/status`
