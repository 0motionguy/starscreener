// TrendingRepo — Tier List shared constants
//
// Tier swatch palette and grid defaults. The seven hexes are the canonical
// S/A/B/C/D/E/F colors; all pass WCAG-AA against #151419 with #0a0a0a label
// text. Plan: ~/.claude/plans/trendingrepo-tier-typed-hanrahan.md

export const TIER_COLORS = [
  "#FF7676", // S — red
  "#FFAA67", // A — orange
  "#FFE467", // B — yellow
  "#A6E376", // C — green
  "#6AB7FF", // D — blue
  "#B789FF", // E — purple
  "#FF8AC4", // F — pink
] as const;

export type TierColor = (typeof TIER_COLORS)[number];

export const DEFAULT_TIER_LABELS = ["S", "A", "B", "C", "D", "E", "F"] as const;

export interface DefaultTier {
  id: string;
  label: string;
  color: TierColor;
}

/** Out-of-the-box S/A/B/C/D/E/F grid for a brand-new tier list. */
export const DEFAULT_TIERS: ReadonlyArray<DefaultTier> = DEFAULT_TIER_LABELS.map(
  (label, i) => ({
    id: label,
    label,
    color: TIER_COLORS[i],
  }),
);

export const MIN_TIERS = 2;
export const MAX_TIERS = 10;
export const MAX_ITEMS_PER_TIER = 10;
export const MAX_ITEMS_TOTAL = 70;
export const MAX_TITLE_CHARS = 80;
export const MAX_DESCRIPTION_CHARS = 200;
export const MAX_LABEL_CHARS = 8;

/** Redis namespace slug — combined with `ss:data:v1:` by the data-store. */
export const TIER_LIST_KEY_PREFIX = "tier-lists";

export function tierListStoreKey(shortId: string): string {
  return `${TIER_LIST_KEY_PREFIX}:${shortId}`;
}
