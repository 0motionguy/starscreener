import type { NextRequest } from "next/server";

function isLocalHostname(hostname: string | null): boolean {
  if (!hostname) return false;
  const normalized = hostname.trim().toLowerCase();
  return (
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized.endsWith(".localhost")
  );
}

/**
 * Trust contract for forwarded client IP headers:
 * - Production: trust x-forwarded-for only on Vercel runtime.
 * - Local dev: trust x-forwarded-for only for localhost requests.
 * - Else: fail closed and return "unknown".
 */
function canTrustForwardedFor(request: Request): boolean {
  if (process.env.VERCEL === "1") return true;
  try {
    const url = new URL(request.url);
    if (isLocalHostname(url.hostname)) return true;
  } catch {
    // Ignore parse errors and fail closed.
  }
  const hostHeader = request.headers.get("host");
  if (!hostHeader) return false;
  const hostname = hostHeader.split(":")[0] ?? hostHeader;
  return isLocalHostname(hostname);
}

function firstForwardedAddress(value: string | null): string | null {
  if (!value) return null;
  const first = value.split(",")[0]?.trim();
  if (!first) return null;
  return first;
}

export function getClientIp(request: Request): string {
  if (canTrustForwardedFor(request)) {
    const forwarded = firstForwardedAddress(
      request.headers.get("x-forwarded-for"),
    );
    if (forwarded) return forwarded;
  }

  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  return "unknown";
}
