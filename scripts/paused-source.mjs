#!/usr/bin/env node

const [, , source = "unknown", command = "manual"] = process.argv;

console.warn(
  `[paused-source] ${source} is paused end-to-end; ${command} did not run a collector.`,
);
