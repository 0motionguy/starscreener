#!/usr/bin/env node
// TODO: wire into package.json lint:guards chain after the unrelated mcp-ranking working-tree settles
//
// Phase 5.4 CI guard — fail when a source page renders a hardcoded
// "live"-state LiveDot. Phase 1 fixed `/reddit/trending` and `/twitter`
// by replacing `<LiveDot label="FRESH · 1H" />` and `<LiveDot label="FEED LIVE" />`
// with `<FreshnessBadge source=... lastUpdatedAt=... />`. Hardcoded liveness
// labels are a brand-killer: they tell a "fresh" story while the underlying
// payload may be hours stale.
//
// THE RULE
//   In any `src/app/<source>/page.tsx` or `src/app/<source>/<sub>/page.tsx`
//   that imports `LiveDot` from `@/components/ui/LiveDot`, a `<LiveDot ...
//   label="<liveness-label>" />` JSX expression is a violation. Liveness
//   labels match (case-insensitive): FRESH, LIVE, FEED LIVE, FRESH · 1H,
//   anything starting with FRESH ·, anything starting with LIVE ·.
//
//   The correct pattern is:
//     <FreshnessBadge source="..." lastUpdatedAt={...} />
//   from @/components/shared/FreshnessBadge — it derives the freshness
//   colour from the actual `lastUpdatedAt` timestamp, so the badge can
//   never lie.
//
//   `LiveDot` is still allowed for *non-liveness* labels (e.g. `BREAKOUT`,
//   `DELAYED`, `// 01 SIGNAL VOLUME`).
//
// OPT-OUT
//   Add `// lint-allow: livedot-static — <reason>` on the same or
//   preceding line. Same convention as `lint:zod-routes`. Use sparingly —
//   the whole point of the rule is to keep these out of the codebase.
//
// Run via `node scripts/check-no-livedot-lies.mjs`. Exits 1 on any
// violation, 0 on clean scan.

import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve, relative } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const APP_DIR = resolve(ROOT, "src/app");

// Liveness label matcher — case-insensitive. Matches:
//   FRESH, LIVE, FEED LIVE
//   FRESH · 1H, FRESH · 3H, etc. (FRESH · <anything>)
//   LIVE · 24H, LIVE · TRUSTMRR, etc. (LIVE · <anything>)
// Does NOT match: BREAKOUT, DELAYED, OFFLINE, // 01 SIGNAL VOLUME.
const LIVENESS_LABEL_RE =
  /^(?:fresh|live|feed\s+live)(?:\s*[·•-]\s*.+)?$/i;

// Walk source pages: `src/app/**/page.tsx`.
async function* walkPages(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      // Skip API routes — they don't render LiveDot.
      if (entry.name === "api") continue;
      yield* walkPages(full);
    } else if (entry.isFile() && entry.name === "page.tsx") {
      yield full;
    }
  }
}

// Detect a `<LiveDot ... label="..." ... />` JSX expression and capture
// the label literal. We scan line-by-line so the violation report can
// point at a specific line. The pattern is intentionally simple — multi-
// line LiveDot calls aren't in idiomatic use anywhere in src/app.
const LIVEDOT_LABEL_RE = /<LiveDot\b[^>]*\blabel\s*=\s*"([^"]+)"/g;

const INLINE_ALLOW_RE = /\/\/\s*lint-allow:\s*livedot-static\b/;

const IMPORT_RE =
  /from\s+["']@\/components\/ui\/LiveDot["']|from\s+["']\.\.?\/.*\/LiveDot["']/;

function rel(file) {
  return relative(ROOT, file).replaceAll("\\", "/");
}

const violations = [];
let scanned = 0;

for await (const file of walkPages(APP_DIR)) {
  const content = await readFile(file, "utf8");
  scanned++;

  // Cheap fast-path: skip files that don't import LiveDot at all.
  if (!IMPORT_RE.test(content)) continue;

  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    LIVEDOT_LABEL_RE.lastIndex = 0;
    let m;
    while ((m = LIVEDOT_LABEL_RE.exec(line))) {
      const label = m[1];
      if (!LIVENESS_LABEL_RE.test(label.trim())) continue;

      // Inline allow on the same OR previous line.
      const sameLineAllow = INLINE_ALLOW_RE.test(line);
      const prevLineAllow = i > 0 && INLINE_ALLOW_RE.test(lines[i - 1]);
      if (sameLineAllow || prevLineAllow) continue;

      violations.push({
        file: rel(file),
        line: i + 1,
        label,
        snippet: line.trim(),
      });
    }
  }
}

if (violations.length === 0) {
  console.log(
    `[check-no-livedot-lies] OK — scanned ${scanned} source pages`,
  );
  process.exit(0);
}

console.error(
  `[check-no-livedot-lies] FAIL — ${violations.length} hardcoded live-label LiveDot(s) found.`,
);
console.error("");
console.error(
  "Use <FreshnessBadge source=\"...\" lastUpdatedAt={...} /> from",
);
console.error(
  "@/components/shared/FreshnessBadge instead. The badge derives its",
);
console.error(
  "colour from the actual timestamp so it can never claim 'FRESH' on",
);
console.error("a stale payload.");
console.error("");
console.error(
  "If a label is genuinely non-liveness (e.g. design-lab demo) add",
);
console.error(
  "`// lint-allow: livedot-static — <reason>` on the same or preceding line.",
);
console.error("");
for (const v of violations) {
  console.error(
    `  ❌ ${v.file}:${v.line}: hardcoded live-label LiveDot detected. ` +
      `Use <FreshnessBadge source=... lastUpdatedAt=... /> from ` +
      `@/components/shared/FreshnessBadge instead.`,
  );
  console.error(`     label="${v.label}"`);
  console.error(`     ${v.snippet}`);
}
process.exit(1);
