// Vendored Apache ECharts official themes — Apache License 2.0.
//
// Source: https://github.com/apache/echarts/tree/master/theme
//   - macarons.js
//   - vintage.js
//   - roma.js
//   - shine.js
//   - dark.js
//   - dark-bold.js
//   - infographic.js
//
// These themes ship as UMD JS that self-registers against a global `echarts`
// instance, which doesn't work with our scoped ESM import of echarts/core.
// So we extracted each `theme = {...}` object literal verbatim and re-register
// against our scoped instance via `registerPublicThemes()`.
//
// Plus 6 curated trendingrepo themes — `aurora` (brand default), `parchment`,
// `newsprint`, `phosphor`, `blueprint`, `riso`. These are the gallery
// lineup surfaced in the /tools/star-history ThemeLab section: each is
// visually distinct and brand-coherent, designed to give the share-card
// surface real range without dragging in the random Apache palettes.
//
// Sketch (xkcd-style hand-drawn) is registered here as a meta entry but
// rendered by a custom SVG component (SketchArt), not ECharts — ECharts has
// no native rough-line support and the turbulence-displaced SVG path is
// indistinguishable from the real thing at chart sizes.

import { echarts } from "@/lib/charts/theme/core";

// ---------------------------------------------------------------------------
// AURORA — the trendingrepo brand theme (custom, not from Apache ECharts).
// Dark canvas + Liquid Lava orange lead, brand-aligned with DESIGN.md.
// ---------------------------------------------------------------------------

const aurora = {
  darkMode: true,
  color: ["#ff6b35", "#3ad6c5", "#ffb547", "#22c55e", "#a78bfa", "#f472b6", "#60a5fa"],
  backgroundColor: "transparent",
  textStyle: { color: "#eef0f2" },
  title: { textStyle: { color: "#eef0f2", fontWeight: 500 } },
  legend: { textStyle: { color: "#84909b" } },
  tooltip: {
    backgroundColor: "#08090a",
    borderColor: "#222a32",
    borderWidth: 1,
    textStyle: { color: "#eef0f2" },
    axisPointer: { type: "line", lineStyle: { color: "#ff6b35", type: "dashed", width: 1 } },
  },
  categoryAxis: {
    axisLine: { show: false },
    axisTick: { show: false },
    axisLabel: { color: "#909caa" },
    splitLine: { show: false },
  },
  valueAxis: {
    axisLine: { show: false },
    axisTick: { show: false },
    axisLabel: { color: "#909caa" },
    splitLine: { show: true, lineStyle: { color: "#1a2026", type: "dashed", opacity: 0.55 } },
  },
  timeAxis: {
    axisLine: { show: false },
    axisLabel: { color: "#909caa" },
    splitLine: { show: false },
  },
  line: { smooth: false, symbol: "none", lineStyle: { width: 2 } },
};

// ---------------------------------------------------------------------------
// MACARONS — Apache ECharts official (pastel multi-color, soft accents).
// ---------------------------------------------------------------------------

const macarons = {
  color: [
    "#2ec7c9", "#b6a2de", "#5ab1ef", "#ffb980", "#d87a80",
    "#8d98b3", "#e5cf0d", "#97b552", "#95706d", "#dc69aa",
  ],
  backgroundColor: "transparent",
  title: { textStyle: { fontWeight: "normal", color: "#008acd" } },
  tooltip: {
    borderWidth: 0,
    backgroundColor: "rgba(50,50,50,0.85)",
    textStyle: { color: "#FFF" },
    axisPointer: { type: "line", lineStyle: { color: "#008acd" } },
  },
  categoryAxis: {
    axisLine: { lineStyle: { color: "#008acd" } },
    splitLine: { lineStyle: { color: ["#eee"] } },
  },
  valueAxis: {
    axisLine: { lineStyle: { color: "#008acd" } },
    splitArea: {
      show: true,
      areaStyle: { color: ["rgba(250,250,250,0.05)", "rgba(200,200,200,0.05)"] },
    },
    splitLine: { lineStyle: { color: ["#eee"] } },
  },
  line: { smooth: true, symbol: "emptyCircle", symbolSize: 3 },
};

