// Tier-list URL-state encode/decode helpers.
//
// The Twitter share flow embeds the full tier-list payload as a base64-url
// blob in the share URL itself (`?state=…`). This lets:
//   - `/tools/tier-list?state=…` render OG meta for an unsaved draft
//   - `/tierlist/[shortId]?state=…` fall back to the embedded payload when
//     prod Redis doesn't have the shortId (the typical case for cards
//     shared from a dev environment)
//   - `/api/og/tier-list?state=…` render the PNG without any DB lookup
//
// Both consumer routes used to inline their own `decodeStateParam` helper;
// they now import this one so a single place handles malformed input,
// arrays-vs-strings from Next 15 searchParams, and the strict schema gate.

import { tierListPayloadSchema } from "@/lib/tier-list/schema";
import type { TierListPayload } from "@/lib/types/tier-list";

/**
 * Decode a `?state=<base64-url>` param into a validated tier-list payload.
 * Returns null when the param is absent, malformed, or fails schema
 * validation — callers should treat null as "no state available" and fall
 * through to whatever their default behaviour is.
 */
export function decodeStateParam(
  raw: string | string[] | undefined,
): TierListPayload | null {
  const value = pickFirst(raw);
  if (!value) return null;
  try {
    const json = Buffer.from(value, "base64").toString("utf8");
    const parsed = tierListPayloadSchema.safeParse(JSON.parse(json));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/**
 * Normalise `searchParams[key]` (which is `string | string[] | undefined`
 * in App Router) to the first usable string, or undefined when absent.
 */
export function pickFirst(
  raw: string | string[] | undefined,
): string | undefined {
  if (!raw) return undefined;
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value && value.length > 0 ? value : undefined;
}
