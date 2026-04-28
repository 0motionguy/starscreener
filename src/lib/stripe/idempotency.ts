// Cross-instance idempotency lock for Stripe webhook events.
//
// Replaces the in-memory `Set<string>` in `events.ts:PROCESSED_EVENT_IDS`
// which only protected within a single Lambda. Vercel cold-starts and
// concurrent instances both broke that guarantee, so the same `event.id`
// could be processed multiple times across the fleet.
//
// Now: Redis SETNX with a 24h TTL. First instance to claim the key wins
// and runs the handler; replays return the no-op `skipReason: "duplicate"`
// shape that the route already understands.
//
// Fallback: when Redis is disabled (DATA_STORE_DISABLE=1, or neither
// Upstash nor REDIS_URL configured), we let the event through. The
// in-memory Set in events.ts still catches duplicates inside the same
// instance, and Stripe's HMAC sig verification means duplicates from
// outside the org can't get this far. Better to retry than to miss.

import type { RedisClientLike } from "@/lib/data-store";

const NAMESPACE = "ss:stripe:event:";
/** 24h covers Stripe's documented retry window with margin. */
const TTL_SECONDS = 24 * 60 * 60;

/**
 * Atomically claim an event id. Returns true if this caller is the first
 * to see the id (proceed with handler), false if the id was already locked
 * by a previous call (skip — we already processed it on another instance).
 */
export async function acquireStripeEventLock(
  redis: RedisClientLike | null,
  eventId: string,
): Promise<boolean> {
  if (!redis) return true; // No Redis — fall back to in-memory in events.ts.
  if (!eventId) return true; // Defensive — shouldn't happen post sig verify.
  try {
    const result = await redis.set(`${NAMESPACE}${eventId}`, "1", {
      ex: TTL_SECONDS,
      nx: true,
    });
    // SET NX returns "OK" on success and null when the key existed.
    // ioredis returns the literal string "OK"; Upstash returns "OK" too.
    // Anything that isn't a positive acquisition is treated as duplicate.
    return result === "OK";
  } catch (err) {
    // Redis transport blip: log but allow the event through. Stripe will
    // not retry our 200 anyway, and the in-memory Set in events.ts is
    // the second line of defense within the same Lambda.
    console.warn(
      "[stripe] idempotency Redis lock failed, allowing event through:",
      (err as Error).message,
    );
    return true;
  }
}
