// Avatar URL host allowlist (S3.5 hardening, 2026-05-18).
//
// Closes the SSRF vector flagged in the 2026-05-18 security audit: the
// previous `avatarUrl` validator accepted any `https://` URL, which would
// let a malicious user store a URL pointing at internal services (AWS
// IMDS, Supabase pooler, Railway sidecars). Any server-side fetch of the
// avatar (OG card render, email template, image proxy) would then leak
// the internal response.
//
// Strategy: enforce a fixed allowlist of trusted avatar CDNs at the API
// boundary. Anything outside the list is rejected. The list is small
// because we only need to cover the auth providers + the gravatar
// fallback most onboarding flows touch.
//
// If a future feature requires a new provider, add it here AND audit
// every server-side fetcher that reads `profiles.avatarUrl` to make sure
// the new host can't be coerced into hitting an internal address.

const ALLOWED_AVATAR_HOSTS: ReadonlySet<string> = new Set([
  // Clerk user pictures
  "img.clerk.com",
  "images.clerk.dev",
  // Google identity avatars (used by Google OAuth via Clerk)
  "lh3.googleusercontent.com",
  "lh4.googleusercontent.com",
  "lh5.googleusercontent.com",
  "lh6.googleusercontent.com",
  // GitHub avatars
  "avatars.githubusercontent.com",
  // Gravatar fallback
  "secure.gravatar.com",
  "www.gravatar.com",
  "gravatar.com",
]);

/**
 * Returns true when the URL is a syntactically valid HTTPS URL pointing at
 * a host in the allowlist. Anything else (http, javascript:, data:, IP
 * literals, RFC-1918, AWS metadata host) returns false.
 */
export function isAllowedAvatarUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  // Reject userinfo (`https://user:pass@host`) — confuses the host check
  // and never appears in legitimate CDN URLs.
  if (url.username || url.password) return false;
  const host = url.hostname.toLowerCase();
  if (!ALLOWED_AVATAR_HOSTS.has(host)) return false;
  return true;
}

export const AVATAR_URL_ALLOWLIST_HINT = `Allowed hosts: ${[
  ...ALLOWED_AVATAR_HOSTS,
].join(", ")}`;