// ---------------------------------------------------------------------------
// VINTAGE — Apache ECharts official (sepia / warm cream paper).
// ---------------------------------------------------------------------------

const vintage = {
  color: [
    "#d87c7c", "#919e8b", "#d7ab82", "#6e7074", "#61a0a8",
    "#efa18d", "#787464", "#cc7e63", "#724e58", "#4b565b",
  ],
  backgroundColor: "#fef8ef",
};

// ---------------------------------------------------------------------------
// ROMA — Apache ECharts official (red/coral classical).
// ---------------------------------------------------------------------------

const roma = {
  color: [
    "#E01F54", "#001852", "#f5e8c8", "#b8d2c7", "#c6b38e",
    "#a4d8c2", "#f3d999", "#d3758f", "#dcc392", "#2e4783",
  ],
  backgroundColor: "transparent",
};

// ---------------------------------------------------------------------------
// SHINE — Apache ECharts official (clean corporate blue/red).
// ---------------------------------------------------------------------------

const shine = {
  color: ["#c12e34", "#e6b600", "#0098d9", "#2b821d", "#005eaa", "#339ca8", "#cda819", "#32a487"],
  backgroundColor: "transparent",
  title: { textStyle: { fontWeight: "normal" } },
  tooltip: { backgroundColor: "rgba(0,0,0,0.6)" },
};

// ---------------------------------------------------------------------------
// DARK-BOLD — Apache ECharts official (dark backdrop, bold red/green palette).
// ---------------------------------------------------------------------------

const darkBoldAxis = {
  axisLine: { lineStyle: { color: "#eee" } },
  axisTick: { lineStyle: { color: "#eee" } },
  axisLabel: { color: "#eee" },
  splitLine: { lineStyle: { type: "dashed", color: "#555" } },
};

const darkBold = {
  darkMode: true,
  color: ["#458c6b", "#f2da87", "#d9a86c", "#d94436", "#a62424", "#76bc9b", "#cce6da", "#eeeeee"],
  backgroundColor: "#333",
  tooltip: {
    axisPointer: { lineStyle: { color: "#eee" }, crossStyle: { color: "#eee" } },
  },
  legend: { textStyle: { color: "#eee" } },
  title: { textStyle: { color: "#eee" } },
  timeAxis: darkBoldAxis,
  logAxis: darkBoldAxis,
  valueAxis: darkBoldAxis,
  categoryAxis: darkBoldAxis,
  line: { symbol: "circle" },
};

// ---------------------------------------------------------------------------
// INFOGRAPHIC — Apache ECharts official (bold reportage palette).
// ---------------------------------------------------------------------------

const infographic = {
  color: [
    "#C1232B", "#27727B", "#FCCE10", "#E87C25", "#B5C334",
    "#FE8463", "#9BCA63", "#FAD860", "#F3A43B", "#60C0DD",
  ],
  backgroundColor: "transparent",
  title: { textStyle: { fontWeight: "normal", color: "#27727B" } },
  tooltip: {
    backgroundColor: "rgba(50,50,50,0.85)",
    axisPointer: {
      type: "line",
      lineStyle: { color: "#27727B", type: "dashed" },
    },
  },
  categoryAxis: {
    axisLine: { lineStyle: { color: "#27727B" } },
    splitLine: { show: false },
  },
  valueAxis: {
    axisLine: { show: false },
    splitArea: { show: false },
    splitLine: { lineStyle: { color: ["#ccc"], type: "dashed" } },
  },
  line: {
    symbol: "circle",
    symbolSize: 3.5,
    itemStyle: { borderWidth: 2, borderColor: "#fff" },
  },
};

// ---------------------------------------------------------------------------
// PARCHMENT — cream paper + ink black + lava orange + signal blue.
// Sister to the AISO.tools "industrial intelligence" design language: warm
// neutral canvas, sharp black numerics, single-stroke chart with a faint
// orange wash. Reads like a printed technical specification sheet.
// ---------------------------------------------------------------------------

