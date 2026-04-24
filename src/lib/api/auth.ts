// Shared auth helpers for pipeline + admin + user-scoped endpoints.
//
// Three distinct auth surfaces live here:
//
//   - verifyCronAuth  → CRON_SECRET, used by cron/pipeline jobs.
//   - verifyAdminAuth → ADMIN_TOKEN, used by browser-facing admin tools.
//                        NO fallback to CRON_SECRET (P0 security fix): cron
//                        secret is held by many unattended jobs; admin UI
//                        lives in browser memory. Blast radii must not cross.
//   - verifyUserAuth  → USER_TOKEN / USER_TOKENS_JSON, used by per-user
//                        endpoints (alerts). Maps a caller-supplied bearer
//                        token to a stable userId. Prevents the body/query
//                        `userId=` forgery that previously let anyone read,
//                        create, or delete another user's rules.
//
// Token comparison uses crypto.timingSafeEqual to blunt remote timing attacks
// on the bearer-token compare (P-108, F-SENT-001 / F-SENT-008).

import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { verifySession } from "./session";

/** Name of the HMAC-signed session cookie set by /api/auth/session. */
export const SESSION_COOKIE_NAME = "ss_user";

export type AuthVerdict =
  | { kind: "ok" }
  | { kind: "unauthorized" }
  | { kind: "not_configured" };

export type InternalAgentAuthVerdict =
  | { kind: "ok"; principal: string }
  | { kind: "unauthorized" }
  | { kind: "not_configured" };

export type UserAuthVerdict =
  | { kind: "ok"; userId: string }
  | { kind: "unauthorized" }
  | { kind: "not_configured" };

/**
 * Constant-time string equality. Length mismatches short-circuit because
 * length is not a secret — the content of the expected secret is.
 *
 * Exported for tests; production callers go through verify*Auth.
 */
export function timingSafeEqualStr(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/**
 * Extract the bearer value from an Authorization header. Accepts both
 *   Authorization: Bearer <token>
 * and the legacy raw
 *   Authorization: <token>
 * form. Also accepts a `x-user-token: <token>` header for user auth.
 */
function extractBearer(request: NextRequest, extraHeader?: string): string | null {
  if (extraHeader) {
    const raw = request.headers.get(extraHeader)?.trim();
    if (raw) return raw;
  }
  const header = request.headers.get("authorization");
  if (!header) return null;
  const trimmed = header.trim();
  if (trimmed.startsWith("Bearer ")) return trimmed.slice("Bearer ".length).trim();
  return trimmed;
}

export function verifyCronAuth(request: NextRequest): AuthVerdict {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      return { kind: "not_configured" };
    }
    return { kind: "ok" };
  }
  const header = request.headers.get("authorization");
  if (!header) return { kind: "unauthorized" };
  const trimmed = header.trim();
  if (timingSafeEqualStr(trimmed, secret)) return { kind: "ok" };
  if (trimmed.startsWith("Bearer ")) {
    const candidate = trimmed.slice("Bearer ".length);
    return timingSafeEqualStr(candidate, secret)
      ? { kind: "ok" }
      : { kind: "unauthorized" };
  }
  return { kind: "unauthorized" };
}

// One-shot warning so operators see "ADMIN_TOKEN missing" exactly once per
// cold-start instead of on every request. Process-local; serverless cold
// starts reset it, which is the desired cadence.
let adminConfigWarned = false;

/**
 * Admin-console auth for browser-facing admin tools (moderation queue, etc).
 *
 * Requires a dedicated `ADMIN_TOKEN`. We intentionally do NOT fall back to
 * `CRON_SECRET` — cron secret is held by every unattended job and has a
 * much wider blast radius than admin console access should carry.
 *
 * When `ADMIN_TOKEN` is unset we return `not_configured` (503) rather than
 * silently allowing cron callers through, and emit a one-shot console.warn
 * so operators notice during deploy. Once `ADMIN_TOKEN` is provisioned the
 * warning stops firing.
 */
