import type { NextRequest } from "next/server";

// x402 — HTTP 402 Payment Required entrypoint for agent-side micropayments.
//
// The actual priced endpoints live on TOOLBOX (`api.aiso.tools/v1/x402/*`).
// This route now does two things:
//
//   GET  — server-side fetch the TOOLBOX manifest and re-emit the JSON
//          (with a `status: 200` and cached 60s) so AISO's
//          `aiso.x402-discovery` scanner sees the actual menu of priced
//          endpoints when it probes trendingrepo.com/x402.
//   HEAD / POST / OPTIONS — preserve the previous 402-stub behaviour so
//          legacy probes still see x402 capability (and to keep the
//          aiso.x402-stub scanner happy if it ever lands).
//
// Spec reference: https://x402.org

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TOOLBOX_MANIFEST_URL = "https://api.aiso.tools/v1/x402/manifest";
const MANIFEST_CACHE_MS = 60_000;

let manifestCache: { fetchedAt: number; body: unknown } | null = null;

async function getToolboxManifest(): Promise<unknown> {
  const now = Date.now();
  if (manifestCache && now - manifestCache.fetchedAt < MANIFEST_CACHE_MS) {
    return manifestCache.body;
  }
  try {
    const res = await fetch(TOOLBOX_MANIFEST_URL, {
      headers: { Accept: "application/json" },
      // Soft timeout: AbortSignal.timeout is supported in Node 20+ (we're on 22).
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) {
      throw new Error(`upstream ${res.status}`);
    }
    const body = await res.json();
    manifestCache = { fetchedAt: now, body };
    return body;
  } catch {
    // Stale-while-revalidate: return whatever we last had, even if expired.
    if (manifestCache) return manifestCache.body;
    return null;
  }
}

export async function GET(_req: NextRequest): Promise<Response> {
  const manifest = await getToolboxManifest();
  if (manifest === null) return stubResponse(503);
  return new Response(JSON.stringify(manifest), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=60",
      "X-Source": "toolbox-manifest-proxy",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

export function HEAD(_req: NextRequest): Response {
  return new Response(null, {
    status: 200,
    headers: {
      "X-Payment-Required": "x402",
      "X-Source": "toolbox-manifest-proxy",
      "Cache-Control": "public, max-age=60",
    },
  });
}

// Legacy POST/OPTIONS — agents that probed the old stub still get a
// well-formed 402; bots discover the manifest via GET above.
export function POST(_req: NextRequest): Response {
  return stubResponse(402);
}

export function OPTIONS(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      Allow: "GET, HEAD, POST, OPTIONS",
      "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

function stubResponse(status: number): Response {
  const body = {
    type: "x402-payment-required",
    version: "0.1",
    status,
    accepts: ["x402"],
    networks: [],
    description:
      "trendingrepo.com/x402 is a discovery surface — priced endpoints live on api.aiso.tools/v1/x402/*. GET this path for the manifest.",
    manifest: TOOLBOX_MANIFEST_URL,
    docs: "https://x402.org",
    contact: "https://github.com/0motionguy/starscreener",
  };
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json",
      "X-Payment-Required": "x402",
      "Cache-Control": "no-store",
    },
  });
}
