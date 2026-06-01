#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const workflowsDir = path.join(repoRoot, ".github", "workflows");
const apiDir = path.join(repoRoot, "src", "app", "api");

function walkFiles(dir, predicate, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const absolutePath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(absolutePath, predicate, out);
    } else if (predicate(absolutePath)) {
      out.push(absolutePath);
    }
  }
  return out;
}

function routePatternFromFile(file) {
  const relativePath = path.relative(apiDir, path.dirname(file));
  const parts = relativePath === "" ? [] : relativePath.split(path.sep);
  return ["api", ...parts];
}

function segmentMatches(patternSegment, pathSegment) {
  return (
    patternSegment === pathSegment ||
    (patternSegment.startsWith("[") && patternSegment.endsWith("]"))
  );
}

function routeMatches(patternParts, endpointPath) {
  const pathParts = endpointPath.replace(/^\/+|\/+$/g, "").split("/");
  for (let index = 0; index < patternParts.length; index += 1) {
    const patternPart = patternParts[index];
    if (patternPart.startsWith("[[...") && patternPart.endsWith("]]")) {
      return true;
    }
    if (patternPart.startsWith("[...") && patternPart.endsWith("]")) {
      return pathParts.length > index;
    }
    if (!segmentMatches(patternPart, pathParts[index])) {
      return false;
    }
  }
  return patternParts.length === pathParts.length;
}

const routePatterns = walkFiles(
  apiDir,
  (file) => path.basename(file) === "route.ts",
).map(routePatternFromFile);

const workflowFiles = walkFiles(workflowsDir, (file) => /\.ya?ml$/i.test(file));
const urlPattern =
  /(?:(?:\$\{?BASE_URL\}?\/?)|https:\/\/(?:www\.)?trendingrepo\.com)(?<path>\/api\/[A-Za-z0-9._~!$&()*+,;=:@%/-]+)/g;

const missing = [];

for (const file of workflowFiles) {
  const relativeFile = path.relative(repoRoot, file).replaceAll(path.sep, "/");
  const lines = readFileSync(file, "utf8").split(/\r?\n/);
  for (const [lineIndex, line] of lines.entries()) {
    if (line.trimStart().startsWith("#")) continue;
    for (const match of line.matchAll(urlPattern)) {
      const endpointPath = match.groups?.path
        ?.split(/[?#]/)[0]
        ?.replace(/\/$/, "");
      if (!endpointPath) continue;
      const exists = routePatterns.some((pattern) =>
        routeMatches(pattern, endpointPath),
      );
      if (!exists) {
        missing.push({
          file: relativeFile,
          line: lineIndex + 1,
          endpointPath,
        });
      }
    }
  }
}

if (missing.length > 0) {
  console.error("[check-workflow-api-routes] Missing route targets:");
  for (const item of missing) {
    console.error(`- ${item.file}:${item.line} -> ${item.endpointPath}`);
  }
  process.exit(1);
}

console.log(
  `[check-workflow-api-routes] OK - ${workflowFiles.length} workflow file(s), ${routePatterns.length} API route pattern(s) checked.`,
);
