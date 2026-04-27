#!/usr/bin/env node
// Bonus CI guard #3 (audit handoff) — fail when an API route handler
// exports a mutating method (POST/PUT/DELETE/PATCH) without importing
// parseBody from @/lib/api/parse-body. The Zod-validated body parser is
// the canonical replacement for the typeof-ladder pattern that APP-02
// swept across 6 routes; this guard prevents regression.
//
// Allow-listed exceptions are the Stripe webhook (uses request.text() for
// signature verification — JSON parse would mutate whitespace and break
// the HMAC) plus a couple of admin endpoints that take no body. Each
// entry here should carry a one-line reason.
//
// Run via `npm run lint:zod-routes`. Exits 1 on any unjustified route.

import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve, relative } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const API_DIR = resolve(ROOT, "src/app/api");

// Files where Zod parseBody legitimately does not apply (raw-body
// webhooks, no-body endpoints) OR are grandfathered legacy routes from
// before APP-02 closed the parseBody helper. Legacy routes should
// migrate when next touched — every entry carries a reason, so a
// reviewer flipping the rationale to "n/a" is the natural exit.
const ALLOW_NO_PARSEBODY = new Map([
  // True exceptions — these will never adopt parseBody.
  [
    "src/app/api/webhooks/stripe/route.ts",
    "Stripe webhook needs raw text() for HMAC sig verify; JSON reparse would mutate whitespace.",
  ],
  [
    "src/app/api/admin/scan/route.ts",
    "Body is { source: string } — minimal shape, manually validated against the SCRIPTS allow-list.",
  ],

  // Grandfathered: pre-APP-02 typeof-ladder routes. Migrate to parseBody
  // when next touched. Keep this list ratcheting down — never add a NEW
  // route here. The CI guard's value is catching new regressions; these
  // are pinned debt, not new permission.
  ["src/app/api/admin/login/route.ts", "legacy: pre-APP-02 — migrate when next touched"],
  ["src/app/api/admin/queues/repo/route.ts", "legacy: pre-APP-02 — migrate when next touched"],
  ["src/app/api/auth/session/route.ts", "legacy: pre-APP-02 — migrate when next touched"],
  ["src/app/api/checkout/stripe/route.ts", "legacy: pre-APP-02 — migrate when next touched"],
  ["src/app/api/cron/aiso-drain/route.ts", "legacy: pre-APP-02 — migrate when next touched"],
  ["src/app/api/cron/digest/weekly/route.ts", "legacy: pre-APP-02 — migrate when next touched"],
  ["src/app/api/cron/mcp/rotate-usage/route.ts", "legacy: pre-APP-02 — migrate when next touched"],
  ["src/app/api/cron/news-auto-recover/route.ts", "legacy: pre-APP-02 — migrate when next touched"],
  ["src/app/api/cron/predictions/calibrate/route.ts", "legacy: pre-APP-02 — migrate when next touched"],
  ["src/app/api/cron/predictions/route.ts", "legacy: pre-APP-02 — migrate when next touched"],
  ["src/app/api/cron/twitter-daily/route.ts", "legacy: pre-APP-02 — migrate when next touched"],
  ["src/app/api/cron/twitter-weekly-recap/route.ts", "legacy: pre-APP-02 — migrate when next touched"],
  ["src/app/api/cron/webhooks/flush/route.ts", "legacy: pre-APP-02 — migrate when next touched"],
  ["src/app/api/cron/webhooks/scan/route.ts", "legacy: pre-APP-02 — migrate when next touched"],
  ["src/app/api/export/csv/route.ts", "legacy: pre-APP-02 — migrate when next touched"],
  ["src/app/api/ideas/route.ts", "legacy: pre-APP-02 — migrate when next touched"],
  ["src/app/api/internal/signals/twitter/v1/ingest/route.ts", "legacy: pre-APP-02 — migrate when next touched"],
  ["src/app/api/internal/twitter/v1/findings/route.ts", "legacy: pre-APP-02 — migrate when next touched"],
  ["src/app/api/mcp/record-call/route.ts", "legacy: pre-APP-02 — migrate when next touched"],
  ["src/app/api/pipeline/alerts/route.ts", "legacy: pre-APP-02 — migrate when next touched"],
  ["src/app/api/pipeline/alerts/rules/route.ts", "legacy: pre-APP-02 — migrate when next touched"],
  ["src/app/api/pipeline/backfill-history/route.ts", "legacy: pre-APP-02 — migrate when next touched"],
  ["src/app/api/pipeline/cleanup/route.ts", "legacy: pre-APP-02 — migrate when next touched"],
  ["src/app/api/pipeline/ingest/route.ts", "legacy: pre-APP-02 — migrate when next touched"],
  ["src/app/api/pipeline/persist/route.ts", "legacy: pre-APP-02 — migrate when next touched"],
  ["src/app/api/pipeline/profiles/enrich/route.ts", "legacy: pre-APP-02 — migrate when next touched"],
  ["src/app/api/pipeline/rebuild/route.ts", "legacy: pre-APP-02 — migrate when next touched"],
  ["src/app/api/pipeline/recompute/route.ts", "legacy: pre-APP-02 — migrate when next touched"],
  ["src/app/api/pipeline/refresh/route.ts", "legacy: pre-APP-02 — migrate when next touched"],
  ["src/app/api/reactions/route.ts", "legacy: pre-APP-02 — migrate when next touched"],
  ["src/app/api/repo-submissions/route.ts", "legacy: pre-APP-02 — migrate when next touched"],
  ["src/app/api/repos/[owner]/[name]/aiso/route.ts", "legacy: pre-APP-02 — migrate when next touched"],
  ["src/app/api/submissions/revenue/route.ts", "legacy: pre-APP-02 — migrate when next touched"],
  ["src/app/api/watchlist/private/route.ts", "legacy: pre-APP-02 — migrate when next touched"],
]);

