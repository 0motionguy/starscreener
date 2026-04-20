// Lightweight 2D circle packing for the trending BubbleMap.
//
// Deliberately tiny (~80 LOC) — we don't need d3-hierarchy's full API.
// Strategy: sort by radius desc, place each circle via a gentle
// Archimedean spiral starting from the canvas center, accept the first
// non-overlapping position that fits inside the bounds. Good enough for
// 40-60 bubbles at 60fps server render.

export interface PackInput {
  id: string;
  value: number; // bubble weight (e.g. starsDelta24h). Larger → bigger bubble.
}

export interface PackResult {
  id: string;
  r: number;
  cx: number;
  cy: number;
}

export interface PackOptions {
  width: number;
  height: number;
  /** Minimum bubble radius in px. Default 22 — room for a 12-char repo label. */
  minRadius?: number;
  /** Maximum bubble radius in px. Default 96. */
  maxRadius?: number;
  /** Gap between neighboring bubbles in px. Default 3. */
  padding?: number;
  /** How aggressively to fill canvas area. 0-1. Default 0.72. */
  fillRatio?: number;
}

export function packBubbles(
  inputs: PackInput[],
  opts: PackOptions,
): PackResult[] {
  const {
    width,
    height,
    minRadius = 22,
    maxRadius = 96,
    padding = 3,
    fillRatio = 0.72,
  } = opts;

  if (inputs.length === 0) return [];

  // Scale: sqrt-scale value → radius. Target total circle area ≈ fillRatio *
  // canvas area so the pack feels dense without bursting the edges.
  const rawArea = width * height * fillRatio;
  const weights = inputs.map((i) => Math.max(i.value, 1));
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const areaPerUnit = rawArea / totalWeight;
  const radiusFor = (v: number) => {
    const r = Math.sqrt((Math.max(v, 1) * areaPerUnit) / Math.PI);
    return Math.min(maxRadius, Math.max(minRadius, r));
  };

  // Sort desc by weight so the largest lands closest to the canvas center.
  const sorted = inputs
    .map((i) => ({ ...i, r: radiusFor(i.value) }))
    .sort((a, b) => b.r - a.r);

  const placed: PackResult[] = [];
  const cx0 = width / 2;
  const cy0 = height / 2;

  for (const item of sorted) {
    const r = item.r;

    // First pass: try center for the first bubble.
    if (placed.length === 0) {
      placed.push({ id: item.id, r, cx: cx0, cy: cy0 });
      continue;
    }

    // Archimedean spiral: angle step small, radial step scales with r so we
    // don't probe thousands of points for the big bubbles.
    const step = 0.35;
    const radialStep = Math.max(2, r * 0.15);
    let found = false;

    for (let i = 1; i < 6000 && !found; i++) {
      const angle = i * step;
      const dist = radialStep * Math.sqrt(i) * 0.7;
      const cx = cx0 + Math.cos(angle) * dist;
      const cy = cy0 + Math.sin(angle) * dist;

      // Bounds check — keep a tiny margin so strokes don't clip.
      if (
        cx - r < 1 ||
        cx + r > width - 1 ||
        cy - r < 1 ||
        cy + r > height - 1
      ) {
        continue;
      }

      // Overlap check.
      let ok = true;
      for (const p of placed) {
        const dx = cx - p.cx;
        const dy = cy - p.cy;
        const min = r + p.r + padding;
        if (dx * dx + dy * dy < min * min) {
          ok = false;
          break;
        }
      }
      if (ok) {
        placed.push({ id: item.id, r, cx, cy });
        found = true;
      }
    }

    // If we exhausted the spiral without finding a home, drop the bubble
    // rather than overlap. With fillRatio ≤ 0.75 and ≤ 60 bubbles this
    // branch is effectively unreachable on real data.
  }

  return placed;
}