export function verifyAdminAuth(request: NextRequest): AuthVerdict {
  const adminToken = process.env.ADMIN_TOKEN;
  if (!adminToken) {
    if (!adminConfigWarned) {
      adminConfigWarned = true;
      console.warn(
        "[auth] ADMIN_TOKEN env is unset — admin endpoints will return 503. " +
          "Set ADMIN_TOKEN to a 32+ character random string (distinct from CRON_SECRET).",
      );
    }
    return { kind: "not_configured" };
  }
  const header = request.headers.get("authorization");
  if (!header) return { kind: "unauthorized" };
  const trimmed = header.trim();
  if (timingSafeEqualStr(trimmed, adminToken)) return { kind: "ok" };
  if (trimmed.startsWith("Bearer ")) {
    const candidate = trimmed.slice("Bearer ".length);
    return timingSafeEqualStr(candidate, adminToken)
      ? { kind: "ok" }
      : { kind: "unauthorized" };
  }
  return { kind: "unauthorized" };
}

let cachedTokens: Map<string, string> | null = null;
let cachedTokensRaw: string | undefined;

function parseInternalAgentTokens(): Map<string, string> {
  const raw = process.env.INTERNAL_AGENT_TOKENS_JSON;
  if (raw === cachedTokensRaw && cachedTokens) {
    return cachedTokens;
  }

  cachedTokensRaw = raw;
  if (!raw) {
    cachedTokens = new Map();
    return cachedTokens;
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const entries = Object.entries(parsed)
      .filter(
        (entry): entry is [string, string] =>
          typeof entry[0] === "string" && typeof entry[1] === "string" && entry[1].trim() !== "",
      )
      .map(([principal, token]) => [principal.trim(), token.trim()] as const);

    cachedTokens = new Map(entries);
  } catch {
    cachedTokens = new Map();
  }

  return cachedTokens;
}

export function verifyInternalAgentAuth(
  request: NextRequest,
): InternalAgentAuthVerdict {
  const header = request.headers.get("authorization")?.trim() ?? "";
  const bearer = header.startsWith("Bearer ")
    ? header.slice("Bearer ".length)
    : header;

  const tokens = parseInternalAgentTokens();
  if (tokens.size > 0) {
    for (const [principal, token] of tokens.entries()) {
      if (timingSafeEqualStr(bearer, token)) {
        return { kind: "ok", principal };
      }
    }
    return { kind: "unauthorized" };
  }

  const cron = verifyCronAuth(request);
  if (cron.kind === "ok") {
    return { kind: "ok", principal: "cron_secret" };
  }
  if (cron.kind === "not_configured") {
    return { kind: "not_configured" };
  }
  return { kind: "unauthorized" };
}

// -----------------------------------------------------------------------------
// User auth (per-user endpoints — alerts, rules)
// -----------------------------------------------------------------------------

let cachedUserTokens: Map<string, string> | null = null;
let cachedUserTokensRaw: string | undefined;
let userConfigWarned = false;
let userDevFallbackWarned = false;

/**
 * Parse USER_TOKENS_JSON into a Map<token, userId>. Cached on the raw string
 * so repeat lookups on the same env value don't re-parse.
 */
function parseUserTokens(): Map<string, string> {
  const raw = process.env.USER_TOKENS_JSON;
  if (raw === cachedUserTokensRaw && cachedUserTokens) {
    return cachedUserTokens;
  }

  cachedUserTokensRaw = raw;
  if (!raw) {
    cachedUserTokens = new Map();
    return cachedUserTokens;
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const entries = Object.entries(parsed)
      .filter(
        (entry): entry is [string, string] =>
          typeof entry[0] === "string" &&
          typeof entry[1] === "string" &&
          entry[0].trim() !== "" &&
          entry[1].trim() !== "",
      )
      .map(([token, userId]) => [token.trim(), userId.trim()] as const);
    cachedUserTokens = new Map(entries);
  } catch {
    cachedUserTokens = new Map();
  }
  return cachedUserTokens;
}

