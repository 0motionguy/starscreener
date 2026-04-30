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
    id: "indigo",
    label: "Indigo",
    acc: "#9297f6",
    accHover: "#a8acf8",
    accDim: "#555bd8",
    accSoft: "rgba(146, 151, 246, 0.14)",
    accGlow: "rgba(146, 151, 246, 0.45)",
  },
  {
    id: "lime",
    label: "Lime",
    acc: "#def135",
    accHover: "#e8fb55",
    accDim: "#a9b827",
    accSoft: "rgba(222, 241, 53, 0.14)",
    accGlow: "rgba(222, 241, 53, 0.45)",
  },
  {
    id: "cyan",
    label: "Cyan",
    acc: "#3ad6c5",
    accHover: "#63e1d3",
    accDim: "#26a597",
    accSoft: "rgba(58, 214, 197, 0.14)",
    accGlow: "rgba(58, 214, 197, 0.45)",
  },
  {
    id: "magenta",
    label: "Magenta",
    acc: "#e879f9",
    accHover: "#f0a2ff",
    accDim: "#a855f7",
    accSoft: "rgba(232, 121, 249, 0.14)",
    accGlow: "rgba(232, 121, 249, 0.45)",
  },
];

export function getV3Theme(id: string | null | undefined): V3AccentTheme {
  return (
    V3_ACCENT_THEMES.find((theme) => theme.id === id) ??
    V3_ACCENT_THEMES.find((theme) => theme.id === V3_DEFAULT_THEME_ID) ??
    V3_ACCENT_THEMES[0]
  );
}
