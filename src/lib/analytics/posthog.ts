// Lightweight PostHog capture helper — POSTs directly to the EU capture
// endpoint without pulling in `posthog-node` or any other SDK.
//
// Used by the pool-aware GitHub fetch paths (src/lib/github-fetch.ts and
// src/lib/pipeline/adapters/github-adapter.ts) so we get per-call
// observability on token burn-rate, status codes, and rate-limit posture.
//
// Contract:
//   - Fire-and-forget: callers should `void posthogCapture(...)` so a slow
//     PostHog ingest never blocks a hot fetch path.
//   - Silent no-op when `POSTHOG_KEY` is unset (dev / preview without
//     analytics provisioned).
//   - Swallows ALL errors — analytics failure must never surface to users.
//
// Distinct ID convention: pass `distinct_id` in `properties` to identify
// the entity being tracked (e.g. "github-pool"). Falls back to "system"
// so the capture call is always well-formed for PostHog.
//
// Endpoint: https://eu.i.posthog.com/capture/ (project lives in EU region).

const POSTHOG_CAPTURE_URL = "https://eu.i.posthog.com/capture/";

/**
 * Fire-and-forget PostHog `/capture/` POST. Returns a resolved promise even
 * on network failure so callers can `void` it without unhandled-rejection
 * noise. No-ops when `POSTHOG_KEY` is missing.
 */
export async function posthogCapture(
  event: string,
  properties: Record<string, unknown>,
): Promise<void> {
  const key = process.env.POSTHOG_KEY;
  if (!key) return;
  try {
    await fetch(POSTHOG_CAPTURE_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        api_key: key,
        event,
        distinct_id: properties.distinct_id ?? "system",
        properties: { ...properties, $lib: "trendingrepo-server" },
        timestamp: new Date().toISOString(),
      }),
    });
  } catch {
    // fire-and-forget; analytics failure must never throw upstream
  }
}