/**
 * Read the ss_user cookie value without depending on next/headers, so this
 * helper stays usable from unit tests that pass a Headers-only shim.
 */
function readSessionCookie(request: NextRequest): string | null {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return null;
  // RFC 6265 — cookies separated by "; ". Values can contain "=" in base64url
  // variants so we only split on the first "=".
  for (const part of cookieHeader.split(";")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const name = trimmed.slice(0, eq).trim();
    if (name !== SESSION_COOKIE_NAME) continue;
    const value = trimmed.slice(eq + 1).trim();
    return value.length > 0 ? value : null;
  }
  return null;
}

/**
 * Per-user auth for endpoints that mutate user-scoped state (alert rules,
 * read-markers). Accepts, in priority order:
 *
 *   1. `x-user-token: <token>`                        (server-to-server / CLI)
 *   2. `Authorization: Bearer <token>` / raw          (server-to-server / CLI)
 *   3. `Cookie: ss_user=<signed-session>`             (browser UI)
 *
 * Header auth wins when both a header and a cookie are present — used for
 * test rigs and server-to-server calls that know a USER_TOKEN.
 *
 * Env config, in priority order:
 *
 *   1. USER_TOKENS_JSON — JSON `{ "<token>": "<userId>" }` (multi-user)
 *   2. USER_TOKEN       — single token → userId "local"    (single-user dev)
 *
 * Cookie auth requires `SESSION_SECRET` (used to HMAC the cookie value). The
 * cookie path is additive — existing header-based integrations still work
 * whether SESSION_SECRET is set or not.
 *
 * If no header/cookie is present AND no token env is set:
 *   - production → not_configured (503). Operators MUST provision auth.
 *   - development → ok with userId "local" (loud one-shot warn). Keeps the
 *     existing dev UX working while the single-user token contract rolls out.
 */
export function verifyUserAuth(request: NextRequest): UserAuthVerdict {
  const multi = parseUserTokens();
  const singleToken = process.env.USER_TOKEN?.trim();
  const headerBearer = extractBearer(request, "x-user-token");

  // 1. Cookie — HMAC-signed ss_user. verifySession returns null when
  //    SESSION_SECRET is unset or the cookie is malformed/expired/tampered.
  //    We evaluate this BEFORE the header branch so that a browser that
  //    forwards a stale Authorization header alongside a good cookie still
  //    authenticates. The explicit "header wins" contract is preserved by
  //    the early-return in step 2 below.
  const cookieValue = readSessionCookie(request);
  const cookiePayload = cookieValue ? verifySession(cookieValue) : null;

  // 2. Header path — when a header is provided, it wins over the cookie
  //    IF it matches a configured env token. This matches the pre-cookie
  //    contract: server-to-server callers with a valid USER_TOKEN should
  //    see their mapped userId, not a browser session's.
  if (headerBearer) {
    if (multi.size > 0) {
      for (const [token, userId] of multi.entries()) {
        if (timingSafeEqualStr(headerBearer, token)) {
          return { kind: "ok", userId };
        }
      }
    } else if (singleToken && timingSafeEqualStr(headerBearer, singleToken)) {
      return { kind: "ok", userId: "local" };
    }
    // Header didn't match any env token. If we have a valid cookie AND
    // env tokens are actually configured, fall through to the cookie
    // (keeps browsers working). Otherwise we must fall through to the
    // env-less / unauthorized branches below.
    if (cookiePayload && (multi.size > 0 || singleToken)) {
      return { kind: "ok", userId: cookiePayload.userId };
    }
    // If env tokens ARE configured, the header was the caller's explicit
    // choice and it didn't match — reject now.
    if (multi.size > 0 || singleToken) {
      return { kind: "unauthorized" };
    }
    // Env tokens NOT configured — fall through to the env-less branch so
    // we return "not_configured" (prod) / "ok local" (dev). The header is
    // meaningless without env config, same as it was pre-cookie.
  } else if (cookiePayload) {
    // 3. Cookie-only caller (browser). Accept regardless of env-token state.
    return { kind: "ok", userId: cookiePayload.userId };
  }

  // 4. No valid header match and no valid cookie. Honor the env-less
  //    contract: in prod → not_configured (503); in dev → ok/local (loud
  //    one-shot warn).
  if (multi.size === 0 && !singleToken) {
    if (process.env.NODE_ENV === "production") {
      if (!userConfigWarned) {
        userConfigWarned = true;
        console.warn(
          "[auth] USER_TOKEN / USER_TOKENS_JSON env is unset in production — " +
            "user-scoped endpoints (alerts, rules) will return 503. " +
            "Set USER_TOKEN for single-user or USER_TOKENS_JSON for multi-user.",
        );
      }
      return { kind: "not_configured" };
    }
    if (!userDevFallbackWarned) {
      userDevFallbackWarned = true;
      console.warn(
        "[auth] USER_TOKEN / USER_TOKENS_JSON unset in development — " +
          "falling back to userId=\"local\" WITHOUT auth. Production will require a token.",
      );
    }
    return { kind: "ok", userId: "local" };
  }

  // 5. Env tokens configured, but nothing valid was presented.
  return { kind: "unauthorized" };
}

