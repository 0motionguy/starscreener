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
 * Safe stringifier for JSON-LD bodies that get written into a `<script>` tag
 * via `dangerouslySetInnerHTML`. JSON.stringify by itself does NOT escape
 * `</script>` (it leaves `<` and `>` raw), so a future contributor who pipes
 * a user-controlled string into one of these blobs would silently introduce
 * XSS. Today every interpolated value is allowlisted (static SITE_*
 * constants or repo slugs that already passed `/^[A-Za-z0-9._-]+$/`), so
 * this is defense-in-depth — pin the safe pattern in one helper so the four
 * call sites can't drift. Also escapes U+2028/U+2029 which break JS string
 * literals in some legacy parsers.
 */
export function safeJsonLd(obj: unknown): string {
  return JSON.stringify(obj)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
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