const parchment = {
  darkMode: false,
  color: ["#FF5C1F", "#2348E5", "#1F7A3A", "#5C5B53", "#A12424"],
  backgroundColor: "transparent",
  textStyle: { color: "#0A0A09", fontFamily: "var(--font-mono)" },
  title: { textStyle: { color: "#0A0A09", fontWeight: 600 } },
  legend: { textStyle: { color: "#5C5B53" } },
  tooltip: {
    backgroundColor: "#EAE6DC",
    borderColor: "#0A0A09",
    borderWidth: 1,
    textStyle: { color: "#0A0A09" },
    axisPointer: {
      type: "line",
      lineStyle: { color: "#FF5C1F", type: "solid", width: 1 },
    },
  },
  categoryAxis: {
    axisLine: { lineStyle: { color: "#0A0A09", width: 1 } },
    axisTick: { lineStyle: { color: "#0A0A09" } },
    axisLabel: { color: "#5C5B53" },
    splitLine: { show: false },
  },
  valueAxis: {
    axisLine: { lineStyle: { color: "#0A0A09", width: 1 } },
    axisTick: { lineStyle: { color: "#0A0A09" } },
    axisLabel: { color: "#5C5B53" },
    splitLine: {
      show: true,
      lineStyle: { color: "#D8D2C5", type: "solid", width: 1 },
    },
  },
  timeAxis: {
    axisLine: { lineStyle: { color: "#0A0A09" } },
    axisLabel: { color: "#5C5B53" },
    splitLine: { show: false },
  },
  line: { smooth: false, symbol: "none", lineStyle: { width: 2 } },
};

// ---------------------------------------------------------------------------
// NEWSPRINT — FT-salmon cream paper with editorial dark-teal lines. Classical
// reportage feel; the line carries a slight serif tooltip and the area fill
// is a muted teal wash. For the "this is a serious chart in a newspaper"
// share card.
// ---------------------------------------------------------------------------

const newsprint = {
  darkMode: false,
  color: ["#0C3B4C", "#A12424", "#856544", "#3F6E2C", "#5C5B53"],
  backgroundColor: "transparent",
  textStyle: { color: "#1A1A1A", fontFamily: "Georgia, 'Times New Roman', serif" },
  title: { textStyle: { color: "#1A1A1A", fontWeight: 700 } },
  legend: { textStyle: { color: "#6B6357" } },
  tooltip: {
    backgroundColor: "#F4ECDC",
    borderColor: "#0C3B4C",
    borderWidth: 1,
    textStyle: { color: "#0C3B4C" },
    axisPointer: {
      type: "line",
      lineStyle: { color: "#0C3B4C", type: "dashed", width: 1 },
    },
  },
  categoryAxis: {
    axisLine: { lineStyle: { color: "#856544" } },
    axisTick: { lineStyle: { color: "#856544" } },
    axisLabel: { color: "#6B6357" },
    splitLine: { show: false },
  },
  valueAxis: {
    axisLine: { show: false },
    axisTick: { show: false },
    axisLabel: { color: "#6B6357" },
    splitLine: {
      show: true,
      lineStyle: { color: "#E0D5BD", type: "dashed", width: 1 },
    },
  },
  timeAxis: {
    axisLine: { lineStyle: { color: "#856544" } },
    axisLabel: { color: "#6B6357" },
    splitLine: { show: false },
  },
  line: { smooth: 0.5, symbol: "none", lineStyle: { width: 2.4 } },
};

// ---------------------------------------------------------------------------
// PHOSPHOR — CRT terminal green-on-near-black. Single neon-green stroke, no
// area fill (we add a glow via SVG inside the gallery tile), faint grid.
// The "I shipped this from a terminal at 3am" vibe.
// ---------------------------------------------------------------------------

