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
// Raised min radius so the smallest bubbles still fit a truncated name
// (e.g. "ca…") instead of showing just the delta number. Keeps the pack
// slightly less dense but much more legible.
const MIN_RADIUS = 18;
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

/**
 * Flat category tint — every repo in a category reads the same color,
 * independent of delta size. Toned down from the original vivid fills
 * (users reported the bubble field was shouting over the rest of the
 * UI — brand orange logo accent, Featured cards, delta greens all got
 * drowned). Now: faint fill for identity hint, crisp colored stroke for
 * shape, uniformly light text so contrast holds against any hue.
 */
function tintForCategory(categoryId: string): {
  fill: string;
  stroke: string;
  glow: string;
  text: string;
} {
  const hex = CATEGORY_COLOR.get(categoryId) ?? FALLBACK_COLOR;
  const { r, g, b } = hexToRgb(hex);

  // Stroke carries the category identity — medium-strong so the bubble
  // still reads as a crisp shape even at the faint fill below.
  const stroke = `rgba(${r}, ${g}, ${b}, 0.75)`;
  // Ambient glow dropped from 0.22 → 0.08 so halos don't add to the noise.
  const glow = `rgba(${r}, ${g}, ${b}, 0.08)`;

  return {
    fill: `rgb(${r}, ${g}, ${b})`,
    stroke,
    glow,
    // Always light text — with the new faint fill, the dark page bg shows
    // through and light text stays legible on every hue. The earlier
    // luminance-triggered dark-on-light switch broke on semi-transparent
    // yellows/limes where fill lightness no longer dominated.
    text: "#f6f9fc",
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

  const packed = packBubbles(
    candidates.map((x) => ({ id: x.repo.id, value: x.weight })),
    {
      width: MAP_WIDTH,
      height: MAP_HEIGHT,
      minRadius: MIN_RADIUS,
      maxRadius: MAX_RADIUS,
      padding: 2,
      fillRatio: 0.92,
      // Reserve 6 px on every edge — covers the ambient glow halo (r + 4)
      // plus a hair of extra breathing room so nothing clips against the
      // section's overflow-hidden at the right / top / bottom walls.
      edgeMargin: 6,
    },
  );

  const byId = new Map(candidates.map((x) => [x.repo.id, x]));

  return packed
    .map((p) => {
      const hit = byId.get(p.id);
      if (!hit) return null;
      const repo = hit.repo;
      const tint = tintForCategory(repo.categoryId);

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

  // If every window is empty, render a minimal "warming up" placeholder
  // instead of returning null — collapsing the whole section is worse
  // UX because the page jumps and users can't tell if the feature exists.
  const hasAny =
    windows["24h"].length > 0 ||
    windows["7d"].length > 0 ||
    windows["30d"].length > 0;
  if (!hasAny) {
    return (
      <div
        className="w-full rounded-card border border-border-primary bg-bg-secondary/40 flex items-center justify-center text-text-tertiary font-mono text-xs uppercase tracking-wider"
        style={{ height: MAP_HEIGHT }}
        aria-label="Bubble map warming up"
      >
        <span className="inline-flex items-center gap-2">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-brand animate-pulse" />
          Warming up the firehose…
        </span>
      </div>
    );
  }

  return (
    <BubbleMapCanvas
      windows={windows}
      width={MAP_WIDTH}
      height={MAP_HEIGHT}
    />
  );
}
