#!/usr/bin/env node
// CI guard for the canonical error envelope (APP-10).
//
// Catches `NextResponse.json({ error: ... }` patterns that drop the
// `ok: false` discriminator — the leakiest of the 4 shapes the audit
// flagged. The full canonical is:
//
//   { ok: false, error: string, code?: string }
//
// Use `errorEnvelope(message, code?)` or `serverError(err, { scope })`
// from `src/lib/api/error-response.ts` instead of inlining envelopes.
//
// Run via `npm run lint:err-envelope`. Exits 1 on any violation.

import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve, relative } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const API_DIR = resolve(ROOT, "src/app/api");

// Match `NextResponse.json({ error: ... }` where the immediate object
// literal does NOT include `ok:` within the same expression. The
// 200-char window keeps the regex tractable; longer expressions either
// span the helper boundary (serverError, errorEnvelope) or are object
// builders that go through the canonical path elsewhere.
const BARE_ERROR_RE =
  /NextResponse\.json\(\s*\{\s*error\s*:\s*[^,}]{1,200}[,}]/g;

// Pre-existing routes the migration is allow-listed against. Each entry
// either uses the v1 contract (kept byte-stable for legacy MCP/CLI
// consumers) or returns a 404/204-like envelope that explicitly opts
// out of the discriminator.
const ALLOW = new Map([
  [
    "src/app/api/repos/[owner]/[name]/route.ts",
    "v1 legacy shape — kept byte-stable for pinned MCP/CLI consumers (APP-17 sunset tracker).",
  ],
]);

async function* walkRoutes(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walkRoutes(full);
    } else if (entry.isFile() && entry.name === "route.ts") {
      yield full;
    }
  }
}

const violations = [];

for await (const file of walkRoutes(API_DIR)) {
  const rel = relative(ROOT, file).replaceAll("\\", "/");
  if (ALLOW.has(rel)) continue;
  const content = await readFile(file, "utf8");

  BARE_ERROR_RE.lastIndex = 0;
  let m;
  while ((m = BARE_ERROR_RE.exec(content))) {
    // Quick filter: if the same logical NextResponse.json call also
    // contains `ok:` later in a 400-char window, allow it. This catches
    // multi-line response builders where the regex anchored on the
    // first key happens to be `error`.
    const window = content.slice(m.index, m.index + 400);
    if (/\bok\s*:\s*false/.test(window)) continue;

    const upto = content.slice(0, m.index);
    const lineNo = upto.split("\n").length;
    const lineText = content.split("\n")[lineNo - 1].trim();
    violations.push({ file: rel, line: lineNo, snippet: lineText });
  }
}

if (violations.length === 0) {
  console.log(
    `[check-error-envelope] OK — every route uses the {ok:false, error, code?} envelope.`,
  );
  process.exit(0);
}

console.error(
  `[check-error-envelope] FAIL — ${violations.length} route(s) return a bare {error: ...} envelope.`,
);
console.error(
  "Use errorEnvelope(message, code?) or serverError(err, { scope }) from",
);
console.error("src/lib/api/error-response.ts. Discriminator `ok: false` is required.");
console.error("");
for (const v of violations.slice(0, 50)) {
  console.error(`  ${v.file}:${v.line}`);
  console.error(`    ${v.snippet}`);
}
if (violations.length > 50) {
  console.error(`  ... and ${violations.length - 50} more`);
}
process.exit(1);
