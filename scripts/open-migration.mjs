// Opens Supabase SQL editor in browser with the migration prefilled.
// Usage: node scripts/open-migration.mjs
//
// Because URL length caps, we use the editor's shareable "content" param.
// This is literally the fastest path for a human: one command → one click "Run".

import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(path.join(here, "builder-migration.sql"), "utf8");

const PROJECT_REF = "yzhhquzocdvqrdsbbytn";
const url = `https://supabase.com/dashboard/project/${PROJECT_REF}/sql/new?content=${encodeURIComponent(sql)}`;

const bytes = Buffer.byteLength(url);
if (bytes > 7500) {
  console.warn(
    `⚠  URL is ${bytes} bytes — Supabase may refuse prefill over ~8KB.`,
  );
  console.warn("   Falling back to empty editor; paste the SQL from scripts/builder-migration.sql.");
}

const openCmd =
  process.platform === "darwin"
    ? ["open", [url]]
    : process.platform === "win32"
      ? ["cmd", ["/c", "start", "", url]]
      : ["xdg-open", [url]];

console.log("Opening Supabase SQL editor with migration prefilled…");
spawn(openCmd[0], openCmd[1], { stdio: "ignore", detached: true }).unref();
console.log("If nothing opens, visit:");
console.log(url.slice(0, 120) + (url.length > 120 ? "…" : ""));
