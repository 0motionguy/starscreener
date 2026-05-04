// V3 surface-mode registry. Three sizes (sm / md / lg) that the picker
// writes to `localStorage["trendingrepo-v3-surface"]` and applies via
// the `html[data-surface]` attribute. Scopes in globals.css use that
// attribute to scale the type / spacing tokens site-wide. Each entry
// carries the picker preview metadata (label + the px value rendered
// inside the swatch) so the chrome doesn't have to re-derive from CSS.

export interface V3BgTheme {
  /** Used in localStorage + on `html[data-surface]`. */
  id: "sm" | "md" | "lg";
  /** Picker label. */
  label: string;
  /** Pixel size shown inside the Aa preview chip. */
  previewSize: number;
}

export const V3_BG_THEME_STORAGE_KEY = "trendingrepo-v3-surface";
export const V3_DEFAULT_BG_ID: V3BgTheme["id"] = "md";

export const V3_BG_THEMES: V3BgTheme[] = [
  { id: "sm", label: "Compact", previewSize: 9 },
  { id: "md", label: "Default", previewSize: 11 },
  { id: "lg", label: "Comfort", previewSize: 13 },
];

export function getV3BgTheme(id: string | null | undefined): V3BgTheme {
  return (
    V3_BG_THEMES.find((theme) => theme.id === id) ??
    V3_BG_THEMES.find((theme) => theme.id === V3_DEFAULT_BG_ID) ??
    V3_BG_THEMES[0]
  );
}
