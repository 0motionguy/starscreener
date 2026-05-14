const LOCAL_URL_ORIGIN = "https://trendingrepo.local";
const AUTH_ROUTE_PREFIXES = ["/sign-in", "/sign-up"] as const;

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

export function normalizeAuthRedirectUrl(
  value: string | string[] | null | undefined,
  fallback = DEFAULT_AUTH_REDIRECT,
): string {
  const raw = Array.isArray(value) ? value[0] : value;
  const candidate = raw ? decodeMaybe(raw.trim()) : "";
  if (!candidate || !candidate.startsWith("/") || candidate.startsWith("//")) {
    return fallback;
  }
  if (/[\r\n]/.test(candidate)) return fallback;

  try {
    const url = new URL(candidate, LOCAL_URL_ORIGIN);
    if (url.origin !== LOCAL_URL_ORIGIN) return fallback;
    if (isAuthRoute(url.pathname)) return fallback;
    if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/_next/")) {
      return fallback;
    }
    return `${url.pathname}${url.search}${url.hash}` || fallback;
  } catch {
    return fallback;
  }
}

export function getAuthRedirectFromSearchParams(
  searchParams: AuthSearchParams | null | undefined,
  fallback = DEFAULT_AUTH_REDIRECT,
): string {
  return normalizeAuthRedirectUrl(
    firstValue(searchParams?.redirect_url),
    fallback,
  );
}

export function buildAuthHref(
  authPath: "/sign-in" | "/sign-up",
  redirectUrl: string | string[] | null | undefined,
): string {
  const safeRedirect = normalizeAuthRedirectUrl(redirectUrl);
  const params = new URLSearchParams({ redirect_url: safeRedirect });
  return `${authPath}?${params.toString()}`;
}
