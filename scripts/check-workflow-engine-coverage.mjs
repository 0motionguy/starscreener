#!/usr/bin/env node
// Workflow-growth gate: every .github/workflows/*.yml must be mentioned by
// filename in docs/ENGINE.md. Pure Node 22 ESM, no deps. AGN NEXT-WAVE C3.
//
// Behavior:
//   1. Glob .github/workflows/*.yml and *.yaml.
//   2. Read docs/ENGINE.md.
//   3. For each workflow filename, check substring presence in ENGINE.md.
//   4. Print "WORKFLOWS: total=N documented=A undocumented=B".
//   5. Exit 1 with the undocumented list if B > 0; exit 0 otherwise.

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

const repoRoot = resolve(process.cwd());
const workflowsDir = join(repoRoot, ".github", "workflows");
const enginePath = join(repoRoot, "docs", "ENGINE.md");

function fail(msg) {
  process.stderr.write(`check-workflow-engine-coverage: ${msg}\n`);
  process.exit(2);
}

if (!existsSync(workflowsDir)) {
  fail(`missing directory ${workflowsDir}`);
}
if (!existsSync(enginePath)) {
  fail(`missing file ${enginePath}`);
}

let entries;
try {
  entries = readdirSync(workflowsDir, { withFileTypes: true });
} catch (err) {
  fail(`cannot read ${workflowsDir}: ${err.message}`);
}

const workflows = entries
  .filter(
    (d) =>
      d.isFile() &&
      (d.name.endsWith(".yml") || d.name.endsWith(".yaml"))
  )
  .map((d) => d.name)
  .sort();

if (workflows.length === 0) {
  fail(`no workflow files found in ${workflowsDir}`);
}

let engineMd;
try {
  engineMd = readFileSync(enginePath, "utf8");
} catch (err) {
  fail(`cannot read ${enginePath}: ${err.message}`);
}

const undocumented = [];
for (const name of workflows) {
  if (!engineMd.includes(name)) {
    undocumented.push(name);
  }
}

const total = workflows.length;
const docCount = total - undocumented.length;
const undocCount = undocumented.length;

process.stdout.write(
  `WORKFLOWS: total=${total} documented=${docCount} undocumented=${undocCount}\n`
);

if (undocCount > 0) {
  process.stdout.write("\nUndocumented workflows (add to docs/ENGINE.md):\n");
  for (const name of undocumented) {
    process.stdout.write(`  - .github/workflows/${name}\n`);
  }
  process.stdout.write(
    "\nFix: add a row/section to docs/ENGINE.md that mentions the workflow filename verbatim.\n"
  );
  process.exit(1);
}

process.exit(0);
