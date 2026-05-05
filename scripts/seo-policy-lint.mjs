#!/usr/bin/env node
// scripts/seo-policy-lint.mjs — SEO policy drift detector.
//
// Walks src/app/**/page.tsx (and the sibling layout.tsx for "use client"
// pages that own their metadata via the layout pattern) and verifies that
// every file declares its SEO class via a top-of-file annotation:
//
//   // SEO: indexable | canonical-only | noindex | redirect
//
// Then for each declared class, sanity-checks that the metadata export
// (or absence thereof) is consistent. This is a best-effort string lint —
// it doesn't parse TypeScript. The intent is to catch obvious drift
// (missing class tag, redirect page that exports metadata, noindex page
// that forgot robots.index = false) and route the engineer to the
// docs/SEO-POLICY.md spec for the rest.
//
// Exit codes:
//   0 — no drift
//   1 — drift detected; details written to stdout

import { readFileSync, statSync, readdirSync } from "node:fs";
import { join, relative, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const APP_DIR = join(REPO_ROOT, "src", "app");

const VALID_CLASSES = new Set([
  "indexable",
  "canonical-only",
  "noindex",
  "redirect",
]);

const ANNOTATION_RE = /^\/\/\s*SEO:\s*(indexable|canonical-only|noindex|redirect)\b/m;
const HEAD_LINES = 8; // annotation must be near the top

/** Recursively walk `dir` and yield every `page.tsx`. */
function* walkPages(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      // Skip Next.js conventional internals + test dirs.
      if (entry.name.startsWith("_") || entry.name === "__tests__") continue;
      yield* walkPages(full);
      continue;
    }
    if (entry.isFile() && entry.name === "page.tsx") {
      yield full;
    }
  }
}

function readHead(path, lines = HEAD_LINES) {
  const text = readFileSync(path, "utf8");
  const head = text.split("\n").slice(0, lines).join("\n");
  return { text, head };
}

function classOf(file) {
  const { head } = readHead(file);
  const match = head.match(ANNOTATION_RE);
  return match ? match[1] : null;
}

function hasMetadataExport(text) {
  return (
    /export\s+const\s+metadata\b/.test(text) ||
    /export\s+(?:async\s+)?function\s+generateMetadata\b/.test(text)
  );
}

function siblingLayoutHasMetadata(file) {
  const layout = join(dirname(file), "layout.tsx");
  try {
    statSync(layout);
  } catch {
    return false;
  }
  const text = readFileSync(layout, "utf8");
  return hasMetadataExport(text);
}

function hasRobotsNoindex(text) {
  // Loose match — covers `index: false` inside a `robots: { ... }` block
  // and the shorthand `robots: "noindex"` form. Not a parser; good enough
  // to catch missed exports.
  return /robots\s*:\s*\{[^}]*index\s*:\s*false/.test(text) ||
    /robots\s*:\s*['"]noindex/.test(text);
}

function hasAlternatesCanonical(text) {
  return /alternates\s*:\s*\{[^}]*canonical/.test(text);
}

const drift = [];

for (const file of walkPages(APP_DIR)) {
  const rel = relative(REPO_ROOT, file).replace(/\\/g, "/");
  const cls = classOf(file);

  if (!cls) {
    drift.push({ file: rel, reason: "missing `// SEO: <class>` annotation" });
    continue;
  }

  if (!VALID_CLASSES.has(cls)) {
    drift.push({ file: rel, reason: `unknown class "${cls}"` });
    continue;
  }

  const { text } = readHead(file, 1_000_000);
  const ownsMeta = hasMetadataExport(text);
  const layoutMeta = siblingLayoutHasMetadata(file);

  switch (cls) {
    case "indexable":
    case "canonical-only": {
      if (!ownsMeta && !layoutMeta) {
        drift.push({
          file: rel,
          reason: `class "${cls}" requires metadata export (page or sibling layout.tsx)`,
        });
      }
      if (cls === "canonical-only") {
        // Either the page or the sibling layout must declare robots.index = false.
        const layoutText = layoutMeta
          ? readFileSync(join(dirname(file), "layout.tsx"), "utf8")
          : "";
        if (!hasRobotsNoindex(text) && !hasRobotsNoindex(layoutText)) {
          drift.push({
            file: rel,
            reason: `class "canonical-only" requires robots.index = false`,
          });
        }
      }
      break;
    }
    case "noindex": {
      if (!ownsMeta && !layoutMeta) {
        drift.push({
          file: rel,
          reason: `class "noindex" requires metadata export with robots.index = false`,
        });
        break;
      }
      const layoutText = layoutMeta
        ? readFileSync(join(dirname(file), "layout.tsx"), "utf8")
        : "";
      if (!hasRobotsNoindex(text) && !hasRobotsNoindex(layoutText)) {
        drift.push({
          file: rel,
          reason: `class "noindex" requires robots.index = false`,
        });
      }
      break;
    }
    case "redirect": {
      if (ownsMeta) {
        drift.push({
          file: rel,
          reason: `class "redirect" must not export metadata (dead bytes — redirect happens before render)`,
        });
      }
      break;
    }
  }
}

if (drift.length === 0) {
  console.log("seo-policy-lint: no drift across", "src/app/**/page.tsx");
  process.exit(0);
}

console.log(`seo-policy-lint: ${drift.length} drift entries\n`);
for (const entry of drift) {
  console.log(`  ${entry.file}\n    ${entry.reason}`);
}
console.log(
  "\nSee docs/SEO-POLICY.md for the per-class metadata contract.",
);
process.exit(1);
