#!/usr/bin/env node
/**
 * Lint guard: fail CI if any "use client" file reads process.env.<SECRET>
 * where SECRET is NOT NEXT_PUBLIC_* or NODE_ENV.
 *
 * Why: server secrets MUST stay server-side. Client-bundled env reads
 * leak the value into the browser bundle. Next.js statically inlines
 * NEXT_PUBLIC_* at build time (intentionally public). Anything else
 * read inside "use client" code is either a leak or a bug.
 *
 * Added 2026-05-17 after session-G W5.5.C security audit.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOTS = ["src/app", "src/components", "src/lib", "src/hooks"];
const VIOLATIONS = [];

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (entry === "node_modules" || entry.startsWith(".")) continue;
      walk(full);
      continue;
    }
    if (!/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(entry)) continue;
    const body = readFileSync(full, "utf8");
    // Quick skip: file must have "use client" directive on its first
    // non-blank line (Next.js requirement). We accept either quote style.
    if (
      !/^[\s\n]*"use client"/.test(body) &&
      !/^[\s\n]*'use client'/.test(body)
    )
      continue;
    const matches = body.matchAll(/process\.env\.([A-Z_][A-Z0-9_]*)/g);
    for (const m of matches) {
      const name = m[1];
      if (name === "NODE_ENV") continue;
      if (name.startsWith("NEXT_PUBLIC_")) continue;
      VIOLATIONS.push({ file: full, env: name });
    }
  }
}

for (const root of ROOTS) {
  try {
    walk(root);
  } catch {
    // Root may not exist (e.g. src/hooks on some checkouts) — skip silently.
  }
}

if (VIOLATIONS.length > 0) {
  console.error(
    `::error::Found ${VIOLATIONS.length} client-side reads of non-public env vars:`,
  );
  for (const v of VIOLATIONS) {
    console.error(`  ${v.file}: process.env.${v.env}`);
  }
  console.error(
    `Server secrets must NOT be read inside "use client" files. ` +
      `Use NEXT_PUBLIC_* for client-bundled values, or move the read to a server-only file.`,
  );
  process.exit(1);
}

console.log("OK - no secret env reads in client files.");
