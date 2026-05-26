// Letter-grade derivation for the repo Pulse card.
//
// Maps a 0-100 composite score onto an A/B/C/D/E single-letter grade so the
// repo-detail `PFPulseCard` can render a single dominant glyph next to the
// numeric score, matching the standalone profile mock.
//
// Buckets:
//   composite >= 90  -> "A"  // elite
//   composite >= 75  -> "B"  // hot
//   composite >= 50  -> "C"  // rising
//   composite >= 25  -> "D"  // tracked
//   composite >=  0  -> "E"  // dormant
//
// Non-numeric / negative scores fall through to "E" so the UI never shows
// a blank tile.

export function gradeFromComposite(score: number | null | undefined): string {
  if (typeof score !== "number" || !Number.isFinite(score)) return "E";
  if (score >= 90) return "A";
  if (score >= 75) return "B";
  if (score >= 50) return "C";
  if (score >= 25) return "D";
  return "E";
}
