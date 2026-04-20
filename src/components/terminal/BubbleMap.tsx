// Coin360-style LIVE bubble map for 24h repo momentum.
//
// Server component that computes the initial circle-pack positions,
// then delegates rendering + physics to a client sibling
// (BubbleMapCanvas). The server-side pack is used purely as a
// deterministic starting layout so the SSR HTML matches first client
// paint — no flash-of-recalculated-layout on hydration. Once the
// client takes over, bubbles float, repel each other, and can be
// dragged.
//
// Visual spec:
//   - 120 top 24h-movers by starsDelta24h
//   - Circle area ∝ log-scaled delta
//   - Green intensity ramps with delta magnitude
//   - Owner avatar + repo short-name + `+NNN` per bubble (auto-hide on small)

import type { Repo } from "@/lib/types";
import { packBubbles } from "@/lib/bubble-pack";
import { BubbleMapCanvas, type BubbleSeed } from "./BubbleMapCanvas";

interface BubbleMapProps {
  repos: Repo[];
  /** Max number of bubbles. Default 220. */
  limit?: number;
}

const MAP_WIDTH = 1200;
const MAP_HEIGHT = 360;
const MIN_RADIUS = 11;
const MAX_RADIUS = 76;

/**
 * Effective daily star velocity. The 24h bucket only covers ~100 of 681
 * tracked repos, so using `starsDelta24h` alone leaves the map sparse.
 * For repos without a 24h entry we fall through to 7d/7 then 30d/30 so
 * every positive-movement repo gets represented at a fair relative
 * magnitude.
 *
 * Floor of 0.1 for anything with a positive raw window so the bubble
 * still places (minRadius). Otherwise a repo with `d7d=1` would round
 * to 0 and get filtered.
 */
function effectiveDailyDelta(r: Repo): number {
  const d24 = r.starsDelta24h ?? 0;
  const d7 = r.starsDelta7d ?? 0;
  const d30 = r.starsDelta30d ?? 0;
  const rawBest = Math.max(d24, d7 / 7, d30 / 30);
  if (rawBest <= 0) {
    // Still represent if any single window is positive, just at the floor.
    if (d24 > 0 || d7 > 0 || d30 > 0) return 0.1;
    return 0;
  }
  return Math.max(rawBest, 0.1);
}

/**
 * Pick the label to display inside the bubble. Prefer the 24h number when
 * it's positive (most timely), else 7d, else 30d — so the user sees a
 * real delta instead of "+0".
 */
function displayDeltaFor(r: Repo): { value: number; window: "24h" | "7d" | "30d" } {
  if (r.starsDelta24h > 0) return { value: r.starsDelta24h, window: "24h" };
  if (r.starsDelta7d > 0) return { value: r.starsDelta7d, window: "7d" };
  if (r.starsDelta30d > 0) return { value: r.starsDelta30d, window: "30d" };
  return { value: 0, window: "24h" };
}

function greenTintFor(delta: number, maxDelta: number): {
  fill: string;
  stroke: string;
  glow: string;
  text: string;
} {
  const logDelta = Math.log10(Math.max(delta, 1));
  const logMax = Math.log10(Math.max(maxDelta, 1));
  const t = logMax > 0 ? Math.min(1, logDelta / logMax) : 0;

  const lerp = (a: number, b: number) => Math.round(a + (b - a) * t);
  const r = lerp(28, 22);
  const g = lerp(68, 197);
  const b = lerp(54, 94);

  const fill = `rgb(${r}, ${g}, ${b})`;
  const strokeAlpha = 0.38 + t * 0.42;
  const stroke = `rgba(${Math.min(255, r + 36)}, ${Math.min(255, g + 44)}, ${Math.min(255, b + 22)}, ${strokeAlpha.toFixed(2)})`;
  const glow = `rgba(34, 197, 94, ${(0.07 + t * 0.32).toFixed(2)})`;
  const text = t > 0.35 ? "#0e1410" : "#dcf5e1";
  return { fill, stroke, glow, text };
}

export function BubbleMap({ repos, limit = 220 }: BubbleMapProps) {
  // Include every repo with ANY positive window signal. Ranked by the
  // effective daily velocity so the 24h movers still land at the center.
  const candidates = repos
    .map((r) => ({ repo: r, weight: effectiveDailyDelta(r) }))
    .filter((x) => x.weight > 0)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, limit);

  if (candidates.length === 0) {
    return null;
  }

  const maxWeight = candidates[0].weight;
  const packed = packBubbles(
    candidates.map((x) => ({ id: x.repo.id, value: x.weight })),
    {
      width: MAP_WIDTH,
      height: MAP_HEIGHT,
      minRadius: MIN_RADIUS,
      maxRadius: MAX_RADIUS,
      padding: 1.5,
      fillRatio: 0.88,
    },
  );

  const byId = new Map(candidates.map((x) => [x.repo.id, x]));
  const seeds: BubbleSeed[] = packed
    .map((p) => {
      const hit = byId.get(p.id);
      if (!hit) return null;
      const repo = hit.repo;
      const tint = greenTintFor(hit.weight, maxWeight);
      const disp = displayDeltaFor(repo);
      return {
        id: p.id,
        cx: p.cx,
        cy: p.cy,
        r: p.r,
        delta: disp.value,
        deltaWindow: disp.window,
        fullName: repo.fullName,
        name: repo.name,
        owner: repo.owner,
        avatarUrl: repo.ownerAvatarUrl,
        fill: tint.fill,
        stroke: tint.stroke,
        glow: tint.glow,
        textColor: tint.text,
      };
    })
    .filter((b): b is BubbleSeed => b !== null);

  return (
    <BubbleMapCanvas
      seeds={seeds}
      width={MAP_WIDTH}
      height={MAP_HEIGHT}
    />
  );
}
