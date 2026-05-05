// GET /api/openapi.json
//
// Serves the OpenAPI 3.1 spec for the public + auth-gated API surface as
// JSON. The source of truth is `docs/openapi.yaml` (human-edited); the
// sibling `docs/openapi.json` is the build-time conversion that this route
// reads at request time. Both files are committed so the server has no
// runtime YAML dependency (see the sync contract at the top of the YAML).
//
// Swagger UI / Redoc / Postman / any OpenAPI-aware tool can consume the
// response. Cache at the edge for an hour with a generous stale-while-
// revalidate window — the spec changes at most per-deploy cadence.
//
// The spec is read from disk once per Lambda cold start, then served from
// module-level memory. This keeps request-time cost to JSON.stringify of
// an already-parsed object even though readFileSync is cheap.

import { readFileSync } from "node:fs";
import path from "node:path";
import * as Sentry from "@sentry/nextjs";

import { NextRequest, NextResponse } from "next/server";

import { checkRateLimitAsync } from "@/lib/api/rate-limit";
import { serverError } from "@/lib/api/error-response";
import {
  userAuthFailureResponse,
  verifyUserAuth,
} from "@/lib/api/auth";
import {
  AdminFatalError,
  AuthQuarantineError,
  EngineError,
  engineErrorTags,
} from "@/lib/errors";

export const runtime = "nodejs";

// The spec reads from the repo-rooted `docs/openapi.json`; that file is not
// a Next.js asset so we need the nodejs runtime (edge has no fs access).
// Keep this as a lambda: Vercel can fail to package static API routes that
// still depend on node fs access because there is no lambda for the route.
export const dynamic = "force-dynamic";

// The shape is intentionally permissive — the OpenAPI object is huge and
// fully typing it would duplicate the spec in TypeScript. `unknown` at the
// top-level with narrowing for `openapi` / `paths` is enough to prove the
// loaded document is at least shaped like a spec before we serve it.
interface LoadedSpec {
  readonly openapi: string;
  readonly info: { title: string; version: string };
  readonly paths: Record<string, unknown>;
  readonly components?: { securitySchemes?: Record<string, unknown> };
  readonly [key: string]: unknown;
}

class OpenApiLoadError extends AdminFatalError {}

function loadSpec(): LoadedSpec {
  // Resolve from the repo root rather than the compiled `.next` output.
  // `process.cwd()` is the Next.js project root in both `next dev` and the
  // Vercel build output (where the file is copied into the function bundle).
  const specPath = path.join(process.cwd(), "docs", "openapi.json");
  const raw = readFileSync(specPath, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  if (
    !parsed ||
    typeof parsed !== "object" ||
    typeof (parsed as { openapi?: unknown }).openapi !== "string" ||
    typeof (parsed as { paths?: unknown }).paths !== "object"
  ) {
    throw new OpenApiLoadError(
      "docs/openapi.json is not a valid OpenAPI document (missing openapi/paths keys)",
    );
  }
  return parsed as LoadedSpec;
}

// Cache the parsed spec at module scope. Subsequent requests only pay the
// JSON.stringify cost (and the NextResponse object allocation).
let cachedSpec: LoadedSpec | null = null;
let loadError: EngineError | null = null;

function getSpec(): LoadedSpec {
  if (cachedSpec) return cachedSpec;
  if (loadError) throw loadError;
  try {
    cachedSpec = loadSpec();
    return cachedSpec;
  } catch (err) {
    loadError =
      err instanceof EngineError
        ? err
        : new OpenApiLoadError(String(err), { originalError: String(err) });
    throw loadError;
  }
}

const CACHE_HEADERS = {
  "Cache-Control": "private, no-store",
  "Content-Type": "application/json; charset=utf-8",
} as const;

const OPENAPI_RATE_LIMIT = {
  windowMs: 60_000,
  maxRequests: 30,
} as const;

function isPublicPath(pathname: string): boolean {
  const raw = pathname.toLowerCase();
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    decoded = raw;
  }
  const blockedPrefixes = [
    "/api/admin/",
    "/api/_internal/",
    "/api/webhooks/",
    "/api/cron/",
  ];
  if (blockedPrefixes.some((prefix) => raw.startsWith(prefix))) return false;
  if (blockedPrefixes.some((prefix) => decoded.startsWith(prefix))) return false;
  return true;
}

function publicSpecView(spec: LoadedSpec): LoadedSpec {
  const filteredPaths = Object.fromEntries(
    Object.entries(spec.paths).filter(([pathname]) => isPublicPath(pathname)),
  );
  const schemes = spec.components?.securitySchemes ?? {};
  const {
    cronBearer: _cronBearer,
    adminBearer: _adminBearer,
    ...restSchemes
  } = schemes;
  return {
    ...spec,
    paths: filteredPaths,
    components: {
      ...(spec.components ?? {}),
      securitySchemes: restSchemes,
    },
  };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const userVerdict = verifyUserAuth(request);
  const denied = userAuthFailureResponse(userVerdict);
  if (denied) return denied;

  const limit = await checkRateLimitAsync(request, OPENAPI_RATE_LIMIT);
  if (!limit.allowed) {
    const err = new AuthQuarantineError(
      "openapi denied: rate limited public-api spec request",
      { route: "/api/openapi.json", count: limit.count },
    );
    Sentry.captureException(err, {
      tags: {
        ...engineErrorTags(err),
        source: "auth",
        category: "quarantine",
        route: "openapi.json",
      },
    });
    return NextResponse.json(
      { ok: false, error: "rate limited", code: "RATE_LIMITED" },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)),
          "Cache-Control": "no-store",
        },
      },
    );
  }

  try {
    const spec = publicSpecView(getSpec());
    return NextResponse.json(spec, { headers: CACHE_HEADERS });
  } catch (err) {
    return serverError(err, {
      scope: "[api/openapi.json:GET]",
      publicMessage: "Could not load OpenAPI spec",
      code: "OPENAPI_LOAD_FAILED",
      status: 500,
    });
  }
}

// Test-only escape hatch — clears the module-level cache so unit tests can
// swap in a fixture file via env var without restarting the process.
// Next.js forbids additional named exports from a route file, so we publish
// the reset hook on `globalThis` under a symbol key (same pattern as
// `src/app/api/repos/[owner]/[name]/aiso/route.ts`).
const OPENAPI_TEST_RESET = Symbol.for("trendingrepo.openapi.test.reset");
(globalThis as unknown as Record<symbol, () => void>)[OPENAPI_TEST_RESET] =
  () => {
    cachedSpec = null;
    loadError = null;
  };

const OPENAPI_TEST_IS_PUBLIC_PATH = Symbol.for(
  "trendingrepo.openapi.test.isPublicPath",
);
(globalThis as unknown as Record<symbol, (pathname: string) => boolean>)[
  OPENAPI_TEST_IS_PUBLIC_PATH
] = isPublicPath;
