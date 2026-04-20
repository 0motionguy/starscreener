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
  /** Max number of bubbles. Default 120. */
  limit?: number;
}

const MAP_WIDTH = 1200;
const MAP_HEIGHT = 360;
const MIN_RADIUS = 14;
const MAX_RADIUS = 82;

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

export function BubbleMap({ repos, limit = 120 }: BubbleMapProps) {
  const candidates = repos
    .filter((r) => r.starsDelta24h > 0)
    .sort((a, b) => b.starsDelta24h - a.starsDelta24h)
    .slice(0, limit);

  if (candidates.length === 0) {
    return null;
  }

  const maxDelta = candidates[0].starsDelta24h;
  const packed = packBubbles(
    candidates.map((r) => ({ id: r.id, value: r.starsDelta24h })),
    {
      width: MAP_WIDTH,
      height: MAP_HEIGHT,
      minRadius: MIN_RADIUS,
      maxRadius: MAX_RADIUS,
      padding: 2,
      fillRatio: 0.82,
    },
  );

  const byId = new Map(candidates.map((r) => [r.id, r]));
  const seeds: BubbleSeed[] = packed
    .map((p) => {
      const repo = byId.get(p.id);
      if (!repo) return null;
      const tint = greenTintFor(repo.starsDelta24h, maxDelta);
      return {
        id: p.id,
        cx: p.cx,
        cy: p.cy,
        r: p.r,
        delta: repo.starsDelta24h,
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
