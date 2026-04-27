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

import { NextResponse } from "next/server";

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
    throw new Error(
      "docs/openapi.json is not a valid OpenAPI document (missing openapi/paths keys)",
    );
  }
  return parsed as LoadedSpec;
}

// Cache the parsed spec at module scope. Subsequent requests only pay the
// JSON.stringify cost (and the NextResponse object allocation).
let cachedSpec: LoadedSpec | null = null;
let loadError: Error | null = null;

function getSpec(): LoadedSpec {
  if (cachedSpec) return cachedSpec;
  if (loadError) throw loadError;
  try {
    cachedSpec = loadSpec();
    return cachedSpec;
  } catch (err) {
    loadError = err instanceof Error ? err : new Error(String(err));
    throw loadError;
  }
}

const CACHE_HEADERS = {
  "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
  "Content-Type": "application/json; charset=utf-8",
} as const;

export async function GET(): Promise<NextResponse> {
  try {
    const spec = getSpec();
    return NextResponse.json(spec, { headers: CACHE_HEADERS });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Return a 500 with a machine-readable envelope matching the rest of
    // the API. Stack traces stay in the server log.
    console.error("[api:openapi.json] failed to load spec", err);
    return NextResponse.json(
      {
        ok: false,
        error: "Could not load OpenAPI spec",
        code: "OPENAPI_LOAD_FAILED",
        detail: message,
      },
      { status: 500 },
    );
  }
}

// Test-only escape hatch — clears the module-level cache so unit tests can
// swap in a fixture file via env var without restarting the process.
// Next.js forbids additional named exports from a route file, so we publish
// the reset hook on `globalThis` under a symbol key (same pattern as
// `src/app/api/repos/[owner]/[name]/aiso/route.ts`).
const OPENAPI_TEST_RESET = Symbol.for("starscreener.openapi.test.reset");
(globalThis as unknown as Record<symbol, () => void>)[OPENAPI_TEST_RESET] =
  () => {
    cachedSpec = null;
    loadError = null;
  };
