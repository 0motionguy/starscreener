// PostHog capture helper backed by the official `posthog-node` SDK so events
// are batched + flushed periodically instead of one POST per call.
//
// Used by the pool-aware GitHub fetch paths (src/lib/github-fetch.ts and
// src/lib/pipeline/adapters/github-adapter.ts) so we get per-call
// observability on token burn-rate, status codes, and rate-limit posture.
//
// Contract:
//   - Fire-and-forget: callers `void posthogCapture(...)`. The SDK queues the
//     event in memory and flushes asynchronously (every 20 events or 10s).
//   - Silent no-op when `POSTHOG_KEY` is unset (dev / preview without
//     analytics provisioned). Warns once.
//   - Distinct ID convention: pass `distinct_id` in `properties`. Falls back
//     to "system" so the capture call is always well-formed for PostHog.
//
// Endpoint: https://eu.i.posthog.com (project lives in EU region).

import { PostHog } from "posthog-node";

let client: PostHog | null = null;
let warned = false;

function getClient(): PostHog | null {
  const key = process.env.POSTHOG_KEY;
  if (!key) {
    if (!warned) {
      warned = true;
      console.warn("[posthog] POSTHOG_KEY not set; events suppressed");
    }
    return null;
  }
  if (!client) {
    client = new PostHog(key, {
      host: "https://eu.i.posthog.com",
      flushAt: 20,
      flushInterval: 10_000,
    });
  }
  return client;
}

/**
 * Fire-and-forget PostHog capture. Queues to the SDK's internal batch; never
 * throws. No-ops when `POSTHOG_KEY` is missing.
 */
export function posthogCapture(
  event: string,
  properties: Record<string, unknown>,
): void {
  const c = getClient();
  if (!c) return;
  try {
    const distinctId = String(properties.distinct_id ?? "system");
    c.capture({
      distinctId,
      event,
      properties: { ...properties, $lib: "trendingrepo-server" },
    });
  } catch {
    // analytics failure must never throw upstream
  }
}

/**
 * Flush + close the PostHog client. Call from graceful-shutdown paths so
 * queued events make it to the wire before the process exits.
 */
export async function posthogShutdown(): Promise<void> {
  if (client) {
    try {
      await client.shutdown();
    } catch {
      // shutdown failure must never throw upstream
    }
  }
}
