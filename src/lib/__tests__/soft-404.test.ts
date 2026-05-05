import assert from "node:assert/strict";
import { test } from "node:test";

import { detectSoft404 } from "@/lib/soft-404";

test("detectSoft404 ignores non-2xx statuses", () => {
  const result = detectSoft404({
    status: 404,
    bodyText: "404 not found",
  });
  assert.equal(result.isSoft404, false);
  assert.deepEqual(result.markers, []);
});

test("detectSoft404 flags 2xx payloads with not-found markers", () => {
  const result = detectSoft404({
    status: 200,
    bodyText: "<html><title>404</title><body>Page not found</body></html>",
  });
  assert.equal(result.isSoft404, true);
  assert.ok(result.markers.length > 0);
});

test("detectSoft404 does not flag healthy 2xx payloads", () => {
  const result = detectSoft404({
    status: 200,
    bodyText: "Trending repos dashboard",
  });
  assert.equal(result.isSoft404, false);
  assert.deepEqual(result.markers, []);
});