const phosphor = {
  darkMode: true,
  color: ["#39FF7E", "#00FF9C", "#7BFF8A", "#39FFC2"],
  backgroundColor: "transparent",
  textStyle: { color: "#39FF7E", fontFamily: "var(--font-mono)" },
  title: { textStyle: { color: "#39FF7E", fontWeight: 600 } },
  legend: { textStyle: { color: "#5BB87A" } },
  tooltip: {
    backgroundColor: "#021B0E",
    borderColor: "#39FF7E",
    borderWidth: 1,
    textStyle: { color: "#39FF7E" },
    axisPointer: {
      type: "line",
      lineStyle: { color: "#39FF7E", type: "dashed", width: 1, opacity: 0.6 },
    },
  },
  categoryAxis: {
    axisLine: { lineStyle: { color: "#1F8B4A" } },
    axisTick: { show: false },
    axisLabel: { color: "#5BB87A" },
    splitLine: { show: false },
  },
  valueAxis: {
    axisLine: { show: false },
    axisTick: { show: false },
    axisLabel: { color: "#5BB87A" },
    splitLine: {
      show: true,
      lineStyle: { color: "#0E2E1B", type: "solid", width: 1 },
    },
  },
  timeAxis: {
    axisLine: { lineStyle: { color: "#1F8B4A" } },
    axisLabel: { color: "#5BB87A" },
    splitLine: { show: false },
  },
  line: { smooth: false, symbol: "none", lineStyle: { width: 2 } },
};

// ---------------------------------------------------------------------------
// BLUEPRINT — drafting-paper navy with signal-blue stroke. Dotted reference
// grid, white annotations, technical-drawing feel. The "engineering brief"
// share card.
// ---------------------------------------------------------------------------

const blueprint = {
  darkMode: true,
  color: ["#4A9EFF", "#FFFFFF", "#7CC0FF", "#FFD24D"],
  backgroundColor: "transparent",
  textStyle: { color: "#A8C9F0", fontFamily: "var(--font-mono)" },
  title: { textStyle: { color: "#FFFFFF", fontWeight: 600 } },
  legend: { textStyle: { color: "#A8C9F0" } },
  tooltip: {
    backgroundColor: "#0B1638",
    borderColor: "#4A9EFF",
    borderWidth: 1,
    textStyle: { color: "#FFFFFF" },
    axisPointer: {
      type: "cross",
      lineStyle: { color: "#4A9EFF", type: "dashed", width: 1 },
      crossStyle: { color: "#4A9EFF", type: "dashed", width: 1 },
    },
  },
  categoryAxis: {
    axisLine: { lineStyle: { color: "#4A9EFF", opacity: 0.45 } },
    axisTick: { lineStyle: { color: "#4A9EFF", opacity: 0.45 } },
    axisLabel: { color: "#A8C9F0" },
    splitLine: { show: false },
  },
  valueAxis: {
    axisLine: { lineStyle: { color: "#4A9EFF", opacity: 0.45 } },
    axisTick: { show: false },
    axisLabel: { color: "#A8C9F0" },
    splitLine: {
      show: true,
      lineStyle: { color: "rgba(74,158,255,0.18)", type: "dotted", width: 1 },
    },
  },
  timeAxis: {
    axisLine: { lineStyle: { color: "#4A9EFF", opacity: 0.45 } },
    axisLabel: { color: "#A8C9F0" },
    splitLine: { show: false },
  },
  line: { smooth: true, symbol: "none", lineStyle: { width: 2.2 } },
};

// ---------------------------------------------------------------------------
// RISO — risograph two-tone print. Bold flat orange line, indigo accents,
// warm cream paper. Slight overprint feel via the area fill opacity.
// ---------------------------------------------------------------------------

