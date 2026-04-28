// V3 background-theme registry. Five swatches that the picker writes
// to `localStorage["trendingrepo-v3-bg"]` and applies via the
// `html[data-bg-theme]` attribute. Each entry carries its own swatch
// palette (`bg`, `bgEdge`, `ink`) so the picker can render a faithful
// preview chip without re-deriving from the CSS at render time.

export interface V3BgTheme {
  /** Used in localStorage + on `html[data-bg-theme]`. */
  id: string;
  /** Picker label. */
  label: string;
  /** Family — controls the picker's category divider. */
  family: "dark" | "light";
  /** Swatch fill. */
  bg: string;
  /** Hairline / border tone for the swatch outline. */
  bgEdge: string;
  /** Ink colour shown as a `Aa` glyph inside the swatch. */
  ink: string;
}

export const V3_BG_THEME_STORAGE_KEY = "trendingrepo-v3-bg";
export const V3_DEFAULT_BG_ID = "black";

export const V3_BG_THEMES: V3BgTheme[] = [
  {
    id: "black",
    label: "Void",
    family: "dark",
    bg: "#08090a",
    bgEdge: "#272c33",
    ink: "#e6e7e8",
  },
  {
    id: "graphite",
    label: "Graphite",
    family: "dark",
    bg: "#0c0c12",
    bgEdge: "#2a2a36",
    ink: "#e6e7e8",
  },
  {
    id: "slate",
    label: "Slate",
    family: "dark",
    bg: "#1a1a1f",
    bgEdge: "#3a3a44",
    ink: "#eef0f2",
  },
  {
    id: "creme",
    label: "Creme",
    family: "dark",
    bg: "#1a1a1f",
    bgEdge: "#3a3a44",
    ink: "#f7f1de",
  },
  {
    id: "linen",
    label: "Linen",
    family: "light",
    bg: "#f4eee2",
    bgEdge: "#d4cab2",
    ink: "#18140b",
  },
];

export function getV3BgTheme(id: string | null | undefined): V3BgTheme {
  return (
    V3_BG_THEMES.find((theme) => theme.id === id) ??
    V3_BG_THEMES.find((theme) => theme.id === V3_DEFAULT_BG_ID) ??
    V3_BG_THEMES[0]
  );
}
