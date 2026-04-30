// /compare chart themes — 5 distinct visual treatments (W3.G).
//
// Each theme = (1) palette of 5 stroke colors, (2) chart-shape config
// (stroke width, area-fill, glow), (3) grid density, (4) chart-card
// background tint. Plumbed through CompareChart via the `theme` prop and
// (later) through the OG share-card endpoint via `?theme=`.

export type ChartTheme =
  | "terminal"
  | "neon"
  | "gradient"
  | "crt"
  | "poster";

export interface ThemeConfig {
  /** 5 stroke colors. Indexed by series slot. */
  palette: readonly [string, string, string, string, string];
  /** Stroke width on the primary line. */
  strokeWidth: number;
  /** Render an area fill under each line. */
  areaFill: boolean;
  /** Per-series area fill opacity ramp (0..1). Applied at the bottom of the
   *  fill; top-of-chart is 0. Ignored when areaFill === false. */
  areaFillOpacity: number;
  /** Render an outer "glow" stroke (a thicker, lower-opacity stroke under
   *  the main one). Cheap fake glow — works in Satori too. */
  outerGlow: boolean;
  /** Outer-glow stroke width (when enabled). Set wider than strokeWidth. */
  outerGlowWidth: number;
  /** Outer-glow opacity. */
  outerGlowOpacity: number;
  /** CartesianGrid stroke-dasharray pattern (Recharts). */
  gridDash: string;
  /** Number of horizontal grid lines (informational — Recharts auto-fits). */
  gridDensity: "sparse" | "very-sparse" | "none";
  /** Chart-card background. */
  cardBg: string;
  /** Chart-card border color. */
  cardBorder: string;
  /** Chart axis text color. */
  axisColor: string;
  /** CSS overlay: scanlines, noise, etc. Empty string = no overlay. */
  overlayPattern: string;
  /** Whether the theme is light-bg (poster). Affects label color contrast. */
  light: boolean;
}

// High-contrast green/blue/purple/amber/red — the operator-terminal default.
// HEX literals so the OG renderer (Satori) can resolve them; CSS vars don't
// flow through ImageResponse. Values mirror --color-series-N in globals.css.
const TERMINAL_PALETTE = [
  "#22c55e", // green  — slot 0
  "#3b82f6", // blue   — slot 1
  "#a855f7", // purple — slot 2
  "#f59e0b", // amber  — slot 3
  "#ef4444", // red    — slot 4
] as const;

// Saturated neon hues optimized for visibility against near-black + glow.
const NEON_PALETTE = [
  "#22d3ee", // cyan
  "#ec4899", // magenta-pink
  "#a3e635", // lime
  "#fb923c", // orange
  "#a78bfa", // violet
] as const;

// Green-phosphor intensity ramp for CRT — single hue, varied brightness.
const CRT_PALETTE = [
  "#86efac", // brightest
  "#4ade80",
  "#22c55e",
  "#16a34a",
  "#15803d", // dimmest
] as const;

// Bold poster palette tuned for light-background screenshots / Threads / IG.
const POSTER_PALETTE = [
  "#0ea5e9", // cyan-bold
  "#ef4444", // coral
  "#eab308", // yellow
  "#84cc16", // lime
  "#a855f7", // violet
] as const;

export const CHART_THEMES: Record<ChartTheme, ThemeConfig> = {
  terminal: {
    palette: TERMINAL_PALETTE,
    strokeWidth: 2,
    areaFill: false,
    areaFillOpacity: 0,
    outerGlow: false,
    outerGlowWidth: 0,
    outerGlowOpacity: 0,
    gridDash: "3 3",
    gridDensity: "sparse",
    cardBg: "var(--color-bg-secondary)",
    cardBorder: "var(--color-border-primary)",
    axisColor: "var(--v4-ink-400)",
    overlayPattern: "",
    light: false,
  },
  neon: {
    palette: NEON_PALETTE,
    strokeWidth: 2.5,
    areaFill: false,
    areaFillOpacity: 0,
    outerGlow: true,
    outerGlowWidth: 8,
    outerGlowOpacity: 0.35,
    gridDash: "1 8",
    gridDensity: "very-sparse",
    cardBg: "#0b0b14",
    cardBorder: "#1a1a2e",
    axisColor: "#94a3b8",
    // 2px horizontal scanline pattern — soft, not aggressive
    overlayPattern:
      "repeating-linear-gradient(to bottom, rgba(255,255,255,0.025) 0 1px, transparent 1px 3px)",
    light: false,
  },
  gradient: {
    palette: TERMINAL_PALETTE,
    strokeWidth: 2,
    areaFill: true,
    areaFillOpacity: 0.22,
    outerGlow: false,
    outerGlowWidth: 0,
    outerGlowOpacity: 0,
    gridDash: "3 3",
    gridDensity: "sparse",
    cardBg: "var(--color-bg-secondary)",
    cardBorder: "var(--color-border-primary)",
    axisColor: "var(--v4-ink-400)",
    overlayPattern: "",
    light: false,
  },
  crt: {
    palette: CRT_PALETTE,
    strokeWidth: 1.5,
    areaFill: false,
    areaFillOpacity: 0,
    outerGlow: true,
    outerGlowWidth: 4,
    outerGlowOpacity: 0.4,
    gridDash: "2 6",
    gridDensity: "very-sparse",
    cardBg: "#04140a",
    cardBorder: "#0d3a1f",
    axisColor: "#86efac",
    // Aggressive CRT scanlines + faint green tint
    overlayPattern:
      "repeating-linear-gradient(to bottom, rgba(34,197,94,0.06) 0 1px, transparent 1px 2px)",
    light: false,
  },
  poster: {
    palette: POSTER_PALETTE,
    strokeWidth: 4,
    areaFill: false,
    areaFillOpacity: 0,
    outerGlow: false,
    outerGlowWidth: 0,
    outerGlowOpacity: 0,
    gridDash: "0",
    gridDensity: "none",
    cardBg: "#f7f6f2",
    cardBorder: "#1f1f1f",
    axisColor: "#1f1f1f",
    overlayPattern: "",
    light: true,
  },
};

export function getThemeConfig(theme: ChartTheme | undefined): ThemeConfig {
  return CHART_THEMES[theme ?? "terminal"];
}

export const CHART_THEME_OPTIONS: ReadonlyArray<{
  label: string;
  value: ChartTheme;
}> = [
  { label: "Terminal", value: "terminal" },
  { label: "Neon", value: "neon" },
  { label: "Gradient", value: "gradient" },
  { label: "CRT", value: "crt" },
  { label: "Poster", value: "poster" },
];