const riso = {
  darkMode: false,
  color: ["#FF4D17", "#2A3FB0", "#1F7A3A", "#A12424"],
  backgroundColor: "transparent",
  textStyle: { color: "#1A1A1A", fontFamily: "var(--font-mono)" },
  title: { textStyle: { color: "#2A3FB0", fontWeight: 700 } },
  legend: { textStyle: { color: "#2A3FB0" } },
  tooltip: {
    backgroundColor: "#F1E6D5",
    borderColor: "#2A3FB0",
    borderWidth: 2,
    textStyle: { color: "#2A3FB0" },
    axisPointer: {
      type: "line",
      lineStyle: { color: "#2A3FB0", type: "solid", width: 2 },
    },
  },
  categoryAxis: {
    axisLine: { lineStyle: { color: "#2A3FB0", width: 1.5 } },
    axisTick: { lineStyle: { color: "#2A3FB0" } },
    axisLabel: { color: "#2A3FB0" },
    splitLine: { show: false },
  },
  valueAxis: {
    axisLine: { lineStyle: { color: "#2A3FB0", width: 1.5 } },
    axisTick: { lineStyle: { color: "#2A3FB0" } },
    axisLabel: { color: "#2A3FB0" },
    splitLine: {
      show: true,
      lineStyle: { color: "rgba(42,63,176,0.15)", type: "solid", width: 1 },
    },
  },
  timeAxis: {
    axisLine: { lineStyle: { color: "#2A3FB0" } },
    axisLabel: { color: "#2A3FB0" },
    splitLine: { show: false },
  },
  line: { smooth: false, symbol: "none", lineStyle: { width: 3 } },
};

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export const PUBLIC_THEME_NAMES = [
  "aurora",
  "parchment",
  "newsprint",
  "phosphor",
  "blueprint",
  "riso",
  "aiso",
  "macarons",
  "vintage",
  "roma",
  "shine",
  "dark-bold",
  "infographic",
] as const;

export type PublicThemeName = (typeof PUBLIC_THEME_NAMES)[number];

// AISO — sister-product palette from aiso.tools. Dark void canvas with
// PURPLE ACCENTS (grid, axis labels, area-fill top) + an EMERALD chart line.
// Explicitly no orange (the AISO brand pairs purple + green) and explicitly
// not a fully purple panel — purple is the atmosphere, dark is the canvas
// (operator decree 2026-05-24: "elements purple, not the WHOLE background").
const aiso = {
  darkMode: true,
  // Lead colour is royal violet so the primary cumulative-stars line paints
  // purple, not emerald. Emerald stays in the palette as a fallback for any
  // secondary series so the "up" hue still lives in the set.
  color: ["#a78bfa", "#c4b5fd", "#7c3aed", "#34d399", "#60a5fa"],
  backgroundColor: "transparent",
  textStyle: { color: "#c4b5fd" },
  title: { textStyle: { color: "#e9e4ff", fontWeight: 500 } },
  legend: { textStyle: { color: "#c4b5fd" } },
  tooltip: {
    backgroundColor: "#0c0b18",
    borderColor: "#a78bfa",
    borderWidth: 1,
    textStyle: { color: "#e9e4ff" },
    axisPointer: { type: "line", lineStyle: { color: "#a78bfa", type: "dashed", width: 1 } },
  },
  categoryAxis: {
    axisLine: { show: false },
    axisTick: { show: false },
    axisLabel: { color: "#c4b5fd" },
    splitLine: { show: false },
  },
  valueAxis: {
    axisLine: { show: false },
    axisTick: { show: false },
    axisLabel: { color: "#c4b5fd" },
    splitLine: { show: true, lineStyle: { color: "#a78bfa", type: "dashed", opacity: 0.22 } },
  },
  timeAxis: {
    axisLine: { show: false },
    axisLabel: { color: "#c4b5fd" },
    splitLine: { show: false },
  },
  line: {
    smooth: true,
    smoothMonotone: "x",
    symbol: "none",
    lineStyle: { width: 2.6, cap: "round", join: "round" },
    areaStyle: { opacity: 0.22 },
  },
};

const THEMES: Record<PublicThemeName, Record<string, unknown>> = {
  aurora,
  parchment,
  newsprint,
  phosphor,
  blueprint,
  riso,
  aiso,
  macarons,
  vintage,
  roma,
  shine,
  "dark-bold": darkBold,
  infographic,
};

let registered = false;
export function registerPublicThemes(): void {
  if (registered) return;
  registered = true;
  for (const name of PUBLIC_THEME_NAMES) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    echarts.registerTheme(name, THEMES[name] as any);
  }
}

