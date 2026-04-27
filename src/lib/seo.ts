// TrendingRepo — SEO helpers
//
// Centralised site-URL resolution + absolute-URL helpers so every page can
// emit a correct canonical + metadataBase without duplicating logic.

export const SITE_URL: string =
  process.env.NEXT_PUBLIC_APP_URL ?? "https://trendingrepo.com";

export const SITE_NAME = "TrendingRepo";
export const SITE_TAGLINE = "The trend map for open source";
export const SITE_DESCRIPTION =
  "The trend map for open source. See what's heating up on GitHub, Reddit, Hacker News, ProductHunt, Bluesky, and dev.to — one live terminal for every signal.";

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
 * V2 brand palette literal hex values. Mirrors the --v2-* tokens defined
 * in globals.css — used by OG image generators (ImageResponse) where CSS
 * vars can't be resolved.
 */
export const OG_COLORS = {
  bg: "#08090a", // --v2-bg-000 (page edge / deepest surface)
  bgSecondary: "#0d0f10", // --v2-bg-050 (default card)
  bgTertiary: "#13161a", // --v2-bg-100 (well / hover)
  brand: "#f56e0f", // --v2-acc (Liquid Lava orange)
  brandDim: "rgba(245, 110, 15, 0.14)", // --v2-acc-soft
  textPrimary: "#ffffff", // --v2-ink-000
  textSecondary: "#e6e7e8", // --v2-ink-100 (body)
  textTertiary: "#aab0b6", // --v2-ink-200
  textMuted: "#7d848c", // --v2-ink-300 (mono captions)
  up: "#22c55e", // --v2-sig-green
  down: "#ff4d4d", // --v2-sig-red
  border: "#1c2024", // --v2-line-100
} as const;
