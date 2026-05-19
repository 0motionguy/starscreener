// UI v6 route smoke — guards the 14-route rebuild against regression.
//
// Probes every new v6 surface plus the 4 API endpoints we depend on.
// Tolerates anonymous redirects on session-gated routes (account/build/drop)
// and asserts 404 for nonexistent repos. We assert response status only
// (plus a single body-string sentinel per public route) so the smoke does
// not flake on copy or layout churn.
//
// The body sentinels are intentionally case-insensitive and matched against
// the raw HTML response — fast, no hydration wait, no flake.

import { test, expect } from "@playwright/test";

// ---------------------------------------------------------------------------
// Public 200 routes — each must serve a body containing a known sentinel.
// ---------------------------------------------------------------------------

const PUBLIC_ROUTES: Array<{ path: string; sentinel: RegExp }> = [
  { path: "/", sentinel: /trending/i },
  { path: "/breakout", sentinel: /breakout/i },
  { path: "/market-signals", sentinel: /market|signals/i },
  { path: "/funding", sentinel: /funding/i },
  { path: "/revenue", sentinel: /revenue/i },
  { path: "/agent-commerce", sentinel: /agent[- ]?commerce/i },
  { path: "/tools", sentinel: /tools/i },
  { path: "/ideas", sentinel: /ideas/i },
  { path: "/preview", sentinel: /preview/i },
  { path: "/repo/vercel/next.js", sentinel: /next\.js/i },
];

for (const route of PUBLIC_ROUTES) {
  test(`v6 public route GET ${route.path} returns 200 with sentinel`, async ({
    request,
  }) => {
    const response = await request.get(route.path, {
      maxRedirects: 0,
      failOnStatusCode: false,
    });
    expect(
      response.status(),
      `${route.path} expected 200, got ${response.status()}`,
    ).toBe(200);
    const body = await response.text();
    expect(
      body,
      `${route.path} body missing sentinel ${route.sentinel}`,
    ).toMatch(route.sentinel);
  });
}

// ---------------------------------------------------------------------------
// Session-gated routes — anon hit should either render 200 (if the route
// renders an auth gate inline) or 302/307 redirect to /sign-in. Both are
// valid steady states; a 500 is a regression.
// ---------------------------------------------------------------------------

const GATED_ROUTES = ["/account", "/build", "/drop"];

for (const path of GATED_ROUTES) {
  test(`v6 gated route GET ${path} returns 200 or auth redirect`, async ({
    request,
  }) => {
    const response = await request.get(path, {
      maxRedirects: 0,
      failOnStatusCode: false,
    });
    const status = response.status();
    expect(
      [200, 302, 307].includes(status),
      `${path} expected 200/302/307, got ${status}`,
    ).toBe(true);

    // If redirected, target should look like an auth surface — never a
    // generic 500-marker URL.
    if (status === 302 || status === 307) {
      const location = response.headers().location ?? "";
      expect(
        /sign-in|sign-up|login|auth/i.test(location),
        `${path} redirected to non-auth location: ${location}`,
      ).toBe(true);
    }
  });
}

// ---------------------------------------------------------------------------
// Nonexistent repo → 404. Guards the not-found handler on /repo/[owner]/[name].
// ---------------------------------------------------------------------------

test("v6 unknown repo GET /repo/totally-fake/nonexistent returns 404", async ({
  request,
}) => {
  const response = await request.get("/repo/totally-fake/nonexistent", {
    maxRedirects: 0,
    failOnStatusCode: false,
  });
  expect(
    response.status(),
    `expected 404, got ${response.status()}`,
  ).toBe(404);
});

// ---------------------------------------------------------------------------
// API endpoints — must serve 200. /api/repos and /api/healthz are exercised
// by the cookbook and post-deploy smoke, but the v6 surface depends on them
// directly so we re-assert here. The contributions endpoint exercises Phase
// 4C — public GET should succeed (200) for a published idea or 404 for an
// unpublished/missing id; both are valid.
// ---------------------------------------------------------------------------

const API_OK_ROUTES = ["/api/healthz", "/api/repos"];

for (const path of API_OK_ROUTES) {
  test(`v6 api ${path} returns 200`, async ({ request }) => {
    const response = await request.get(path, { failOnStatusCode: false });
    expect(
      response.status(),
      `${path} expected 200, got ${response.status()}`,
    ).toBe(200);
  });
}

test("v6 api contributions GET tolerates 200 (published) or 404 (unknown)", async ({
  request,
}) => {
  // We don't know what's currently published locally, so we hit the well-
  // known seed id from .data/ideas.jsonl and accept either 200 (published
  // idea, list returns) or 404 (idea is pending_moderation / absent).
  // A 5xx is the only regression we're catching.
  const response = await request.get(
    "/api/ideas/VGXl2KAU/contributions",
    { failOnStatusCode: false },
  );
  expect(
    [200, 404].includes(response.status()),
    `expected 200 or 404, got ${response.status()}`,
  ).toBe(true);
});
