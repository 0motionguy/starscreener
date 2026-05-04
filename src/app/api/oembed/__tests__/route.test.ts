// E5 — coverage for /api/oembed.
//
// Behaviour matrix from src/app/api/oembed/route.ts:
//   - format != "json"          → 501 UNSUPPORTED_FORMAT
//   - url missing               → 404 UNSUPPORTED_URL
//   - url off-domain (SSRF)     → 404 UNSUPPORTED_URL
//   - url path !== /repo/o/n    → 404 UNSUPPORTED_URL
//   - valid /repo/owner/name    → 200 + full oEmbed rich JSON
//
// SITE_URL is resolved at module-load time from NEXT_PUBLIC_APP_URL (default
// https://trendingrepo.com). We pin it explicitly so the on-domain assertion
// is deterministic regardless of host env.

import { describe, it, expect, beforeAll } from "vitest";
import { NextRequest } from "next/server";

beforeAll(() => {
  process.env.NEXT_PUBLIC_APP_URL = "https://trendingrepo.com";
});

async function callGet(rawUrl: string): Promise<Response> {
  const { GET } = await import("../route");
  const req = new NextRequest(rawUrl);
  return GET(req);
}

describe("GET /api/oembed", () => {
  it("returns 501 when format is not json", async () => {
    const res = await callGet(
      "https://trendingrepo.com/api/oembed?format=xml&url=https://trendingrepo.com/repo/vercel/next.js",
    );
    expect(res.status).toBe(501);
    const body = (await res.json()) as { ok: boolean; code?: string };
    expect(body.ok).toBe(false);
    expect(body.code).toBe("UNSUPPORTED_FORMAT");
  });

  it("returns 404 when url query param is missing", async () => {
    const res = await callGet("https://trendingrepo.com/api/oembed");
    expect(res.status).toBe(404);
    const body = (await res.json()) as { ok: boolean; code?: string };
    expect(body.ok).toBe(false);
    expect(body.code).toBe("UNSUPPORTED_URL");
  });

  it("returns 404 when url host is off-domain (SSRF guard)", async () => {
    const res = await callGet(
      "https://trendingrepo.com/api/oembed?url=https://attacker.example.com/repo/vercel/next.js",
    );
    expect(res.status).toBe(404);
    const body = (await res.json()) as { ok: boolean; code?: string };
    expect(body.code).toBe("UNSUPPORTED_URL");
  });

  it("returns 404 when url path is not /repo/owner/name", async () => {
    const res = await callGet(
      "https://trendingrepo.com/api/oembed?url=https://trendingrepo.com/funding",
    );
    expect(res.status).toBe(404);
    const body = (await res.json()) as { ok: boolean; code?: string };
    expect(body.code).toBe("UNSUPPORTED_URL");
  });

  it("returns 200 with the full oEmbed rich payload for a valid repo url", async () => {
    const res = await callGet(
      "https://trendingrepo.com/api/oembed?url=https://trendingrepo.com/repo/vercel/next.js",
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/application\/json\+oembed/);
    const cc = res.headers.get("cache-control") ?? "";
    expect(cc).toContain("public");
    expect(cc).toContain("s-maxage=86400");

    const body = (await res.json()) as Record<string, unknown>;
    expect(body.version).toBe("1.0");
    expect(body.type).toBe("rich");
    expect(body.title).toBe("vercel/next.js — TrendingRepo");
    expect(body.author_name).toBe("vercel");
    expect(body.author_url).toBe("https://github.com/vercel");
    expect(body.provider_name).toBe("TrendingRepo");
    expect(body.provider_url).toBe("https://trendingrepo.com");
    expect(body.thumbnail_url).toBe(
      "https://avatars.githubusercontent.com/vercel?s=80&v=4",
    );
    expect(body.thumbnail_width).toBe(80);
    expect(body.thumbnail_height).toBe(80);
    expect(body.width).toBe(600);
    expect(body.height).toBe(280);
    expect(body.cache_age).toBe("86400");
    expect(typeof body.html).toBe("string");
    expect(body.html).toContain(
      "https://trendingrepo.com/repo/vercel/next.js",
    );
    expect(body.html).toContain('sandbox="allow-scripts allow-same-origin"');
  });

  it("returns 200 for a valid url with a trailing slash", async () => {
    const res = await callGet(
      "https://trendingrepo.com/api/oembed?url=https://trendingrepo.com/repo/vercel/next.js/",
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { author_name: string };
    expect(body.author_name).toBe("vercel");
  });
});
