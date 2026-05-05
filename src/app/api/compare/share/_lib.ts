// /api/compare/share — extracted constants + persistence helper.
//
// Lives in a sibling module (not route.ts) because Next.js 15's app-router
// type validator forbids non-route exports from route.ts files. Tests import
// from here directly; route.ts also imports from here for runtime use.

import type { DataStore } from "@/lib/data-store";

export const COMPARE_SHARE_KEY_PREFIX = "compare-share";
export const COMPARE_SHARE_MAX_REQUESTS = 30;
export const COMPARE_SHARE_WINDOW_MS = 60 * 60 * 1000;
export const COMPARE_SHARE_TTL_SECONDS = 30 * 24 * 60 * 60;

export function compareShareKey(shortId: string): string {
  return `${COMPARE_SHARE_KEY_PREFIX}/${shortId}`;
}

export interface CompareSharePayloadShape {
  shortId: string;
  createdAt: string;
  // Caller passes whatever Zod-validated shape it has; the store accepts
  // unknown payloads.
  [key: string]: unknown;
}

export async function persistCompareSharePayload(
  store: DataStore,
  payload: CompareSharePayloadShape,
): Promise<void> {
  await store.write(compareShareKey(payload.shortId), payload, {
    ttlSeconds: COMPARE_SHARE_TTL_SECONDS,
  });
}