/**
 * Returns a ready-to-send NextResponse for the non-ok verdicts, or null if
 * the verdict is "ok". Handlers can do:
 *
 *   const deny = authFailureResponse(verifyCronAuth(request));
 *   if (deny) return deny;
 */
export function authFailureResponse(
  verdict: AuthVerdict,
): NextResponse | null {
  if (verdict.kind === "ok") return null;
  if (verdict.kind === "unauthorized") {
    return NextResponse.json({ ok: false, reason: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json(
    { ok: false, reason: "CRON_SECRET not configured" },
    { status: 503 },
  );
}

/**
 * Admin variant. Separate from authFailureResponse so the 503 body names the
 * admin env var rather than CRON_SECRET.
 */
export function adminAuthFailureResponse(
  verdict: AuthVerdict,
): NextResponse | null {
  if (verdict.kind === "ok") return null;
  if (verdict.kind === "unauthorized") {
    return NextResponse.json({ ok: false, reason: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json(
    { ok: false, reason: "admin endpoint not configured (ADMIN_TOKEN unset)" },
    { status: 503 },
  );
}

export function userAuthFailureResponse(
  verdict: UserAuthVerdict,
): NextResponse | null {
  if (verdict.kind === "ok") return null;
  if (verdict.kind === "unauthorized") {
    return NextResponse.json(
      { ok: false, error: "unauthorized", code: "UNAUTHORIZED" },
      { status: 401 },
    );
  }
  return NextResponse.json(
    {
      ok: false,
      error:
        "user auth not configured (set USER_TOKEN or USER_TOKENS_JSON in production)",
      code: "AUTH_NOT_CONFIGURED",
    },
    { status: 503 },
  );
}

export function internalAgentAuthFailureResponse(
  verdict: InternalAgentAuthVerdict,
): NextResponse | null {
  if (verdict.kind === "ok") return null;
  if (verdict.kind === "unauthorized") {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "UNAUTHORIZED",
          message: "missing or invalid internal agent token",
          retryable: false,
        },
      },
      { status: 401 },
    );
  }
  return NextResponse.json(
    {
      ok: false,
      error: {
        code: "AUTH_NOT_CONFIGURED",
        message: "internal agent auth is not configured",
        retryable: true,
      },
    },
    { status: 503 },
  );
}

// Test-only hook to reset the one-shot warning flags between cases.
export function __resetAuthWarningsForTests(): void {
  adminConfigWarned = false;
  userConfigWarned = false;
  userDevFallbackWarned = false;
  cachedUserTokens = null;
  cachedUserTokensRaw = undefined;
}
