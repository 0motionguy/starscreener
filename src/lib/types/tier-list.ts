// TrendingRepo — Tier List payload types
//
// Authoritative shape for everything that gets written to Redis under
// `ss:data:v1:tier-lists:{shortId}`. The Zod schema in
// `src/lib/tier-list/schema.ts` validates this shape at the API boundary.

import type { TierColor } from "@/lib/tier-list/constants";

export type { TierColor };

export interface TierRow {
  /** Stable id — defaults to the label (S/A/B/...) but persists across renames. */
  id: string;
  /** Display label (≤ 8 chars). */
  label: string;
  /** One of the seven preset hex codes. */
  color: TierColor;
  /** Repo full names ("vercel/next.js"), order preserved. */
  items: string[];
}

export interface TierListPayload {
  /** 8-char Crockford base32. */
  shortId: string;
  title: string;
  description?: string;
  tiers: TierRow[];
  /** Repo full names not yet placed in any tier. */
  unrankedItems: string[];
  /** Twitter/X handle of the author, no leading "@". `null` for anonymous. */
  ownerHandle: string | null;
  createdAt: string;
  updatedAt: string;
  viewCount: number;
  /** When true, eligible for the (future) /tierlist/community index. */
  published: boolean;
}

/** Minimum-viable shape POSTed by the editor (server fills the rest). */
export type TierListDraft = Pick<
  TierListPayload,
  "title" | "tiers" | "unrankedItems"
> & {
  description?: string;
  ownerHandle?: string | null;
  published?: boolean;
};
