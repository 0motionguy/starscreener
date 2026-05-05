#!/usr/bin/env node
// Internal markdown link checker for STARSCREENER docs.
// Walks docs/, tasks/, root *.md, .claude/skills/project, .claude/agents/project,
// and subdir CLAUDE.md files. Flags broken local [text](path) links.
// Pure Node 22 ESM, no deps.
import fs from "node:fs";
import path from "node:path";

const REPO_ROOT = path.resolve(process.cwd());
const SKIP_DIRS = new Set([
  "node_modules",
  ".next",
  ".git",
  ".stryker-tmp",
  "awesome-codex-skills",
  "starscreener-inspection",
  "starscreener-fix",
]);
const SKIP_PATH_FRAGMENTS = [
  path.join(".claude", "worktrees"),
  path.join("docs", "archive"),
];

function shouldSkipDir(absDir) {
  const base = path.basename(absDir);
  if (SKIP_DIRS.has(base)) return true;
  const rel = path.relative(REPO_ROOT, absDir);
  for (const frag of SKIP_PATH_FRAGMENTS) {
    if (rel === frag || rel.startsWith(frag + path.sep)) return true;
  }
  return false;
}

function walkMd(dir, out) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const ent of entries) {
    const abs = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (shouldSkipDir(abs)) continue;
      walkMd(abs, out);
    } else if (ent.isFile() && ent.name.toLowerCase().endsWith(".md")) {
      out.push(abs);
    }
  }
}

function collectFiles() {
  const files = new Set();
  // docs/, tasks/
  for (const sub of ["docs", "tasks"]) {
    const abs = path.join(REPO_ROOT, sub);
    if (fs.existsSync(abs)) {
      const acc = [];
      walkMd(abs, acc);
      acc.forEach((f) => files.add(f));
    }
  }
  // root-level *.md
  for (const ent of fs.readdirSync(REPO_ROOT, { withFileTypes: true })) {
    if (ent.isFile() && ent.name.toLowerCase().endsWith(".md")) {
      files.add(path.join(REPO_ROOT, ent.name));
    }
  }
  // .claude/skills/project/**/SKILL.md
  const skillsRoot = path.join(REPO_ROOT, ".claude", "skills", "project");
  if (fs.existsSync(skillsRoot)) {
    const acc = [];
    walkMd(skillsRoot, acc);
    acc.filter((f) => path.basename(f) === "SKILL.md").forEach((f) => files.add(f));
  }
  // .claude/agents/project/*.md
  const agentsRoot = path.join(REPO_ROOT, ".claude", "agents", "project");
  if (fs.existsSync(agentsRoot)) {
    for (const ent of fs.readdirSync(agentsRoot, { withFileTypes: true })) {
      if (ent.isFile() && ent.name.toLowerCase().endsWith(".md")) {
        files.add(path.join(agentsRoot, ent.name));
      }
    }
  }
  // subdir CLAUDE.md files
  function findClaudeMd(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      const abs = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (shouldSkipDir(abs)) continue;
        findClaudeMd(abs);
      } else if (ent.isFile() && ent.name === "CLAUDE.md") {
        files.add(abs);
      }
    }
  }
  for (const root of ["src", "apps", path.join(".github", "workflows")]) {
    const abs = path.join(REPO_ROOT, root);
    if (fs.existsSync(abs)) findClaudeMd(abs);
  }
  return [...files];
}

const LINK_RE = /\[([^\]]+)\]\(([^)#\s]+?)(#[^)\s]*)?\)/g;
const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---/;
const SKIP_FRONTMATTER_STATUSES = new Set(["archive", "pointer"]);

function extractLinks(text) {
  const out = [];
  let m;
  while ((m = LINK_RE.exec(text)) !== null) {
    out.push({ textLabel: m[1], target: m[2] });
  }
  return out;
}

function shouldSkipForFrontmatter(text) {
  const m = FRONTMATTER_RE.exec(text);
  if (!m) return false;
  const block = m[1];
  const statusMatch = /^status:\s*([^\s#]+)/m.exec(block);
  if (!statusMatch) return false;
  const value = statusMatch[1].trim().replace(/^["']|["']$/g, "");
  return SKIP_FRONTMATTER_STATUSES.has(value);
}

function isExternalOrSpecial(target) {
  return /^(https?:|mailto:|tel:|ftp:|data:|#|\/\/)/i.test(target);
}

function resolveTarget(srcFile, target) {
  if (target.startsWith("/")) return path.join(REPO_ROOT, target.slice(1));
  return path.resolve(path.dirname(srcFile), target);
}

const files = collectFiles();
const broken = [];
let totalLinks = 0;
let skipped = 0;
for (const f of files) {
  let body;
  try {
    body = fs.readFileSync(f, "utf8");
  } catch {
    continue;
  }
  if (shouldSkipForFrontmatter(body)) {
    skipped++;
    continue;
  }
  for (const { textLabel, target } of extractLinks(body)) {
    if (isExternalOrSpecial(target)) continue;
    totalLinks++;
    const resolved = resolveTarget(f, target);
    let exists = false;
    try {
      fs.statSync(resolved);
      exists = true;
    } catch {
      exists = false;
    }
    if (!exists) {
      broken.push({
        source: path.relative(REPO_ROOT, f).replaceAll("\\", "/"),
        label: textLabel,
        target,
      });
    }
  }
}

const reportPath = path.join(REPO_ROOT, "docs", "_generated", "broken-links.md");
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
const ts = new Date().toISOString();
let report = `# Broken internal doc links - ${ts}\n\nGenerated by \`scripts/check-internal-doc-links.mjs\`.\n\n## Broken links\n\n| Source file | Link text | Target path |\n| --- | --- | --- |\n`;
if (broken.length === 0) {
  report += "| (none) | - | - |\n";
} else {
  for (const b of broken) {
    const safeLabel = b.label.replaceAll("|", "\\|");
    const safeTarget = b.target.replaceAll("|", "\\|");
    report += `| ${b.source} | ${safeLabel} | ${safeTarget} |\n`;
  }
}
fs.writeFileSync(reportPath, report);

console.log(`LINKS: scanned=${files.length} skipped=${skipped} total-links=${totalLinks} broken=${broken.length}`);
process.exit(broken.length === 0 ? 0 : 1);
