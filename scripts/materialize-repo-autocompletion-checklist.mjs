#!/usr/bin/env node

import { spawn } from "node:child_process";
import { resolve } from "node:path";

const scriptPath = resolve(
  process.cwd(),
  "scripts",
  "build-autocompletion-checklist.mjs",
);

const child = spawn(process.execPath, [scriptPath], {
  cwd: process.cwd(),
  stdio: "inherit",
  env: process.env,
});

child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
