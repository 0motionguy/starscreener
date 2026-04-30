// TrendingRepo — Tier List URL state encoder/decoder
//
// Compact, lossless serialisation of an editor draft to query params so that
// pasting any /tierlist URL reproduces the exact layout AND the exact OG card.
//
// Format:
//   ?title=<urlencoded>
//   &tiers=S|S|FF7676|vercel%2Fnext.js,remix-run%2Fremix;A|A|FFAA67|...
//          ^id ^label ^color(no #)         ^csv repoIds (encoded)
//   &pool=foo%2Fbar,baz%2Fqux
//   &v=<8-char-hash>
//
// Tier rows separated by ";". Within a row, "|" separates id/label/color/items.
// Items are URL-encoded individually so a "/" in a repo ID stays disambiguated
// from the tier-row separator.

import {
  DEFAULT_TIERS,
  type TierColor,
  TIER_COLORS,
} from "@/lib/tier-list/constants";
import type { TierListDraft, TierRow } from "@/lib/types/tier-list";

const TIER_SEP = ";";
const FIELD_SEP = "|";
const ITEM_SEP = ",";

function isTierColor(value: string): value is TierColor {
  return (TIER_COLORS as readonly string[]).includes(value);
}

function encodeTier(tier: TierRow): string {
  const colorHex = tier.color.replace(/^#/, "");
  const items = tier.items.map(encodeURIComponent).join(ITEM_SEP);
  return [
    encodeURIComponent(tier.id),
    encodeURIComponent(tier.label),
    colorHex,
    items,
  ].join(FIELD_SEP);
}

function decodeTier(raw: string): TierRow | null {
  const parts = raw.split(FIELD_SEP);
  if (parts.length < 3) return null;
  const [idRaw, labelRaw, colorRaw, itemsRaw = ""] = parts;
  const colorWithHash = `#${colorRaw.toUpperCase()}`;
  if (!isTierColor(colorWithHash)) return null;
  const items = itemsRaw
    ? itemsRaw.split(ITEM_SEP).map((s) => safeDecode(s)).filter(Boolean)
    : [];
  return {
    id: safeDecode(idRaw) || "tier",
    label: safeDecode(labelRaw) || "?",
    color: colorWithHash,
    items: items as string[],
  };
}

function safeDecode(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return "";
  }
}

export interface EncodableDraft {
  title: string;
  tiers: TierRow[];
  unrankedItems: string[];
}

/** Serialise an editor draft into URLSearchParams. */
export function encodeTierListUrl(draft: EncodableDraft): URLSearchParams {
  const params = new URLSearchParams();
  params.set("title", draft.title);
  params.set("tiers", draft.tiers.map(encodeTier).join(TIER_SEP));
  params.set("pool", draft.unrankedItems.map(encodeURIComponent).join(ITEM_SEP));
  params.set("v", stateHash(draft));
  return params;
}

/** Parse URL params back into a draft. Falls back to an empty default grid. */
export function decodeTierListUrl(
  params: URLSearchParams,
): EncodableDraft {
  const title = params.get("title") ?? "Untitled tier list";
  const tiersParam = params.get("tiers") ?? "";
  const poolParam = params.get("pool") ?? "";

  const decodedTiers = tiersParam
    ? tiersParam
        .split(TIER_SEP)
        .map(decodeTier)
        .filter((t): t is TierRow => t !== null)
    : [];

  const tiers: TierRow[] =
    decodedTiers.length > 0
      ? decodedTiers
      : DEFAULT_TIERS.map((t) => ({ ...t, items: [] }));

  const unrankedItems = poolParam
    ? poolParam.split(ITEM_SEP).map(safeDecode).filter(Boolean)
    : [];

  return { title, tiers, unrankedItems };
}

/**
 * Stable 8-char marker of the canonical state. Used as `?v=…` cache-buster
 * on the OG endpoint — any edit flips it, invalidating CDN + X's OG cache.
 *
 * We use a pure-JS FNV-1a 32-bit hash (no crypto) so both the client
 * ShareBar and the server route produce the same string. Node's
 * `crypto.createHash` would crash in the browser bundle (Turbopack stubs
 * `crypto` to an empty module). Cryptographic strength is not required
 * here — we only need determinism and avalanche-on-edit.
 */
export function stateHash(draft: EncodableDraft): string {
  const canonical = JSON.stringify({
    title: draft.title,
    tiers: draft.tiers.map((t) => ({
      id: t.id,
      label: t.label,
      color: t.color,
      items: [...t.items],
    })),
    unranked: [...draft.unrankedItems],
  });
  // FNV-1a 32-bit, twice with different offsets — gives 64 bits → 8 hex
  // pairs. Same algorithm runs in browser + Node.
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < canonical.length; i++) {
    const c = canonical.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193);
    h2 = Math.imul(h2 ^ c, 0x811c9dc5);
  }
  const hex = (n: number) => (n >>> 0).toString(16).padStart(8, "0");
  return (hex(h1) + hex(h2)).slice(0, 8);
}

/** Convenience: build a fully-formed `/tierlist?…` URL from a draft. */
export function buildTierListShareUrl(
  baseUrl: string,
  draft: EncodableDraft,
): string {
  const params = encodeTierListUrl(draft);
  return `${baseUrl}/tierlist?${params.toString()}`;
}

/** Drop the canonical fields from a saved payload back to the editor shape. */
export function payloadToDraft(payload: {
  title: string;
  tiers: TierRow[];
  unrankedItems: string[];
}): EncodableDraft {
  return {
    title: payload.title,
    tiers: payload.tiers,
    unrankedItems: payload.unrankedItems,
  };
}

/** Re-export so the editor doesn't import constants for the draft default. */
export function emptyDraft(): EncodableDraft {
  return {
    title: `Tier list · ${new Date().toISOString().slice(0, 10)}`,
    tiers: DEFAULT_TIERS.map((t) => ({ ...t, items: [] })),
    unrankedItems: [],
  };
}

/** Tier-list draft satisfies the wider TierListDraft type. */
export type _TierListDraftCheck = TierListDraft;
