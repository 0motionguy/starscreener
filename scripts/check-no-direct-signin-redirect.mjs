#!/usr/bin/env node
// Ban direct /sign-in navigations outside the canonical auth helpers.
//
// One place — src/lib/auth/use-auth-gate.ts (gate) calling
// src/lib/auth/open-sign-in-modal.ts (opener) — owns the
// modal-vs-hosted-page decision. Every other call site should route
// through `useAuthGate().requireAuth(fn)` so future regressions in
// Clerk wiring (key missing, satellite down, allowed_origins drift)
// surface in one file, not 14.
//
// History: 2026-05-31 found 4 sites still using
// `window.location.assign(signInUrl)` / `<a href={signInUrl}>` that
// broke the auth modal UX on prod. This lint stops the regrowth.

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SCAN_DIRS = ["src/components", "src/app"];

// Files allowed to do their own /sign-in plumbing.
const ALLOW_LIST = new Set([
  "src/lib/auth/open-sign-in-modal.ts", // canonical opener; its fallback IS the redirect
  "src/lib/auth/use-auth-gate.ts", // hook composing openSignInModal
  "src/lib/auth/redirect-url.ts", // shared redirect-URL builder
  "src/lib/auth/clerk-config.ts", // Clerk env wiring
  "src/lib/auth/handle.ts", // server-side auth handle
  "src/lib/auth/server.ts", // server auth utilities
  // The sign-in route itself
  "src/app/sign-in/[[...sign-in]]/page.tsx",
  "src/app/sign-up/[[...sign-up]]/page.tsx",
  // Middleware can rewrite to /sign-in
  "src/middleware.ts",
]);

// Patterns that indicate a hand-rolled sign-in redirect outside the helper.
const RE_LIST = [
  { name: "window.location.assign sign-in", re: /window\.location\.(?:assign|href)\s*=?\s*\(?["'`][^"'`]*\/sign-in/ },
  { name: "router.push sign-in", re: /router\.(?:push|replace)\s*\(\s*["'`][^"'`]*\/sign-in/ },
  { name: "<a href sign-in> JSX", re: /<a\s[^>]*href\s*=\s*\{?["'`][^"'`]*\/sign-in/ },
  { name: "<Link href sign-in> JSX", re: /<Link\s[^>]*href\s*=\s*\{?["'`][^"'`]*\/sign-in/ },
  { name: "signInUrl / signInHref variable", re: /\b(?:signInUrl|signInHref)\s*[:=]\s*["'`][^"'`]*\/sign-in/ },
  { name: "window.location signInUrl variable", re: /window\.location\.(?:assign|href)\s*=?\s*\(?\s*(?:signInUrl|signInHref)\b/ },
];

function walk(dir, out = []) {
  const abs = path.resolve(ROOT, dir);
  if (!fs.existsSync(abs)) return out;
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.match(/\.(ts|tsx|jsx|js|mjs)$/)) out.push(full);
  }
  return out;
}

const violations = [];
const scanned = SCAN_DIRS.flatMap((d) => walk(d));

for (const rel of scanned) {
  const norm = rel.split(path.sep).join("/");
  if (ALLOW_LIST.has(norm)) continue;
  if (norm.includes("__tests__") || norm.includes(".test.")) continue;

  const src = fs.readFileSync(path.resolve(ROOT, rel), "utf8");
  for (const { name, re } of RE_LIST) {
    const m = src.match(re);
    if (m) {
      const lineNum = src.slice(0, m.index).split("\n").length;
      violations.push({ file: norm, line: lineNum, pattern: name, snippet: m[0].slice(0, 80) });
    }
  }
}

if (violations.length === 0) {
  console.log(`[check-no-direct-signin-redirect] OK — ${scanned.length} file(s) scanned, ${ALLOW_LIST.size} allow-listed.`);
  process.exit(0);
}

console.error(`[check-no-direct-signin-redirect] FAIL — ${violations.length} direct /sign-in navigation(s):`);
for (const v of violations) {
  console.error(`  ${v.file}:${v.line}  [${v.pattern}]  ${v.snippet}`);
}
console.error(``);
console.error(`Replace with the central helper:`);
console.error(``);
console.error(`  import { useAuthGate } from "@/lib/auth/use-auth-gate";`);
console.error(`  const gate = useAuthGate();`);
console.error(`  const onClick = () => gate.requireAuth(() => doTheThing());`);
console.error(``);
console.error(`If the redirect is legitimate (e.g. fallback inside the auth helper itself),`);
console.error(`add the file to ALLOW_LIST in this script with a one-line WHY.`);
process.exit(1);
