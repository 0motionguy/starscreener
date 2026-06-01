import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

test("/api/og/top10 resolves brand assets from SITE_URL, not container origin", () => {
  const routeSource = readFileSync(
    resolve(process.cwd(), "src", "app", "api", "og", "top10", "route.tsx"),
    "utf8",
  );

  assert.equal(routeSource.includes('import { SITE_URL } from "@/lib/seo"'), true);
  assert.equal(routeSource.includes("new URL(request.url).origin"), false);
});
