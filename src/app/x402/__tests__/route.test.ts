// Coverage for the x402 manifest proxy route.
//
// The previous stub returned a static 402 manifest on GET. The route now
// server-side-fetches the TOOLBOX manifest at api.aiso.tools/v1/x402/manifest
// and re-emits it (200 + 60s cache). HEAD mirrors the 200. POST/OPTIONS keep
// the legacy 402-stub / 204-Allow semantics so anything that probes them
// still sees a usable response.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import type { NextRequest } from "next/server";

function makeReq(method: string): NextRequest {
  return new Request("http://localhost/x402", { method }) as unknown as NextRequest;
}

const MANIFEST_SAMPLE = {
  version: "1.0",
  currency: "USDC_BASE",
  demo_mode: true,
  sponge_facilitator: "https://api.paysponge.com/x402/...",
  endpoints: [
    {
      path: "/v1/x402/trending/github/velocity/:owner/:name",
      price_usdc: 0.01,
      price_minor_units: 10000,
      tier: 3,
      signal_type: "trending.github.stars.velocity",
      description: "stub",
    },
  ],
};

describe("x402 manifest proxy route", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify(MANIFEST_SAMPLE), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("GET proxies the TOOLBOX manifest with 200 + cache header", async () => {
    const { GET } = await import("../route");
    const res = await GET(makeReq("GET"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
    expect(res.headers.get("cache-control")).toMatch(/max-age=60/);
    expect(res.headers.get("x-source")).toBe("toolbox-manifest-proxy");
    expect(res.headers.get("access-control-allow-origin")).toBe("*");

    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toHaveProperty("endpoints");
    expect(Array.isArray(body.endpoints)).toBe(true);
  });

  it("GET falls back to 503 when TOOLBOX is unreachable and no cache exists", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );
    const { GET } = await import("../route");
    const res = await GET(makeReq("GET"));
    expect(res.status).toBe(503);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toHaveProperty("type", "x402-payment-required");
    expect(body).toHaveProperty("manifest");
  });

  it("HEAD returns 200 with manifest pointers and no body", async () => {
    const { HEAD } = await import("../route");
    const res = HEAD(makeReq("HEAD"));
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Payment-Required")).toBe("x402");
    expect(res.headers.get("X-Source")).toBe("toolbox-manifest-proxy");
    expect(await res.text()).toBe("");
  });

  it("POST keeps the legacy 402 stub body for old probes", async () => {
    const { POST } = await import("../route");
    const res = POST(makeReq("POST"));
    expect(res.status).toBe(402);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toHaveProperty("type", "x402-payment-required");
    expect(body).toHaveProperty("manifest");
  });

  it("OPTIONS returns 204 with Allow listing supported methods", async () => {
    const { OPTIONS } = await import("../route");
    const res = OPTIONS();
    expect(res.status).toBe(204);
    const allow = res.headers.get("Allow") ?? "";
    expect(allow).toMatch(/GET/);
    expect(allow).toMatch(/HEAD/);
    expect(allow).toMatch(/POST/);
    expect(allow).toMatch(/OPTIONS/);
    expect(res.headers.get("Access-Control-Allow-Methods")).toMatch(/GET/);
  });

  it("does not export handlers for unsupported methods", async () => {
    const mod = await import("../route");
    const exported = Object.keys(mod);
    expect(exported).not.toContain("DELETE");
    expect(exported).not.toContain("PUT");
    expect(exported).not.toContain("PATCH");
    expect(exported).toContain("GET");
    expect(exported).toContain("HEAD");
    expect(exported).toContain("POST");
    expect(exported).toContain("OPTIONS");
  });
});
