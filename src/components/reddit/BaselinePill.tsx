// Per-post badge showing how a post's upvotes compare to its subreddit's
// rolling 30-day median. Visual treatment is tier-driven and intentionally
// loud at the top end so a `100×` row screams across the feed.
//
// Tiers:
//   breakout      (≥10×)  — orange→red gradient + Flame, glow pulse
//                           (≥50× → double Flame, ≥100× → red border + outer ring)
//   above-average (1–10×) — soft green tint + TrendingUp
//   normal        (<1×)   — render null (drop the visual noise)
//   no-baseline           — render null (we let row chrome carry the void)
//
// The "r/{sub}" text was DROPPED on purpose — the row meta line already
// renders the subreddit chip right next to this pill, repeating it inside
// the pill was visual noise the user complained about for 3 rounds.
//
// Prop signature is preserved 1:1 so call sites in AllTrendingTabs +
// PostRowCompact don't need to change.

import { Flame, TrendingUp } from "lucide-react";
import type { CSSProperties } from "react";

import type { BaselineTier } from "@/lib/reddit-baselines";
import { cn } from "@/lib/utils";

export type BaselinePillSize = "sm" | "md" | "lg";

export interface BaselinePillProps {
  sub: string;
  ratio?: number | null;
  tier?: BaselineTier;
  /** Low-confidence baselines append a tiny `?` superscript so the user
   * knows the ratio is based on a thin sample. */
  confidence?: "high" | "medium" | "low" | null;
  /** Visual scale. `sm` (default) is the row default; `md` is used by
   * BREAKOUT tier rows; `lg` by HYPERVIRAL rows. */
  size?: BaselinePillSize;
}

interface SizeSpec {
  pill: string;
  icon: number;
  gap: string;
}

const SIZE_SPEC: Record<BaselinePillSize, SizeSpec> = {
  sm: { pill: "h-5 px-1.5 text-[11px] gap-0.5", icon: 11, gap: "gap-0.5" },
  md: { pill: "h-6 px-2 text-xs gap-1", icon: 12, gap: "gap-1" },
  lg: { pill: "h-7 px-2.5 text-sm gap-1", icon: 14, gap: "gap-1" },
};

function formatMultiplier(ratio: number, tier: "breakout" | "above"): string {
  // Breakout uses integer ×; above-avg keeps one decimal so a 1.4× still
  // reads as not-quite-double rather than rounding to "1×" or "2×".
  if (tier === "breakout") return `${Math.round(ratio)}×`;
  return `${ratio.toFixed(1)}×`;
}

function renderConfidence(confidence: BaselinePillProps["confidence"]) {
  if (confidence !== "low") return null;
  return (
    <sup
      aria-label="low-confidence baseline"
      className="ml-0.5 text-[0.7em] font-semibold opacity-80"
    >
      ?
    </sup>
  );
}

export function BaselinePill({
  sub,
  ratio,
  tier,
  confidence,
  size = "sm",
}: BaselinePillProps) {
  // Drop normal + no-baseline pills entirely — the row already carries
  // enough chrome (avatar, sub chip, age, velocity icon). Adding a grey
  // pill here was the visual noise the user has been calling out.
  if (!tier || tier === "no-baseline" || ratio == null) return null;
  if (tier === "below-average" || tier === "normal") return null;
  if (tier !== "breakout" && tier !== "above-average") return null;

  const spec = SIZE_SPEC[size];
  const conf = confidence ?? "no";
  const baseTitle = `${ratio}× the median score for r/${sub} (${conf} confidence baseline)`;

  // ── BREAKOUT tier ────────────────────────────────────────────────────────
  if (tier === "breakout") {
    const isHyperviral = ratio >= 100;
    const isDoubleFlame = ratio >= 50;
    const label = formatMultiplier(ratio, "breakout");

    // Inline style so the gradient + glow pulse don't depend on a tailwind
    // arbitrary-class build. Reuses existing `pulse-glow` keyframe.
    const style: CSSProperties = {
      background: "linear-gradient(135deg, #ff6600 0%, #ff4500 100%)",
      animation: "pulse-glow 2.5s ease-in-out infinite",
      boxShadow: isHyperviral
        ? "0 0 0 1px rgba(220, 38, 38, 0.85), 0 0 14px rgba(255, 102, 0, 0.55)"
        : "0 0 8px rgba(255, 102, 0, 0.5)",
    };

    return (
      <span
        className={cn(
          "inline-flex items-center rounded-md font-mono font-extrabold tracking-tight whitespace-nowrap text-white shrink-0",
          spec.pill,
          isHyperviral && "border border-red-500",
          confidence === "low" && "opacity-80",
        )}
        style={style}
        title={baseTitle}
      >
        <Flame
          size={spec.icon}
          aria-hidden="true"
          className="shrink-0 drop-shadow-[0_0_2px_rgba(0,0,0,0.4)]"
          strokeWidth={2.5}
        />
        {isDoubleFlame ? (
          <Flame
            size={spec.icon}
            aria-hidden="true"
            className="-ml-1 shrink-0 drop-shadow-[0_0_2px_rgba(0,0,0,0.4)]"
            strokeWidth={2.5}
          />
        ) : null}
        <span className="tabular-nums leading-none">{label}</span>
        {renderConfidence(confidence)}
      </span>
    );
  }

  // ── ABOVE-AVERAGE tier ──────────────────────────────────────────────────
  const label = formatMultiplier(ratio, "above");
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md font-mono font-bold tracking-tight whitespace-nowrap shrink-0",
        "bg-[#10B981]/15 border border-[#10B981]/40 text-[#10B981]",
        spec.pill,
        confidence === "low" && "opacity-75",
      )}
      title={baseTitle}
    >
      <TrendingUp
        size={spec.icon}
        aria-hidden="true"
        className="shrink-0"
        strokeWidth={2.5}
      />
      <span className="tabular-nums leading-none">{label}</span>
      {renderConfidence(confidence)}
    </span>
  );
}
