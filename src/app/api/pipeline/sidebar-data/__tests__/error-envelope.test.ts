import assert from "node:assert/strict";
import { test } from "node:test";
import { NextRequest } from "next/server";

test("sidebar-data route returns canonical typed envelope on internal failure", async () => {
  const route = await import("../route");
  const testHooks = await import("../_test-hooks");

  testHooks.__setBuildSidebarDataForTests(async () => {
    throw new Error("forced sidebar failure");
  });

  try {
    const response = await route.GET(
      new NextRequest("http://localhost/api/pipeline/sidebar-data"),
    );
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), {
      ok: false,
      error: "server error",
    });
  } finally {
    testHooks.__resetBuildSidebarDataForTests();
  }
});
