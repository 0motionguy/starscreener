import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { join } from "node:path";

const middlewareSource = readFileSync(
  join(process.cwd(), "src", "middleware.ts"),
  "utf8",
);

test("middleware keeps /you public while protecting account-backed subroutes", () => {
  const matcher = middlewareSource.match(
    /const isProtectedRoute = createRouteMatcher\(\[([\s\S]*?)\]\);/,
  );
  assert.ok(matcher, "expected protected route matcher in middleware");

  const body = matcher[1] ?? "";
  assert.doesNotMatch(
    body,
    /["']\/you\(\.\*\)["']/,
    "/you must remain public because it renders localStorage-backed state",
  );
  assert.match(body, /["']\/you\/alerts\(\.\*\)["']/);
  assert.match(body, /["']\/you\/refer\(\.\*\)["']/);
  assert.match(body, /["']\/api\/me\/\(\.\*\)["']/);
});

test("middleware runs Clerk only for protected routes and session-aware APIs", () => {
  assert.doesNotMatch(
    middlewareSource,
    /export default getClerkPublishableKey\(\)\s*\?/,
    "public pages must not be globally wrapped by Clerk middleware",
  );
  assert.match(
    middlewareSource,
    /const isClerkSessionRoute = createRouteMatcher\(\[\s*["']\/api\/pipeline\/sidebar-overlay["'],?\s*\]\);/,
    "sidebar overlay must run inside Clerk middleware so auth() can return a session or null",
  );
  assert.match(
    middlewareSource,
    /if\s*\(isProtectedRoute\(req\)\s*\|\|\s*isClerkSessionRoute\(req\)\)\s*\{[\s\S]*?return middlewareWithClerk\(req, event\);/,
  );
  assert.match(
    middlewareSource,
    /return middlewareForPublicRoutes\(req\);/,
  );
});