const MUTATING_METHODS = ["POST", "PUT", "DELETE", "PATCH"];

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
const exempted = [];

for await (const file of walkRoutes(API_DIR)) {
  const rel = relative(ROOT, file).replaceAll("\\", "/");
  const content = await readFile(file, "utf8");

  // Detect exported mutating methods. Match `export async function POST(`,
  // `export function POST(`, `export const POST =`. Cheap regex; route.ts
  // files don't have nested function declarations of these names.
  const hasMutating = MUTATING_METHODS.some((m) => {
    const re = new RegExp(
      `^export\\s+(?:async\\s+)?(?:function|const)\\s+${m}\\b`,
      "m",
    );
    return re.test(content);
  });
  if (!hasMutating) continue;

  // Already adopting parseBody? Anything in the file that imports from the
  // canonical helper passes — be liberal so renames or partial adoption
  // don't false-positive.
  const hasParseBody = /from\s+["']@\/lib\/api\/parse-body["']/.test(content);
  if (hasParseBody) continue;

  // File-level allow-list comment (operator-justified exception with a
  // visible rationale right next to the code).
  const hasInlineAllow = /\/\/\s*lint-allow:\s*no-parsebody\b/.test(content);
  if (hasInlineAllow) {
    exempted.push({ file: rel, reason: "inline lint-allow comment" });
    continue;
  }

  if (ALLOW_NO_PARSEBODY.has(rel)) {
    exempted.push({ file: rel, reason: ALLOW_NO_PARSEBODY.get(rel) });
    continue;
  }

  violations.push({ file: rel });
}

if (violations.length === 0) {
  console.log(
    `[check-zod-on-mutating-routes] OK — every mutating route imports parseBody (${exempted.length} exempted).`,
  );
  process.exit(0);
}

console.error(
  `[check-zod-on-mutating-routes] FAIL — ${violations.length} mutating route(s) skip Zod validation.`,
);
console.error(
  "Use parseBody(req, ZodSchema) from @/lib/api/parse-body instead of typeof ladders.",
);
console.error(
  "If a route legitimately can't use parseBody (raw-body webhook, etc.) add a",
);
console.error(
  '`// lint-allow: no-parsebody — <reason>` comment OR add it to ALLOW_NO_PARSEBODY in this script.',
);
console.error("");
for (const v of violations) {
  console.error(`  ${v.file}`);
}
process.exit(1);
