// E6 — coverage for the x402 HTTP 402 manifest stub.
//
// The route only re-exports method handlers (GET/HEAD/POST/OPTIONS) — no
// data-store, no auth, no env. Tests construct a plain Request, invoke the
// handler directly, and assert on status + headers + body shape.

import { describe, it, expect } from "vitest";

import { GET, HEAD, POST, OPTIONS } from "../route";

import type { NextRequest } from "next/server";

function makeReq(method: string): NextRequest {
  return new Request("http://localhost/x402", { method }) as unknown as NextRequest;
}

describe("x402 route — HTTP 402 manifest stub", () => {
  it("GET returns 402 with x402 JSON body", async () => {
    const res = GET(makeReq("GET"));
    expect(res.status).toBe(402);
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
    expect(res.headers.get("X-Payment-Required")).toBe("x402");

    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toHaveProperty("type", "x402-payment-required");
    expect(body).toHaveProperty("version");
    expect(body).toHaveProperty("accepts");
    expect(body).toHaveProperty("networks");
    expect(body).toHaveProperty("description");
    expect(body).toHaveProperty("docs");
    expect(Array.isArray(body.accepts)).toBe(true);
    expect(Array.isArray(body.networks)).toBe(true);
  });

  it("HEAD returns 402 with X-Payment-Required header and no body", async () => {
    const res = HEAD(makeReq("HEAD"));
    expect(res.status).toBe(402);
    expect(res.headers.get("X-Payment-Required")).toBe("x402");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const text = await res.text();
    expect(text).toBe("");
  });

  it("POST returns 402 with x402 JSON body", async () => {
    const res = POST(makeReq("POST"));
    expect(res.status).toBe(402);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toHaveProperty("type", "x402-payment-required");
    expect(body).toHaveProperty("accepts");
    expect(body).toHaveProperty("networks");
  });

  it("OPTIONS returns 204 with Allow header listing supported methods", async () => {
    const res = OPTIONS();
    expect(res.status).toBe(204);
    const allow = res.headers.get("Allow") ?? "";
    expect(allow).toMatch(/GET/);
    expect(allow).toMatch(/HEAD/);
    expect(allow).toMatch(/POST/);
    expect(allow).toMatch(/OPTIONS/);
    expect(res.headers.get("Access-Control-Allow-Methods")).toMatch(/GET/);
  });

  it("does not export handlers for unsupported methods (Next.js will 405)", async () => {
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
