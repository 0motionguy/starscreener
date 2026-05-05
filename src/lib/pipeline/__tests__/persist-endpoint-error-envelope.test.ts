import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const ROUTE_PATH = path.resolve(
  process.cwd(),
  "src/app/api/pipeline/persist/route.ts",
);

test("persist route uses opaque 500 envelope (no raw error echo)", async () => {
  const source = await readFile(ROUTE_PATH, "utf8");

  assert.match(source, /serverError\s*\(/);
  assert.match(source, /publicMessage:\s*"pipeline persist failed"/);
  assert.match(source, /code:\s*"PERSIST_FAILED"/);

  assert.doesNotMatch(source, /\{\s*ok:\s*false,\s*error:\s*message\s*\}/);
  assert.doesNotMatch(source, /err\s+instanceof\s+Error\s+\?\s+err\.message/);
});
