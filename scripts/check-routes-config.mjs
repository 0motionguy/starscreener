#!/usr/bin/env node
// check-routes-config — assert every public src/app/**/page.tsx has an entry
// in perf/routes.json (or is allowlisted via perf/.perfignore). Exists so a
// new public route added to the codebase doesn't slip into prod without a
// declared cache contract / perf budget.
//
// Usage:
//   node scripts/check-routes-config.mjs
//
// Exit codes:
//   0  every public route has a config entry
//   1  one or more public routes missing config (with diff)
//   2  configuration / runtime error

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";

const ROUTES_PATH = resolve("perf/routes.json");
const PERFIGNORE_PATH = resolve("perf/.perfignore");
const APP_DIR = resolve("src/app");

// Path prefixes that don't need perf budgets — auth/admin/utility surfaces.
const PRIVATE_PREFIXES = [
  "/admin",
  "/api/",
  "/sign-in",
  "/sign-up",
  "/alerts", // user-specific; covered by separate alerts-page perf review
  "/watchlist",
  "/you",
  "/refer",
  "/u/", // public profile but unbounded slug — track via canary later
  "/brief/", // share preview, unbounded slug
  "/s/", // short-link redirect
  "/embed/", // 3rd-party embed; sized differently
  "/design-lab",
  "/portal",
  "/submit",
  "/cli", // pure docs, low traffic
  "/digest/", // unbounded slug, low traffic
  "/ideas/", // unbounded slug
  "/tierlist/", // unbounded slug
  "/collections/", // unbounded slug — may add canary later
  "/agent-commerce/", // unbounded slug
  "/agent-repos/", // unbounded slug
  "/categories/", // unbounded slug — base /categories is covered
  "/consensus/", // unbounded slug
  "/refer", // signed-in surface
];

// Reasons a top-level page can be elided. Auto-applied if the route's prefix
// is in PRIVATE_PREFIXES (admin/api/auth-only). Add per-path entries to
// perf/.perfignore for one-off exclusions (each line = a route or
// glob-style prefix; lines starting with `#` are comments).

if (!existsSync(ROUTES_PATH)) {
  console.error(`error: ${ROUTES_PATH} not found`);
  process.exit(2);
}
if (!existsSync(APP_DIR)) {
  console.error(`error: ${APP_DIR} not found`);
  process.exit(2);
}

let routesConfig;
try {
  routesConfig = JSON.parse(readFileSync(ROUTES_PATH, "utf8"));
} catch (err) {
  console.error(`error: cannot parse ${ROUTES_PATH}: ${err.message}`);
  process.exit(2);
}

const ignoreEntries = [];
if (existsSync(PERFIGNORE_PATH)) {
  for (const raw of readFileSync(PERFIGNORE_PATH, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    ignoreEntries.push(line);
  }
}

// Walk src/app and collect every page.tsx, derive its route template.
// "src/app/page.tsx"                              -> "/"
// "src/app/foo/page.tsx"                          -> "/foo"
// "src/app/repo/[owner]/[name]/page.tsx"          -> "/repo/[owner]/[name]"
// "src/app/(group)/foo/page.tsx"                  -> "/foo"  (route groups)
// "src/app/sign-in/[[...sign-in]]/page.tsx"       -> "/sign-in/..."
function collectPageTemplates(dir, segments = []) {
  const found = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return found;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      // Skip route groups like (marketing) — they don't add path segments.
      const seg =
        entry.name.startsWith("(") && entry.name.endsWith(")")
          ? null
          : entry.name;
      const next = seg === null ? segments : [...segments, seg];
      found.push(...collectPageTemplates(join(dir, entry.name), next));
    } else if (entry.isFile() && entry.name === "page.tsx") {
      const template = "/" + segments.join("/");
      found.push(template === "/" ? "/" : template.replace(/\/+$/, ""));
    }
  }
  return found;
}

const fsTemplates = [...new Set(collectPageTemplates(APP_DIR))].sort();

function isPrivate(template) {
  return PRIVATE_PREFIXES.some(
    (p) => template === p.replace(/\/$/, "") || template.startsWith(p),
  );
}

function isIgnored(template) {
  for (const entry of ignoreEntries) {
    if (entry.endsWith("*")) {
      if (template.startsWith(entry.slice(0, -1))) return true;
    } else if (template === entry) {
      return true;
    }
  }
  return false;
}

// Convert a route template ("/repo/[owner]/[name]") to a matcher regex.
function templateToRegex(template) {
  if (template === "/") return /^\/$/;
  const escaped = template.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
  // [name] becomes [^/]+; [[...catchAll]] becomes .+
  const withParams = escaped
    .replace(/\\\[\\\[\.\.\.[^\]]+\\\]\\\]/g, ".*?")
    .replace(/\\\[\.\.\.[^\]]+\\\]/g, ".+")
    .replace(/\\\[[^\]]+\\\]/g, "[^/]+");
  return new RegExp("^" + withParams + "(?:\\?.*)?$");
}

const configRoutes = (routesConfig.routes ?? []).map((r) => r.route);

const missing = [];
const present = [];
const skippedPrivate = [];
const skippedIgnored = [];

for (const template of fsTemplates) {
  if (isPrivate(template)) {
    skippedPrivate.push(template);
    continue;
  }
  if (isIgnored(template)) {
    skippedIgnored.push(template);
    continue;
  }
  const regex = templateToRegex(template);
  const matched = configRoutes.find((cr) => regex.test(cr));
  if (matched) {
    present.push({ template, configEntry: matched });
  } else {
    missing.push(template);
  }
}

// Reverse check: any config route doesn't match any filesystem template?
const orphaned = [];
for (const cr of configRoutes) {
  const stripped = cr.split("?")[0];
  const matched = fsTemplates.find((t) => templateToRegex(t).test(stripped));
  if (!matched && !isPrivate(stripped) && !cr.startsWith("/api/")) {
    orphaned.push(cr);
  }
}

function color(label, code) {
  if (process.env.NO_COLOR || !process.stdout.isTTY) return label;
  return `\x1b[${code}m${label}\x1b[0m`;
}

console.log(color(`\n=== check-routes-config ===`, 1));
console.log(`filesystem templates:  ${fsTemplates.length}`);
console.log(`config entries:        ${configRoutes.length}`);
console.log(`covered:               ${color(present.length, 32)}`);
console.log(`private (skipped):     ${skippedPrivate.length}`);
console.log(`ignored (perfignore):  ${skippedIgnored.length}`);
console.log(`missing budgets:       ${color(missing.length, missing.length ? 31 : 32)}`);
console.log(`orphaned config:       ${color(orphaned.length, orphaned.length ? 33 : 32)}`);

if (missing.length > 0) {
  console.log(color("\n=== Missing perf/routes.json entries ===", 31));
  for (const t of missing) console.log("  " + t);
  console.log(
    "\nFix: add an entry to perf/routes.json or list under perf/.perfignore",
  );
}

if (orphaned.length > 0) {
  console.log(color("\n=== Config entries with no matching page ===", 33));
  for (const o of orphaned) console.log("  " + o);
  console.log(
    "\nFix: remove from perf/routes.json or restore the corresponding page.tsx",
  );
}

if (process.argv.includes("--list-private")) {
  console.log(color("\n=== Skipped (private prefixes) ===", 90));
  for (const t of skippedPrivate) console.log("  " + t);
}

process.exit(missing.length === 0 ? 0 : 1);
