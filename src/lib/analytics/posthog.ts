// PostHog capture helper backed by the official `posthog-node` SDK.
//
// Used by the pool-aware GitHub fetch paths (src/lib/github-fetch.ts and
// src/lib/pipeline/adapters/github-adapter.ts) so we get per-call
// observability on token burn-rate, status codes, and rate-limit posture.
//
// Contract:
//   - Fire-and-forget: callers `void posthogCapture(...)`. The SDK flushes
//     each event immediately so short-lived serverless invocations do not hold
//     analytics in memory.
//   - Silent no-op when no server PostHog key is set (dev / preview without
//     analytics provisioned). Warns once.
//   - Distinct ID convention: pass `distinct_id` in `properties`. Falls back
//     to "system" so the capture call is always well-formed for PostHog.
//
import { PostHog } from "posthog-node";
import { resolveServerPostHogConfig } from "./posthog-config";

let client: PostHog | null = null;
let warned = false;

function getClient(): PostHog | null {
  const { key, host } = resolveServerPostHogConfig();
  if (!key) {
    if (!warned) {
      warned = true;
      console.warn("[posthog] POSTHOG_KEY/POSTHOG_API_KEY not set; events suppressed");
    }
    return null;
  }
  if (!client) {
    client = new PostHog(key, {
      host,
      flushAt: 1,
      flushInterval: 0,
    });
  }
  return client;
}

/**
 * Fire-and-forget PostHog capture. Queues to the SDK's internal batch; never
 * throws. No-ops when no server PostHog key is set.
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
