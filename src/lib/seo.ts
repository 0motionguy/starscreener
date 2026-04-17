// StarScreener — SEO helpers
//
// Centralised site-URL resolution + absolute-URL helpers so every page can
// emit a correct canonical + metadataBase without duplicating logic.

export const SITE_URL: string =
  process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3008";

export const SITE_NAME = "StarScreener";
export const SITE_TAGLINE = "Repo Momentum Terminal";
export const SITE_DESCRIPTION =
  "The momentum terminal for GitHub repos — discover trending open-source projects before they blow up.";

/**
 * Resolve a site-relative path to an absolute URL using the configured
 * NEXT_PUBLIC_APP_URL (falls back to localhost:3008). Safe to use in metadata
 * `alternates.canonical`, structured data, and sitemaps.
 */
export function absoluteUrl(path: string = "/"): string {
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  const base = SITE_URL.replace(/\/+$/, "");
  const rel = path.startsWith("/") ? path : `/${path}`;
  return `${base}${rel}`;
}

/**
 * Brand palette literal hex values. Token values from globals.css — used by
 * OG image generators (ImageResponse) where CSS vars can't be resolved.
 */
export const OG_COLORS = {
  bg: "#151419", // Dark Void
  bgSecondary: "#1b1b1e", // Gluon Grey
  bgTertiary: "#262626", // Slate
  brand: "#F56E0F", // Liquid Lava orange
  brandDim: "rgba(245, 110, 15, 0.15)",
  textPrimary: "#FBFBFB", // Snow
  textSecondary: "#C4C4C6",
  textTertiary: "#878787",
  textMuted: "#5A5A5C",
  up: "#22C55E",
  down: "#EF4444",
  border: "#2B2B2F",
} as const;
