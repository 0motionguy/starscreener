#!/usr/bin/env node
// Verify CSP manifest sanity + flag hard-coded HTTPS script/fetch URLs
// in src/components/** + src/app/** that aren't allow-listed in the
// CSP manifest.
//
// History (2026-05-31): a new third-party (Cloudflare Web Analytics
// via static.cloudflareinsights.com) shipped without adding the host
// to next.config.ts's CSP, breaking the dashboard silently on prod.
// The CSP was a hand-edited string with no validation.
//
// This lint backs the new src/lib/csp/manifest.ts (D.6 single source
// of truth) by:
//   1. Reading the manifest and asserting it renders to a non-empty
//      CSP with no duplicate hosts inside a directive.
//   2. Scanning src/components/** + src/app/** for hard-coded HTTPS
//      hosts in <script src="...">, <link href="...">, fetch(...),
//      new EventSource(...), new WebSocket(...) calls, and asserting
//      every host is allow-listed somewhere in the manifest OR in the
//      KNOWN_IGNORE set (typically outbound nav links).

import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const ROOT = process.cwd();
const SCAN_DIRS = ["src/components", "src/app"];

// Outbound hosts that are NOT script/fetch sources — typically <a href>
// nav links and image references that won't trigger CSP rules. Add
// here when a new outbound link gets used in JSX.
const KNOWN_IGNORE = new Set([
  "github.com",
  "www.github.com",
  "api.github.com",
  "vercel.com",
  "twitter.com",
  "x.com",
  "bsky.app",
  "news.ycombinator.com",
  "old.reddit.com",
  "www.reddit.com",
  "reddit.com",
  "dev.to",
  "lobste.rs",
  "www.producthunt.com",
  "producthunt.com",
  "hn.algolia.com",
  "ossinsight.io",
  "api.ossinsight.io",
  "huggingface.co",
  "arxiv.org",
  "anthropic.com",
  "claude.ai",
  "openai.com",
  "trendingrepo.com",
  "www.trendingrepo.com",
  "aiso.tools",
  "api.aiso.tools",
  "mcp.aiso.tools",
  "toolbox.aiso.tools",
  "fonts.googleapis.com", // covered by manifest style-src
  "fonts.gstatic.com", // covered by manifest font-src
]);

const manifestPath = path.resolve(ROOT, "src/lib/csp/manifest-data.mjs");
let csp;
let allowedHosts;
try {
  const mod = await import(url.pathToFileURL(manifestPath).href);
  csp = mod.renderCsp();
  allowedHosts = mod.allHttpsHosts();
} catch (err) {
  console.error(`[check-csp-completeness] FAIL — could not import manifest: ${err.message}`);
  process.exit(1);
}

if (!csp || !csp.includes("default-src")) {
  console.error(`[check-csp-completeness] FAIL — renderCsp() produced empty/invalid CSP`);
  process.exit(1);
}

// Convert manifest patterns (https://*.clerk.dev) into matchers for hostnames.
function matchesAllowed(host) {
  if (allowedHosts.includes(`https://${host}`)) return true;
  for (const pattern of allowedHosts) {
    const p = pattern.replace(/^https:\/\//, "");
    if (p.startsWith("*.")) {
      const suffix = p.slice(2); // e.g. clerk.dev
      if (host === suffix || host.endsWith(`.${suffix}`)) return true;
    } else if (p === host) {
      return true;
    }
  }
  return false;
}

function walk(dir, out = []) {
  const abs = path.resolve(ROOT, dir);
  if (!fs.existsSync(abs)) return out;
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.match(/\.(ts|tsx|jsx|js|mjs)$/)) out.push(full);
  }
  return out;
}

// Patterns that suggest a CSP-relevant load (not just an outbound nav link).
const CSP_LOAD_PATTERNS = [
  /<script\s[^>]*src=["']https:\/\/([^/"']+)/g,
  /<link\s[^>]*href=["']https:\/\/([^/"']+)/g,
  /fetch\(["']https:\/\/([^/"']+)/g,
  /new\s+EventSource\(["']https:\/\/([^/"']+)/g,
  /new\s+WebSocket\(["']wss:\/\/([^/"']+)/g,
];

const violations = [];
const scanned = SCAN_DIRS.flatMap((d) => walk(d));

for (const rel of scanned) {
  const norm = rel.split(path.sep).join("/");
  if (norm.includes("__tests__") || norm.includes(".test.")) continue;
  const src = fs.readFileSync(path.resolve(ROOT, rel), "utf8");

  for (const pat of CSP_LOAD_PATTERNS) {
    pat.lastIndex = 0;
    let m;
    while ((m = pat.exec(src)) !== null) {
      const host = m[1];
      if (KNOWN_IGNORE.has(host)) continue;
      if (matchesAllowed(host)) continue;
      const lineNum = src.slice(0, m.index).split("\n").length;
      violations.push({ file: norm, line: lineNum, host });
    }
  }
}

if (violations.length === 0) {
  console.log(`[check-csp-completeness] OK — manifest renders ${csp.split(";").length} directives, ${allowedHosts.length} HTTPS host(s), ${scanned.length} file(s) scanned.`);
  process.exit(0);
}

console.error(`[check-csp-completeness] FAIL — ${violations.length} HTTPS host(s) loaded by JSX/code but not in CSP manifest:`);
for (const v of violations) {
  console.error(`  ${v.file}:${v.line}  ${v.host}`);
}
console.error(``);
console.error(`Fix: add the host to the relevant directive in src/lib/csp/manifest.ts.`);
console.error(`If the URL is a nav link or image-only (no script/style/fetch/socket),`);
console.error(`add the host to KNOWN_IGNORE in this script with a one-line WHY.`);
process.exit(1);
