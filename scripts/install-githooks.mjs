#!/usr/bin/env node
// scripts/install-githooks.mjs
//
// One-time setup: point `core.hooksPath` at `.githooks/` so the
// committed pre-push hook fires on `git push`. Run via:
//     npm run hooks:install
//
// We deliberately avoid `husky` to keep dev-dep weight down — the
// hook script is tiny, lives in version control, and self-skips in CI
// environments. See `.githooks/pre-push` header comment for why this
// gate exists in the first place.

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

function run(cmd, args) {
  return execFileSync(cmd, args, { encoding: "utf-8" }).trim();
}

try {
  const root = run("git", ["rev-parse", "--show-toplevel"]);
  const hooksDir = join(root, ".githooks");
  if (!existsSync(hooksDir)) {
    console.error(`[hooks:install] ${hooksDir} not found — wrong cwd?`);
    process.exit(1);
  }
  run("git", ["config", "core.hooksPath", ".githooks"]);
  console.log("[hooks:install] core.hooksPath -> .githooks");
  console.log("[hooks:install] pre-push: auth-provider-policy sentinel armed");
  console.log("[hooks:install] bypass with: git push --no-verify");
} catch (err) {
  console.error("[hooks:install] failed:", err.message);
  process.exit(1);
}
