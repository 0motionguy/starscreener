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
