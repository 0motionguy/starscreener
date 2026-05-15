import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const sidebarSource = readFileSync(
  join(process.cwd(), "src", "components", "layout", "SidebarContent.tsx"),
  "utf8",
);

test("agent-commerce sidebar link does not auto-prefetch", () => {
  assert.match(
    sidebarSource,
    /<Link href=\{href\} prefetch=\{prefetch\} className=\{className\}>/,
    "V2NavRow must forward prefetch to Next Link",
  );
  assert.match(
    sidebarSource,
    /<V2NavRow\s+href="\/agent-commerce"\s+prefetch=\{false\}/,
    "agent-commerce is crawler-guarded and should not prefetch from every page",
  );
});
