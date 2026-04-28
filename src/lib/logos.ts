// Logo URL helpers — keeps the rules for "where does <entity>'s avatar
// come from" in one file so feed surfaces can render logos consistently
// without each one rolling its own GitHub-vs-Clearbit-vs-Gravatar logic.
//
// All helpers return either a full URL or null. Callers feed both into
// <EntityLogo />, which renders the image when present and a deterministic
// 1-letter monogram tile otherwise — so a missing logo never leaves a
// blank slot on the page.

/**
 * GitHub owner avatar — 40px is the canonical small size; pass other
 * sizes for different surface densities. Public, no auth, very stable.
 */
export function repoLogoUrl(fullName: string | null | undefined, size = 40): string | null {
  if (!fullName) return null;
  const owner = fullName.split("/", 1)[0]?.trim();
  if (!owner) return null;
  return `https://github.com/${encodeURIComponent(owner)}.png?size=${size}`;
}

/**
 * Owner avatar derived from an `owner/name` pair. Equivalent to
 * repoLogoUrl when both halves are spliced; offered separately for sites
 * that store owner + name as discrete fields.
 */
export function repoOwnerLogoUrl(owner: string | null | undefined, size = 40): string | null {
  if (!owner) return null;
  return `https://github.com/${encodeURIComponent(owner)}.png?size=${size}`;
}

/**
 * npm package logo — npm itself doesn't expose package icons, so we
 * fall back to the linked GitHub owner's avatar. Returns null when no
 * GitHub link is attached.
 */
export function npmLogoUrl(linkedRepoFullName: string | null | undefined, size = 40): string | null {
  return repoLogoUrl(linkedRepoFullName, size);
}

/**
 * Per-source user avatar. Pass through the data when the scraper
 * captured one; otherwise return null and let the monogram render.
 *
 * Sources that ship avatars in their JSON:
 *   - bluesky (`author.avatar`)
 *   - devto (`author.profile_image`)
 *   - twitter (`author.avatarUrl`)
 *   - lobsters (`avatar_url` if scraped)
 * Sources that don't expose avatars at all:
 *   - hn (HN has no concept of avatars)
 *   - reddit (we don't currently fetch user metadata)
 */
export function userLogoUrl(providedUrl: string | null | undefined): string | null {
  if (!providedUrl) return null;
  const trimmed = providedUrl.trim();
  if (trimmed.length === 0) return null;
  return trimmed;
}

/**
 * Company logo via Google's favicon service. We delegate to the existing
 * `lib/logo-url.ts` helpers (Clearbit was retired 2023; Google Favicons
 * is the reliable free option). Accepts either a bare domain or a full
 * URL — see logo-url.ts for parsing rules. Returns null when no domain
 * can be extracted, in which case EntityLogo falls back to the monogram.
 */
export {
  logoFromDomain as companyLogoUrl,
  logoFromDomain as urlLogoUrl,
  resolveLogoUrl,
} from "./logo-url";

/**
 * Deterministic monogram color picked from the entity's name — used by
 * EntityLogo when no source URL is available so the fallback isn't a
 * dead grey square. 8 hues give enough variety on dense feed views.
 */
const MONOGRAM_PALETTE = [
  { bg: "rgba(146, 151, 246, 0.16)", border: "rgba(146, 151, 246, 0.4)", fg: "#a8acf8" },
  { bg: "rgba(58, 214, 197, 0.16)", border: "rgba(58, 214, 197, 0.4)", fg: "#5fe6d3" },
  { bg: "rgba(251, 191, 36, 0.16)", border: "rgba(251, 191, 36, 0.4)", fg: "#f5d778" },
  { bg: "rgba(244, 114, 182, 0.16)", border: "rgba(244, 114, 182, 0.4)", fg: "#f9b4d9" },
  { bg: "rgba(34, 197, 94, 0.16)", border: "rgba(34, 197, 94, 0.4)", fg: "#5be08e" },
  { bg: "rgba(255, 110, 15, 0.16)", border: "rgba(255, 110, 15, 0.4)", fg: "#ff9447" },
  { bg: "rgba(167, 139, 250, 0.16)", border: "rgba(167, 139, 250, 0.4)", fg: "#c1abf9" },
  { bg: "rgba(56, 189, 248, 0.16)", border: "rgba(56, 189, 248, 0.4)", fg: "#7dd3fc" },
] as const;

export type MonogramTone = (typeof MONOGRAM_PALETTE)[number];

export function monogramTone(name: string | null | undefined): MonogramTone {
  if (!name) return MONOGRAM_PALETTE[0];
  let hash = 0;
  for (const ch of name) {
    hash = (hash * 33 + ch.charCodeAt(0)) >>> 0;
  }
  return MONOGRAM_PALETTE[hash % MONOGRAM_PALETTE.length];
}

/**
 * Single-character monogram letter — strips leading `r/`, `@`, `/` so
 * `r/ClaudeCode` → `C` and `@vercel` → `V`. Always uppercase.
 */
export function monogramInitial(name: string | null | undefined): string {
  if (!name) return "?";
  const cleaned = name.replace(/^[@\/]+/, "").replace(/^r\//i, "").trim();
  return (cleaned.charAt(0) || "?").toUpperCase();
}
