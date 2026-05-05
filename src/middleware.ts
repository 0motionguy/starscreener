import { NextRequest, NextResponse } from "next/server";

type RouteGroup = "admin" | "pipeline" | "worker";

interface GroupLimit {
  windowMs: number;
  maxRequests: number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

const GROUP_LIMITS: Record<RouteGroup, GroupLimit> = {
  admin: { windowMs: 60_000, maxRequests: 60 },
  pipeline: { windowMs: 60_000, maxRequests: 90 },
  worker: { windowMs: 60_000, maxRequests: 120 },
};

const buckets = new Map<string, Bucket>();
const BLOCKLIST_REFRESH_MS = 60_000;

interface BlockRule {
  raw: string;
  asn: string | null;
  start: number;
  end: number;
}

let cachedBlockRules: BlockRule[] = [];
let cachedBlockRulesAt = 0;

function routeGroup(pathname: string): RouteGroup | null {
  if (pathname === "/api/worker/health") return null;
  if (pathname.startsWith("/api/admin")) return "admin";
  if (pathname.startsWith("/api/pipeline")) return "pipeline";
  if (pathname.startsWith("/api/worker")) return "worker";
  return null;
}

function isStaticHostAllowedPath(pathname: string): boolean {
  if (pathname === "/brand" || pathname.startsWith("/brand/")) return true;
  if (pathname.startsWith("/api/og/")) return true;
  if (pathname === "/opengraph-image" || pathname.startsWith("/opengraph-image/")) return true;
  if (pathname === "/twitter-image" || pathname.startsWith("/twitter-image/")) return true;
  if (pathname.includes("/opengraph-image")) return true;
  if (pathname.includes("/twitter-image")) return true;
  return false;
}

function clientIp(request: NextRequest): string {
  const cfIp = request.headers.get("cf-connecting-ip")?.trim();
  if (cfIp) return cfIp;
  const vercelIp = request.headers.get("x-vercel-forwarded-for")?.trim();
  if (vercelIp) return vercelIp;
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  return "unknown";
}

function parseIPv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d+$/.test(part)) return null;
    const octet = Number(part);
    if (!Number.isInteger(octet) || octet < 0 || octet > 255) return null;
    value = (value << 8) + octet;
  }
  return value >>> 0;
}

function parseCidrRange(cidr: string): { start: number; end: number } | null {
  const [ipPart, prefixPart] = cidr.split("/");
  if (!ipPart || prefixPart === undefined) return null;
  const ip = parseIPv4ToInt(ipPart.trim());
  if (ip === null) return null;
  if (!/^\d+$/.test(prefixPart.trim())) return null;
  const prefix = Number(prefixPart.trim());
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) return null;

  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  const start = ip & mask;
  const hostMask = (~mask) >>> 0;
  const end = (start | hostMask) >>> 0;
  return { start, end };
}

function parseBlockRule(line: string): BlockRule | null {
  const cleaned = line.trim();
  if (!cleaned || cleaned.startsWith("#")) return null;

  const tokens = cleaned.split(/\s+/);
  const rangeToken = tokens[0];
  if (!rangeToken) return null;

  const asnToken =
    tokens.find((token) => /^AS\d+$/i.test(token))?.toUpperCase() ?? null;

  if (rangeToken.includes("/")) {
    const range = parseCidrRange(rangeToken);
    if (!range) return null;
    return { raw: cleaned, asn: asnToken, ...range };
  }

  const ip = parseIPv4ToInt(rangeToken);
  if (ip === null) return null;
  return { raw: cleaned, asn: asnToken, start: ip, end: ip };
}

async function getBlockRules(
  request: NextRequest,
  now: number,
): Promise<BlockRule[]> {
  if (now - cachedBlockRulesAt < BLOCKLIST_REFRESH_MS) return cachedBlockRules;
  cachedBlockRulesAt = now;
  try {
    const url = new URL("/blocklist.txt", request.nextUrl.origin);
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      cachedBlockRules = [];
      return cachedBlockRules;
    }
    const raw = await res.text();
    cachedBlockRules = raw
      .split(/\r?\n/)
      .map(parseBlockRule)
      .filter((rule): rule is BlockRule => rule !== null);
  } catch {
    cachedBlockRules = [];
  }
  return cachedBlockRules;
}

async function matchBlockedIp(
  request: NextRequest,
  ip: string,
  now: number,
): Promise<BlockRule | null> {
  const n = parseIPv4ToInt(ip);
  if (n === null) return null;
  const rules = await getBlockRules(request, now);
  for (const rule of rules) {
    if (n >= rule.start && n <= rule.end) return rule;
  }
  return null;
}

function checkLimit(
  group: RouteGroup,
  ip: string,
  now: number,
): { allowed: boolean; remaining: number; resetAt: number; max: number } {
  const cfg = GROUP_LIMITS[group];
  const key = `${group}:${ip}`;
  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    const resetAt = now + cfg.windowMs;
    buckets.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: cfg.maxRequests - 1, resetAt, max: cfg.maxRequests };
  }

  existing.count += 1;
  if (existing.count > cfg.maxRequests) {
    return { allowed: false, remaining: 0, resetAt: existing.resetAt, max: cfg.maxRequests };
  }

  return {
    allowed: true,
    remaining: Math.max(0, cfg.maxRequests - existing.count),
    resetAt: existing.resetAt,
    max: cfg.maxRequests,
  };
}

function maybeSweep(now: number): void {
  if (buckets.size < 512) return;
  for (const [key, bucket] of buckets.entries()) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const host = request.headers.get("host")?.split(":")[0]?.toLowerCase();
  if (host === "static.trendingrepo.com") {
    const pathname = request.nextUrl.pathname;
    if (!isStaticHostAllowedPath(pathname)) {
      const redirect = new URL(request.url);
      redirect.host = "trendingrepo.com";
      redirect.protocol = "https:";
      return NextResponse.redirect(redirect, 308);
    }
  }

  const group = routeGroup(request.nextUrl.pathname);
  if (!group) return NextResponse.next();

  const now = Date.now();
  const ip = clientIp(request);
  const blocked = ip === "unknown" ? null : await matchBlockedIp(request, ip, now);
  if (blocked) {
    return NextResponse.json(
      {
        ok: false,
        error: `blocked by platform blocklist (${blocked.asn ?? "ASN-unknown"})`,
        code: "IP_BLOCKED",
      },
      { status: 403 },
    );
  }

  maybeSweep(now);
  const result = checkLimit(group, ip, now);

  if (result.allowed) return NextResponse.next();

  const retryAfterSec = Math.max(1, Math.ceil((result.resetAt - now) / 1000));
  return NextResponse.json(
    {
      ok: false,
      error: `rate limited: too many requests for ${group}`,
      code: "RATE_LIMITED",
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfterSec),
        "X-RateLimit-Limit": String(result.max),
        "X-RateLimit-Remaining": "0",
        "X-RateLimit-Reset": String(Math.ceil(result.resetAt / 1000)),
      },
    },
  );
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|\\.well-known/).*)",
  ],
};

export function __resetMiddlewareRateLimitForTests(): void {
  buckets.clear();
  cachedBlockRules = [];
  cachedBlockRulesAt = 0;
}
