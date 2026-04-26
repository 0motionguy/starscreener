// LogoMarkV2 — TrendingRepo brand mark.
//
// A solid square frame containing 4 ascending-width horizontal bars
// stacked from bottom to top — reads as "trending up" while keeping
// the same industrial geometry family as Blockworks. Scales cleanly
// from 12px (favicon-equivalent) to 96px (logo lockup).
//
// Color comes from the theme — the mark uses currentColor on the bars
// so a parent <span style={{ color: theme }}> swaps it. Frame is the
// background fill so it always reads as a solid block.

interface LogoMarkV2Props {
  /** Square edge length in px. Default 16. */
  size?: number;
  /** Frame fill color. Defaults to var(--v2-acc) so it follows the active theme. */
  frameColor?: string;
  /** Bar color. Defaults to "#000" so it punches through the theme frame. */
  barColor?: string;
  /** Optional className for the wrapping <svg>. */
  className?: string;
}

export function LogoMarkV2({
  size = 16,
  frameColor = "var(--v2-acc)",
  barColor = "#000",
  className,
}: LogoMarkV2Props) {
  // Internal viewBox is 24×24. Bars are stacked bottom-to-top, each
  // wider than the one below — visual "trending up" silhouette.
  // Heights, gaps and widths are picked so the mark stays legible at
  // 12px through 96px without re-tuning.
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      aria-hidden
      style={{
        // Keeps glow effects when wrapped in something like a brand pill.
        display: "block",
        flexShrink: 0,
      }}
    >
      {/* Solid frame */}
      <rect width="24" height="24" fill={frameColor} />

      {/* 4 ascending bars — bottom narrowest, top widest. Each bar is
          2px tall with 1px gaps between, leaving 4px padding inside the
          24×24 frame. */}
      <rect x="6" y="17" width="6" height="2" fill={barColor} />
      <rect x="6" y="13" width="9" height="2" fill={barColor} />
      <rect x="6" y="9" width="12" height="2" fill={barColor} />
      <rect x="6" y="5" width="14" height="2" fill={barColor} />
    </svg>
  );
}

/** Wordmark — "TrendingRepo" in mono, with optional V2 pill suffix.
 *  Uses Geist Mono so it sits cleanly next to the LogoMarkV2 square. */
export function WordmarkV2({
  showBeta = false,
  size = 14,
  className,
}: {
  showBeta?: boolean;
  size?: number;
  className?: string;
}) {
  return (
    <span
      className={className}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
        fontSize: size,
        fontWeight: 500,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        color: "var(--v2-ink-100)",
        lineHeight: 1,
      }}
    >
      <span>
        TRENDING<span style={{ color: "var(--v2-acc)" }}>REPO</span>
      </span>
      {showBeta ? (
        <span
          style={{
            fontSize: 9,
            letterSpacing: "0.18em",
            border: "1px solid rgba(245, 110, 15, 0.4)",
            color: "var(--v2-acc)",
            background: "var(--v2-acc-soft)",
            padding: "1px 5px",
            borderRadius: 1,
          }}
        >
          V2
        </span>
      ) : null}
    </span>
  );
}

/** Logo lockup — mark + wordmark in one row, sized as a unit. */
export function LogoLockupV2({
  size = 28,
  showBeta = false,
  className,
}: {
  /** Mark edge length in px. Wordmark scales proportionally. */
  size?: number;
  showBeta?: boolean;
  className?: string;
}) {
  // Wordmark size scales ~50% of mark size, capped between 12-22px.
  const wordSize = Math.max(12, Math.min(22, Math.round(size * 0.5)));
  return (
    <span
      className={className}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: Math.round(size * 0.32),
      }}
    >
      <LogoMarkV2 size={size} />
      <WordmarkV2 size={wordSize} showBeta={showBeta} />
    </span>
  );
}