// Static metadata for the picker UI — swatch + label + light/dark hint so the
// page can render preview chips without inspecting the theme objects.
export const PUBLIC_THEME_META: ReadonlyArray<{
  id: PublicThemeName;
  label: string;
  swatch: string;
  light: boolean;
}> = [
  { id: "aurora",      label: "AURORA",      swatch: "#ff6b35",                                      light: false },
  { id: "parchment",   label: "PARCHMENT",   swatch: "linear-gradient(135deg,#EAE6DC 60%,#FF5C1F 60%)", light: true },
  { id: "newsprint",   label: "NEWSPRINT",   swatch: "linear-gradient(135deg,#F4ECDC 60%,#0C3B4C 60%)", light: true },
  { id: "phosphor",    label: "PHOSPHOR",    swatch: "linear-gradient(135deg,#021B0E 60%,#39FF7E 60%)", light: false },
  { id: "blueprint",   label: "BLUEPRINT",   swatch: "linear-gradient(135deg,#0B1638 60%,#4A9EFF 60%)", light: false },
  { id: "riso",        label: "RISO",        swatch: "linear-gradient(135deg,#F1E6D5 50%,#FF4D17 50%)", light: true },
  { id: "aiso",        label: "AISO",        swatch: "linear-gradient(135deg,#6f4ad9 50%,#34d399 50%)", light: false },
  { id: "dark-bold",   label: "DARK BOLD",   swatch: "linear-gradient(135deg,#458c6b,#d94436)",      light: false },
  { id: "macarons",    label: "MACARONS",    swatch: "linear-gradient(135deg,#2ec7c9,#b6a2de,#d87a80)", light: false },
  { id: "vintage",     label: "VINTAGE",     swatch: "#fef8ef",                                      light: true },
  { id: "roma",        label: "ROMA",        swatch: "linear-gradient(135deg,#E01F54,#f5e8c8)",      light: true },
  { id: "shine",       label: "SHINE",       swatch: "linear-gradient(135deg,#c12e34,#0098d9)",      light: false },
  { id: "infographic", label: "INFOGRAPHIC", swatch: "linear-gradient(135deg,#C1232B,#27727B,#FCCE10)", light: false },
];

// The 7 themes surfaced in the /tools/star-history ThemeLab gallery —
// brand-aligned and visually distinct. The "sketch" entry is rendered by
// SketchArt (custom SVG with rough-line turbulence filter), the rest by
// ECharts via the registered themes above.
export type GalleryThemeName = PublicThemeName | "sketch";

export const GALLERY_THEMES: ReadonlyArray<{
  id: GalleryThemeName;
  label: string;
  blurb: string;
  swatch: string;
  light: boolean;
}> = [
  { id: "aurora",    label: "AURORA",    blurb: "brand default · dark void + liquid lava",         swatch: "linear-gradient(135deg,#08090a 60%,#ff6b35 60%)", light: false },
  { id: "parchment", label: "PARCHMENT", blurb: "cream paper · ink stroke · agentic-web sister",   swatch: "linear-gradient(135deg,#EAE6DC 60%,#FF5C1F 60%)", light: true  },
  { id: "sketch",    label: "SKETCH",    blurb: "hand-drawn · xkcd-style turbulence",              swatch: "linear-gradient(135deg,#FCFBF7 60%,#EA4A1F 60%)", light: true  },
  { id: "newsprint", label: "NEWSPRINT", blurb: "FT salmon + dark teal · editorial",               swatch: "linear-gradient(135deg,#F4ECDC 60%,#0C3B4C 60%)", light: true  },
  { id: "phosphor",  label: "PHOSPHOR",  blurb: "CRT terminal · green on void",                    swatch: "linear-gradient(135deg,#021B0E 60%,#39FF7E 60%)", light: false },
  { id: "blueprint", label: "BLUEPRINT", blurb: "drafting paper · signal blue · technical brief",  swatch: "linear-gradient(135deg,#0B1638 60%,#4A9EFF 60%)", light: false },
  { id: "riso",      label: "RISO",      blurb: "risograph print · bold flat two-tone",            swatch: "linear-gradient(135deg,#F1E6D5 50%,#FF4D17 50%)", light: true  },
  { id: "aiso",      label: "AISO",      blurb: "royal purple + emerald · KPI card vibe",          swatch: "linear-gradient(135deg,#6f4ad9 50%,#34d399 50%)", light: false },
];
