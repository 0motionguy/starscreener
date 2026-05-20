// CompareCellSpark — small visual indicators inside compare-table cells.
// Server Component. Three variants:
//
//   variant="delta"     → a horizontal +/- bar normalized against the
//                         row's max-abs value. Positive deltas fill right,
//                         negative deltas fill left, both anchored on a
//                         centered zero-line. Plain dot when value is 0.
//
//   variant="mentions"  → a 7-dot strip lit proportional to value / max.
//                         Used for cross-source mention counts where the
//                         absolute scale is small and a 0..7 dot count
//                         reads faster than a bar.
//
//   variant="tier"      → S/A/B/C/D letter tile colored by tier.
//
// Pure presentational — no data fetching, no client JS.
//
// All visual widths are inline so the table doesn't need a new global rule.
// Inherits its parent cell's font-family + tabular-nums.

import type { TierLetter } from "./CompareTable";

interface DeltaProps {
  variant: "delta";
  value: number;
  max: number;
}

interface MentionsProps {
  variant: "mentions";
  value: number;
  max: number;
}

interface TierProps {
  variant: "tier";
  tier: TierLetter | null;
}

type Props = DeltaProps | MentionsProps | TierProps;

export function CompareCellSpark(props: Props) {
  if (props.variant === "delta") return <DeltaBar value={props.value} max={props.max} />;
  if (props.variant === "mentions") return <MentionStrip value={props.value} max={props.max} />;
  return <TierBadge tier={props.tier} />;
}

function DeltaBar({ value, max }: { value: number; max: number }) {
  const safeMax = Math.max(1, Math.abs(max));
  const pct = Math.min(100, (Math.abs(value) / safeMax) * 100);
  const positive = value > 0;
  const negative = value < 0;
  // Anchor on a 50% center line; positive grows right, negative grows left.
  const halfWidth = pct / 2;
  return (
    <span
      className="cmp-spark cmp-spark-delta"
      role="img"
      aria-hidden="true"
      style={{
        position: "relative",
        display: "block",
        width: "100%",
        height: 4,
        background: "var(--surface-3)",
        borderRadius: 1,
        marginTop: 6,
        overflow: "hidden",
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          left: "50%",
          width: 1,
          background: "var(--border)",
        }}
      />
      {positive ? (
        <span
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: "50%",
            width: `${halfWidth}%`,
            background: "var(--up)",
            borderRadius: 1,
          }}
        />
      ) : null}
      {negative ? (
        <span
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            right: "50%",
            width: `${halfWidth}%`,
            background: "var(--accent)",
            borderRadius: 1,
          }}
        />
      ) : null}
    </span>
  );
}

function MentionStrip({ value, max }: { value: number; max: number }) {
  const DOTS = 7;
  const safeMax = Math.max(1, max);
  const lit = Math.max(0, Math.min(DOTS, Math.round((value / safeMax) * DOTS)));
  return (
    <span
      className="cmp-spark cmp-spark-mentions"
      role="img"
      aria-hidden="true"
      style={{
        display: "inline-flex",
        gap: 3,
        marginTop: 6,
      }}
    >
      {Array.from({ length: DOTS }).map((_, i) => (
        <span
          key={i}
          style={{
            width: 6,
            height: 6,
            borderRadius: 50,
            background: i < lit ? "var(--accent)" : "var(--surface-3)",
            display: "inline-block",
          }}
        />
      ))}
    </span>
  );
}

const TIER_COLOR: Record<TierLetter, { bg: string; fg: string }> = {
  S: { bg: "var(--accent)", fg: "var(--bg)" },
  A: { bg: "var(--cyan)", fg: "var(--bg)" },
  B: { bg: "var(--up)", fg: "var(--bg)" },
  C: { bg: "var(--surface-4)", fg: "var(--fg-bright)" },
  D: { bg: "var(--surface-3)", fg: "var(--fg-muted)" },
};

function TierBadge({ tier }: { tier: TierLetter | null }) {
  if (!tier) {
    return (
      <span
        className="cmp-tier-badge"
        style={{
          display: "inline-grid",
          placeItems: "center",
          width: 26,
          height: 26,
          background: "var(--surface-3)",
          color: "var(--fg-faint)",
          fontFamily: "var(--font-display)",
          fontWeight: 700,
          fontSize: 12,
          borderRadius: 2,
        }}
      >
        —
      </span>
    );
  }
  const tone = TIER_COLOR[tier];
  return (
    <span
      className="cmp-tier-badge"
      style={{
        display: "inline-grid",
        placeItems: "center",
        width: 26,
        height: 26,
        background: tone.bg,
        color: tone.fg,
        fontFamily: "var(--font-display)",
        fontWeight: 800,
        fontSize: 14,
        borderRadius: 2,
        letterSpacing: 0,
      }}
    >
      {tier}
    </span>
  );
}
