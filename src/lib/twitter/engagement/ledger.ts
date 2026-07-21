// X engagement — Redis anti-spam ledger.
//
// Three durable guards, keyed on the app's shared Redis client:
//   ss:x:engaged:author:<authorId>   TTL 72h  — blocks re-replying the same author
//   ss:x:engaged:post:<postId>       TTL 30d  — dedupe: never reply a post twice
//   ss:x:engage:count:<yyyy-mm-dd>   TTL 48h  — per-UTC-day cap (default 8)
//
// FAIL CLOSED: if Redis is unavailable (client null, or any error), every gate
// denies and `remainingDailyBudget` returns 0. A reply engine that cannot
// prove it is under its caps must NOT post. This mirrors the trending-runner's
// "refuse to select without cap/cooldown state" stance.

import "server-only";

import { getDataStore } from "@/lib/data-store";
import type { RedisClientLike } from "@/lib/data-store";

const AUTHOR_PREFIX = "ss:x:engaged:author:";
const POST_PREFIX = "ss:x:engaged:post:";
const COUNT_PREFIX = "ss:x:engage:count:";

const AUTHOR_TTL_S = 72 * 60 * 60; // 72h author cooldown
const POST_TTL_S = 30 * 24 * 60 * 60; // 30d post dedupe
const COUNT_TTL_S = 48 * 60 * 60; // 48h — date-stamped key auto-expires

export const DEFAULT_DAILY_CAP = 8;

/** Anti-spam gate surface — injectable so the runner can be unit-tested. */
export interface EngagementLedger {
  canEngageAuthor(authorId: string): Promise<boolean>;
  canEngagePost(postId: string): Promise<boolean>;
  remainingDailyBudget(nowMs?: number, cap?: number): Promise<number>;
  recordEngagement(input: {
    authorId: string;
    postId: string;
    nowMs?: number;
  }): Promise<boolean>;
}

/** Daily reply cap. ENGAGE_DAILY_CAP overrides; default 8. */
export function engageDailyCap(
  env: Record<string, string | undefined> = process.env,
): number {
  const n = Number.parseInt(env.ENGAGE_DAILY_CAP ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_DAILY_CAP;
}

function utcDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function sanitize(key: string): string {
  // Author ids / post ids come from the provider — keep them Redis-key-safe.
  return key.trim().replace(/\s+/g, "_");
}

/**
 * Build a ledger over a Redis-client resolver. Production passes the shared
 * data-store client; tests pass a fake (or `() => null` to exercise the
 * fail-closed path).
 */
export function createEngagementLedger(
  getClient: () => RedisClientLike | null,
): EngagementLedger {
  async function canEngageAuthor(authorId: string): Promise<boolean> {
    const id = sanitize(authorId);
    if (!id) return false;
    const c = getClient();
    if (!c) return false;
    try {
      const hit = await c.get(`${AUTHOR_PREFIX}${id}`);
      return hit === null || hit === undefined;
    } catch {
      return false;
    }
  }

  async function canEngagePost(postId: string): Promise<boolean> {
    const id = sanitize(postId);
    if (!id) return false;
    const c = getClient();
    if (!c) return false;
    try {
      const hit = await c.get(`${POST_PREFIX}${id}`);
      return hit === null || hit === undefined;
    } catch {
      return false;
    }
  }

  async function remainingDailyBudget(
    nowMs: number = Date.now(),
    cap: number = engageDailyCap(),
  ): Promise<number> {
    const c = getClient();
    if (!c) return 0;
    try {
      const raw = await c.get(`${COUNT_PREFIX}${utcDate(nowMs)}`);
      const used =
        typeof raw === "string" ? Number.parseInt(raw, 10) : Number(raw ?? 0);
      const usedSafe = Number.isFinite(used) && used > 0 ? used : 0;
      return Math.max(0, cap - usedSafe);
    } catch {
      return 0;
    }
  }

  async function recordEngagement(input: {
    authorId: string;
    postId: string;
    nowMs?: number;
  }): Promise<boolean> {
    const c = getClient();
    if (!c) return false;
    const nowMs = input.nowMs ?? Date.now();
    const authorId = sanitize(input.authorId);
    const postId = sanitize(input.postId);
    const countKey = `${COUNT_PREFIX}${utcDate(nowMs)}`;
    try {
      if (authorId) {
        await c.set(`${AUTHOR_PREFIX}${authorId}`, "1", { ex: AUTHOR_TTL_S });
      }
      if (postId) {
        await c.set(`${POST_PREFIX}${postId}`, "1", { ex: POST_TTL_S });
      }
      // Non-atomic read-modify-write. The runner is single-threaded and posts
      // sequentially, so within a run there is no race; across runs the low
      // reply volume (cap 8/day) makes a lost increment harmless — the author +
      // post keys still block duplicates.
      const raw = await c.get(countKey);
      const used =
        typeof raw === "string" ? Number.parseInt(raw, 10) : Number(raw ?? 0);
      const next = (Number.isFinite(used) && used > 0 ? used : 0) + 1;
      await c.set(countKey, String(next), { ex: COUNT_TTL_S });
      return true;
    } catch {
      return false;
    }
  }

  return {
    canEngageAuthor,
    canEngagePost,
    remainingDailyBudget,
    recordEngagement,
  };
}

/** Resolve the shared data-store Redis client; null (fail-closed) on any error. */
function defaultGetClient(): RedisClientLike | null {
  try {
    return getDataStore().redisClient();
  } catch {
    return null;
  }
}

/** The production ledger — thin wrapper over the shared Redis client. */
export const redisEngagementLedger: EngagementLedger =
  createEngagementLedger(defaultGetClient);

// Named exports of the production gates (task API surface).
export const canEngageAuthor = redisEngagementLedger.canEngageAuthor;
export const canEngagePost = redisEngagementLedger.canEngagePost;
export const remainingDailyBudget = redisEngagementLedger.remainingDailyBudget;
export const recordEngagement = redisEngagementLedger.recordEngagement;
