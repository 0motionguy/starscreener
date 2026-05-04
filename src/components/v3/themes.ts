// V3 accent registry — five named themes that the picker writes to
// `localStorage["trendingrepo-v3-accent"]` and applies via the
// `html[data-theme]` attribute. Each entry carries the brand colours
// the picker needs to paint its swatch chrome; the actual site-wide
// recolour is driven by CSS `[data-theme="<id>"]` scopes in globals.css
// that override --v4-acc and friends.

export interface V3AccentTheme {
  id: string;
  label: string;
  acc: string;
  accHover: string;
  accDim: string;
  accSoft: string;
  accGlow: string;
}

export const V3_THEME_STORAGE_KEY = "trendingrepo-v3-accent";
export const V3_DEFAULT_THEME_ID = "lava";

export const V3_ACCENT_THEMES: V3AccentTheme[] = [
  {
    id: "lava",
    label: "Lava",
    acc: "#ff6b35",
    accHover: "#ff8458",
    accDim: "#c44a1f",
    accSoft: "rgba(255, 107, 53, 0.14)",
    accGlow: "rgba(255, 107, 53, 0.45)",
  },
  {
    id: "blue",
    label: "Blue",
    acc: "#60a5fa",
    accHover: "#93c5fd",
    accDim: "#1d4ed8",
    accSoft: "rgba(96, 165, 250, 0.14)",
    accGlow: "rgba(96, 165, 250, 0.45)",
  },
  {
    id: "yellow",
    label: "Yellow",
    acc: "#facc15",
    accHover: "#fde047",
    accDim: "#a16207",
    accSoft: "rgba(250, 204, 21, 0.14)",
    accGlow: "rgba(250, 204, 21, 0.45)",
  },
  {
    id: "green",
    label: "Green",
    acc: "#4ade80",
    accHover: "#86efac",
    accDim: "#15803d",
    accSoft: "rgba(74, 222, 128, 0.14)",
    accGlow: "rgba(74, 222, 128, 0.45)",
  },
  {
    id: "purple",
    label: "Purple",
    acc: "#c084fc",
    accHover: "#d8b4fe",
    accDim: "#7e22ce",
    accSoft: "rgba(192, 132, 252, 0.14)",
    accGlow: "rgba(192, 132, 252, 0.45)",
  },
];

export function getV3Theme(id: string | null | undefined): V3AccentTheme {
  return (
    V3_ACCENT_THEMES.find((theme) => theme.id === id) ??
    V3_ACCENT_THEMES.find((theme) => theme.id === V3_DEFAULT_THEME_ID) ??
    V3_ACCENT_THEMES[0]
  );
}
