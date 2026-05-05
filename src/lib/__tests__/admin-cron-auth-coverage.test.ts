import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readdirSync, readFileSync, statSync } from "node:fs";

type RouteFile = {
  relativePath: string;
  content: string;
};

function collectRouteFiles(relativeRoot: string): RouteFile[] {
  const root = path.join(process.cwd(), relativeRoot);
  const out: RouteFile[] = [];
  const stack = [root];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    for (const entry of readdirSync(current)) {
      const full = path.join(current, entry);
      const rel = path
        .relative(process.cwd(), full)
        .replace(/\\/g, "/");
      const s = statSync(full);
      if (s.isDirectory()) {
        stack.push(full);
        continue;
      }
      if (!/route\.tsx?$/.test(entry)) continue;
      out.push({
        relativePath: rel,
        content: readFileSync(full, "utf8"),
      });
    }
  }

  return out.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

test("admin routes enforce verifyAdminAuth gate (except admin/login)", () => {
  const files = collectRouteFiles("src/app/api/admin");
  const exempt = new Set(["src/app/api/admin/login/route.ts"]);
  const offenders: string[] = [];

  for (const file of files) {
    if (exempt.has(file.relativePath)) continue;
    const hasGate =
      file.content.includes("verifyAdminAuth(") &&
      file.content.includes("adminAuthFailureResponse(");
    if (!hasGate) offenders.push(file.relativePath);
  }

  assert.deepEqual(offenders, [], `missing admin auth gate: ${offenders.join(", ")}`);
});

test("cron routes enforce verifyCronAuth gate", () => {
  const files = collectRouteFiles("src/app/api/cron");
  const offenders: string[] = [];

  for (const file of files) {
    const hasGate =
      file.content.includes("verifyCronAuth(") &&
      file.content.includes("authFailureResponse(");
    if (!hasGate) offenders.push(file.relativePath);
  }

  assert.deepEqual(offenders, [], `missing cron auth gate: ${offenders.join(", ")}`);
});
