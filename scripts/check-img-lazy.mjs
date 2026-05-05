#!/usr/bin/env node
// CI guard for image lazy-loading discipline (AGN-901 / SPEED-28).
//
// Every <img> JSX usage must declare `loading="lazy"` (or
// `loading="eager"` if intentionally above the fold). Every Next.js
// <Image> usage must either declare `priority` (above the fold) or
// stay on the framework default (lazy) — we don't enforce the latter
// since `priority={false}` is the default already.
//
// Why: missing lazy hints below-the-fold cost mobile Lighthouse
// 3-8 points and waste DC bandwidth on lists of 100+ avatars.
//
// Scope: src/**/*.{tsx,jsx}. We skip:
//   - src/app/api/**            (server-rendered ImageResponse SVG)
//   - src/lib/__tests__/**      (XSS test fixtures contain `<img>` strings)
//   - any string literal that happens to embed `<img>` (markdown / HTML
//     snippets the user copies). We detect those by checking that the
//     match is preceded by a backtick or quote on the same line.
//
// Run via `npm run lint:img-lazy`. Exits 1 on any violation.

import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve, relative } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const SRC_DIR = resolve(ROOT, "src");

// Routes/dirs that are server-side image generators or test fixtures.
const SKIP_PREFIXES = [
  "src/app/api/og/",
  "src/app/opengraph-image",
  "src/app/twitter-image",
  "src/lib/__tests__/",
];

async function* walkSrc(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walkSrc(full);
    } else if (entry.isFile() && /\.(tsx|jsx)$/.test(entry.name)) {
      yield full;
    }
  }
}

// Match a JSX `<img ...>` opening tag. Captures the attribute body so
// we can scan it for `loading=`. Multi-line because JSX often wraps.
const IMG_TAG_RE = /<img\b([^>]*?)\/?>/gms;

// Match Next.js `<Image ...>` opening. We don't currently fail on the
// absence of `priority` because Next defaults to lazy — this guard is
// here in case we later want to enforce explicit annotation.
// const IMAGE_TAG_RE = /<Image\b([^>]*?)\/?>/gms;

function isInsideStringLiteral(content, matchIndex) {
  // Walk backwards on the same line. If we encounter an unmatched
  // opening backtick / quote before `<img`, we're inside a template or
  // string literal (HTML snippet, not rendered JSX). Also catches the
  // `// <img>` documentation case (where the line starts with `//`).
  const lineStart = content.lastIndexOf("\n", matchIndex - 1) + 1;
  const before = content.slice(lineStart, matchIndex);

  // Comment line.
  if (/^\s*\/\//.test(before)) return true;

  // Count unescaped backticks/quotes preceding the match. Odd count
  // means we're inside one. We treat each delimiter independently.
  for (const delim of ["`", '"', "'"]) {
    let count = 0;
    for (let i = 0; i < before.length; i++) {
      if (before[i] === delim && before[i - 1] !== "\\") count++;
    }
    if (count % 2 === 1) return true;
  }
  return false;
}

const violations = [];

for await (const file of walkSrc(SRC_DIR)) {
  const rel = relative(ROOT, file).replaceAll("\\", "/");
  if (SKIP_PREFIXES.some((p) => rel.startsWith(p))) continue;

  const content = await readFile(file, "utf8");

  IMG_TAG_RE.lastIndex = 0;
  let m;
  while ((m = IMG_TAG_RE.exec(content))) {
    if (isInsideStringLiteral(content, m.index)) continue;
    const attrs = m[1] ?? "";
    // Accept `loading="lazy"`, `loading="eager"`, or `loading={...}` —
    // the explicit annotation is what we care about.
    if (/\bloading\s*=\s*(?:"[^"]+"|\{[^}]+\})/.test(attrs)) continue;

    const upto = content.slice(0, m.index);
    const lineNo = upto.split("\n").length;
    const lineText = content.split("\n")[lineNo - 1].trim();
    violations.push({ file: rel, line: lineNo, snippet: lineText });
  }
}

if (violations.length === 0) {
  console.log(
    `[check-img-lazy] OK — every <img> declares an explicit loading attribute.`,
  );
  process.exit(0);
}

console.error(
  `[check-img-lazy] FAIL — ${violations.length} <img> tag(s) missing loading="lazy".`,
);
console.error(
  "Add loading=\"lazy\" (below the fold) or loading=\"eager\" (LCP/hero).",
);
console.error("Prefer EntityLogo or next/image when feasible.");
console.error("");
for (const v of violations.slice(0, 50)) {
  console.error(`  ${v.file}:${v.line}`);
  console.error(`    ${v.snippet}`);
}
if (violations.length > 50) {
  console.error(`  ... and ${violations.length - 50} more`);
}
process.exit(1);
