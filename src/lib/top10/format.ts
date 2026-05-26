// Shared number formatters for the /tools/top-10 row + OG card.
// Single source of truth so the page row and the OG image can never drift on
// star precision or delta formatting (previously duplicated in
// Top10RankRow.tsx and api/og/top10/route.tsx — that drift bit us in round 1).

/** Compact stars with 1-decimal precision in the 1k-100k range. */
export function formatStars(value: number): string {
  if (value >= 100_000) return `${Math.round(value / 1000)}k`;
  if (value >= 10_000) return `${(value / 1000).toFixed(1)}k`;
  if (value >= 1_000) return `${(value / 1000).toFixed(1)}k`;
  return value.toLocaleString();
}

export type DeltaSign = "up" | "down" | "flat" | "unknown";

export interface FormattedDelta {
  text: string;
  sign: DeltaSign;
}

/** Compact delta with unicode minus, a `·` glyph for flat, and `—` for
 *  missing. Caller chooses the color from the `sign` tag. */
export function formatDelta(value: number, missing: boolean): FormattedDelta {
  if (missing) return { text: "—", sign: "unknown" };
  if (value === 0) return { text: "·", sign: "flat" };
  const sign: DeltaSign = value > 0 ? "up" : "down";
  const prefix = value > 0 ? "+" : "−";
  const abs = Math.abs(value);
  if (abs >= 1000) return { text: `${prefix}${(abs / 1000).toFixed(1)}k`, sign };
  return { text: `${prefix}${abs}`, sign };
}
