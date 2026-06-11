const LOCAL_URL_ORIGIN = "https://trendingrepo.local";
const AUTH_ROUTE_PREFIXES = ["/sign-in", "/sign-up"] as const;
const AUTH_REDIRECT_PARAM_KEYS = [
  "redirect_url",
  "sign_in_fallback_redirect_url",
  "sign_up_fallback_redirect_url",
] as const;
const SAME_SITE_REDIRECT_ORIGINS = new Set([
  LOCAL_URL_ORIGIN,
  "https://trendingrepo.com",
  "https://www.trendingrepo.com",
]);

export const DEFAULT_AUTH_REDIRECT = "/you";

export type AuthSearchParams = Record<string, string | string[] | undefined>;

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function decodeMaybe(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function isAuthRoute(pathname: string): boolean {
  return AUTH_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function configuredAppOrigin(): string | undefined {
  const raw =
    process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_SITE_URL;
  if (!raw) return undefined;
  try {
    return new URL(raw).origin;
  } catch {
    return undefined;
  }
}

function isSameSiteRedirectOrigin(origin: string): boolean {
  return (
    SAME_SITE_REDIRECT_ORIGINS.has(origin) || origin === configuredAppOrigin()
  );
}

function normalizeAuthRedirectCandidate(
  value: string | string[] | null | undefined,
): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  const candidate = raw ? decodeMaybe(raw.trim()) : "";
  if (!candidate || candidate.startsWith("//")) return null;
  if (/[\r\n]/.test(candidate)) return null;

  let url: URL;
  try {
    url = candidate.startsWith("/")
      ? new URL(candidate, LOCAL_URL_ORIGIN)
      : new URL(candidate);
  } catch {
    return null;
  }

  if (!isSameSiteRedirectOrigin(url.origin)) return null;
  if (isAuthRoute(url.pathname)) return null;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/_next/")) {
    return null;
  }
  return `${url.pathname}${url.search}${url.hash}` || null;
}

export function normalizeAuthRedirectUrl(
  value: string | string[] | null | undefined,
  fallback = DEFAULT_AUTH_REDIRECT,
): string {
  return normalizeAuthRedirectCandidate(value) ?? fallback;
}

export function getAuthRedirectFromSearchParams(
  searchParams: AuthSearchParams | null | undefined,
  fallback = DEFAULT_AUTH_REDIRECT,
): string {
  for (const key of AUTH_REDIRECT_PARAM_KEYS) {
    const safeRedirect = normalizeAuthRedirectCandidate(
      firstValue(searchParams?.[key]),
    );
    if (safeRedirect) return safeRedirect;
  }
  return fallback;
}

export function buildAuthHref(
  authPath: "/sign-in" | "/sign-up",
  redirectUrl: string | string[] | null | undefined,
): string {
  const safeRedirect = normalizeAuthRedirectUrl(redirectUrl);
  const params = new URLSearchParams({ redirect_url: safeRedirect });
  return `${authPath}?${params.toString()}`;
}
