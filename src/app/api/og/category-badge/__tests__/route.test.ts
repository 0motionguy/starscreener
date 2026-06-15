// Coverage for /api/og/category-badge/[slug] — embeddable category badge.
//
// Behaviour matrix:
//   - valid slug          → 200 image/svg+xml, contains category name + slug
//   - `.svg` suffix       → 200 (slug stripped server-side)
//   - unknown slug        → 404 image/svg+xml with placeholder shape
//   - cache-control       → "public, s-maxage=3600, stale-while-revalidate=86400"
//   - SVG validity        → starts with `<?xml` and is parseable as XML
//
// Imports the route lazily so each test can re-evaluate the module after
// any env / mock setup. Mirrors the pattern in src/app/api/oembed/__tests__/.

import { describe, it, expect, beforeAll } from "vitest";
import { NextRequest } from "next/server";

beforeAll(() => {
  process.env.NEXT_PUBLIC_APP_URL = "https://trendingrepo.com";
});

async function callGet(rawUrl: string, slug: string): Promise<Response> {
  const { GET } = await import("../[slug]/route");
  const req = new NextRequest(rawUrl);
  return GET(req, { params: Promise.resolve({ slug }) });
}

function expectSvgEnvelope(res: Response, body: string): void {
  expect(res.headers.get("content-type")).toMatch(/image\/svg\+xml/);
  // Self-contained SVG must declare an XML prolog so file-extension
  // sniffers (GitHub camo, README renderers) don't fall back to text/html.
  expect(body.startsWith("<?xml")).toBe(true);
  // No external font / image refs — moat is broken if README authors need
  // to allowlist a font host on their pages.
  expect(body).not.toMatch(/<image\b/);
  expect(body).not.toMatch(/font-face/i);
  expect(body).not.toMatch(/@import/);
  // Branded accent strip and chip should always be present.
  expect(body).toContain("</svg>");
}

describe("GET /api/og/category-badge/[slug]", () => {
  it("returns a 200 SVG for a known slug", async () => {
    const res = await callGet(
      "https://trendingrepo.com/api/og/category-badge/mcp",
      "mcp",
    );
    const body = await res.text();
    expect(res.status).toBe(200);
    expectSvgEnvelope(res, body);
    // Category name flows through to the headline.
    expect(body).toContain("Model Context Protocol");
    // Chip uses the category's short name.
    expect(body).toContain(">MCP<");
  });

  it("accepts a .svg suffix on the slug", async () => {
    const res = await callGet(
      "https://trendingrepo.com/api/og/category-badge/mcp.svg",
      "mcp.svg",
    );
    const body = await res.text();
    expect(res.status).toBe(200);
    expectSvgEnvelope(res, body);
    expect(body).toContain("Model Context Protocol");
  });

  it("falls back to a placeholder + 404 for unknown slugs", async () => {
    const res = await callGet(
      "https://trendingrepo.com/api/og/category-badge/not-a-real-category",
      "not-a-real-category",
    );
    const body = await res.text();
    expect(res.status).toBe(404);
    expectSvgEnvelope(res, body);
    expect(body).toContain("Unknown category");
  });

  it("sets the documented Cache-Control envelope", async () => {
    const res = await callGet(
      "https://trendingrepo.com/api/og/category-badge/ai-agents",
      "ai-agents",
    );
    const cc = res.headers.get("cache-control") ?? "";
    expect(cc).toContain("public");
    expect(cc).toContain("s-maxage=3600");
    expect(cc).toContain("stale-while-revalidate=86400");
  });

  it("renders for every CATEGORIES entry without throwing", async () => {
    const { CATEGORIES } = await import("@/lib/constants");
    for (const cat of CATEGORIES) {
      const res = await callGet(
        `https://trendingrepo.com/api/og/category-badge/${cat.id}`,
        cat.id,
      );
      expect(res.status, `slug ${cat.id} expected 200`).toBe(200);
      const body = await res.text();
      expect(body, `slug ${cat.id} should declare XML prolog`).toMatch(
        /^<\?xml/,
      );
      // Chip color must be present — proves the SVG was rendered with the
      // category's palette and not a placeholder fallback.
      expect(body, `slug ${cat.id} should include chip color`).toContain(
        cat.color,
      );
    }
  });
});
