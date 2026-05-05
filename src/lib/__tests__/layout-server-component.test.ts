import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const layoutPath = join(process.cwd(), "src", "app", "layout.tsx");
const layoutSource = readFileSync(layoutPath, "utf8");

test("root layout does not import next/dynamic", () => {
  assert.equal(
    /\bfrom\s+["']next\/dynamic["']/.test(layoutSource),
    false,
    "src/app/layout.tsx is a Server Component and must not import next/dynamic",
  );
});

test("root layout does not use ssr:false dynamic islands", () => {
  assert.equal(
    /dynamic\s*\([\s\S]*?\bssr\s*:\s*false\b/.test(layoutSource),
    false,
    "src/app/layout.tsx must not pass ssr:false to dynamic()",
  );
});
