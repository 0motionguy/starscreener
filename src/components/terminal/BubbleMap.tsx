// Coin360-style LIVE bubble map for repo momentum.
//
// Server component that computes initial circle-pack positions for all
// three windows (24h / 7d / 30d) and hands them to the client
// BubbleMapCanvas. The canvas owns the tab state + physics + drag.
//
// Visual spec:
//   - Up to 220 movers per window
//   - Bubble color = categoryId tint (vivid for big movers,
//     muted for small ones) so AI / MCP / DevTools / etc. read at a
//     glance
//   - Owner avatar + repo short-name + `+NNN` per bubble

import type { Repo } from "@/lib/types";
import { CATEGORIES } from "@/lib/constants";
import { packBubbles } from "@/lib/bubble-pack";
import {
  BubbleMapCanvas,
  type BubbleSeed,
  type WindowKey,
  type WindowSeedSet,
} from "./BubbleMapCanvas";

interface BubbleMapProps {
  repos: Repo[];
  /** Max bubbles per window. Default 220. */
  limit?: number;
}

const MAP_WIDTH = 1200;
const MAP_HEIGHT = 360;
const MIN_RADIUS = 11;
const MAX_RADIUS = 76;

/**
 * Category IDs considered "AI-native". These repos get a weight boost in the
 * bubble pack so the map skews AI-first by default, and they're the set the
 * client-side "AI" toggle filters to.
 */
const AI_CATEGORY_IDS = new Set<string>([
  "ai-ml",
  "ai-agents",
  "mcp",
  "local-llm",
]);

/** Multiplier applied to the pack weight of any AI-category repo. */
const AI_WEIGHT_BOOST = 1.8;

const CATEGORY_COLOR: Map<string, string> = new Map(
  CATEGORIES.map((c) => [c.id, c.color]),
);
const FALLBACK_COLOR = "#22c55e"; // green for uncategorised / "other"

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

/** Map relative intensity (0-1) + category color → fill / stroke / glow / text. */
function tintForCategory(
  categoryId: string,
  intensity: number,
): {
  fill: string;
  stroke: string;
  glow: string;
  text: string;
} {
  const hex = CATEGORY_COLOR.get(categoryId) ?? FALLBACK_COLOR;
  const { r, g, b } = hexToRgb(hex);

  // Low-intensity bubbles: darken 45%. High-intensity: punch straight
  // through at full saturation. Smooth lerp between.
  const t = Math.max(0.15, Math.min(1, intensity));
  const darken = (c: number) => Math.round(c * (0.45 + t * 0.55));

  const fr = darken(r);
  const fg = darken(g);
  const fb = darken(b);

  // Stroke is the full-brightness version at 40-80% alpha.
  const strokeAlpha = (0.4 + t * 0.4).toFixed(2);
  const stroke = `rgba(${r}, ${g}, ${b}, ${strokeAlpha})`;

  // Halo is the brand-color at low alpha.
  const glow = `rgba(${r}, ${g}, ${b}, ${(0.08 + t * 0.3).toFixed(2)})`;

  // Pick text color for contrast against the fill. Luminance threshold.
  const luminance = (fr * 299 + fg * 587 + fb * 114) / 1000;
  const text = luminance > 130 ? "#0d121a" : "#f3f6fb";

  return {
    fill: `rgb(${fr}, ${fg}, ${fb})`,
    stroke,
    glow,
    text,
  };
}

function seedsForWindow(
  repos: Repo[],
  window: WindowKey,
  limit: number,
): BubbleSeed[] {
  const deltaOf =
    window === "24h"
      ? (r: Repo) => r.starsDelta24h
      : window === "7d"
        ? (r: Repo) => r.starsDelta7d
        : (r: Repo) => r.starsDelta30d;

  // Pack weight = raw window delta, but AI-category repos get a 1.8× boost
  // so they skew toward the center and dominate the pack. The `rawDelta`
  // field preserves the honest window delta for the bubble label so the
  // user still sees the true number.
  const candidates = repos
    .map((r) => {
      const rawDelta = deltaOf(r);
      const weight = AI_CATEGORY_IDS.has(r.categoryId)
        ? rawDelta * AI_WEIGHT_BOOST
        : rawDelta;
      return { repo: r, weight, rawDelta };
    })
    .filter((x) => x.rawDelta > 0)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, limit);

  if (candidates.length === 0) return [];

  const maxWeight = candidates[0].weight;

  const packed = packBubbles(
    candidates.map((x) => ({ id: x.repo.id, value: x.weight })),
    {
      width: MAP_WIDTH,
      height: MAP_HEIGHT,
      minRadius: MIN_RADIUS,
      maxRadius: MAX_RADIUS,
      padding: 1,
      fillRatio: 0.92,
    },
  );

  const byId = new Map(candidates.map((x) => [x.repo.id, x]));

  return packed
    .map((p) => {
      const hit = byId.get(p.id);
      if (!hit) return null;
      const repo = hit.repo;
      const logIntensity =
        maxWeight > 1
          ? Math.log10(hit.weight + 1) / Math.log10(maxWeight + 1)
          : 1;
      const tint = tintForCategory(repo.categoryId, logIntensity);

      return {
        id: p.id,
        cx: p.cx,
        cy: p.cy,
        r: p.r,
        // Label shows the honest, un-boosted window delta.
        delta: hit.rawDelta,
        deltaWindow: window,
        fullName: repo.fullName,
        name: repo.name,
        owner: repo.owner,
        avatarUrl: repo.ownerAvatarUrl,
        categoryId: repo.categoryId,
        fill: tint.fill,
        stroke: tint.stroke,
        glow: tint.glow,
        textColor: tint.text,
      };
    })
    .filter((b): b is BubbleSeed => b !== null);
}

export function BubbleMap({ repos, limit = 220 }: BubbleMapProps) {
  const windows: WindowSeedSet = {
    "24h": seedsForWindow(repos, "24h", limit),
    "7d": seedsForWindow(repos, "7d", limit),
    "30d": seedsForWindow(repos, "30d", limit),
  };

  // If every window is empty, don't render the section at all.
  const hasAny =
    windows["24h"].length > 0 ||
    windows["7d"].length > 0 ||
    windows["30d"].length > 0;
  if (!hasAny) return null;

  return (
    <BubbleMapCanvas
      windows={windows}
      width={MAP_WIDTH}
      height={MAP_HEIGHT}
    />
  );
}
