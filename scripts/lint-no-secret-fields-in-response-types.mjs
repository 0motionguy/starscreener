#!/usr/bin/env node
/**
 * Lint guard: fail CI if any exported interface in
 *   src/app/api/**\/route.ts
 *   src/app/api/**\/*.types.ts
 * has a field name matching /secret|password|hash|pat|token/i UNLESS the
 * field name is on the allowlist below.
 *
 * Why: API response shapes are the most common place where a secret
 * accidentally leaks to the client. Naming hygiene catches the leak at
 * type-definition time, before the field is even populated.
 *
 * Allowlist policy: the allowlisted names all describe SAFE-TO-RETURN
 * derivatives — last-4 token suffixes, boolean "does the secret exist"
 * flags, content-addressable digests, request idempotency keys — none
 * of which are the secret itself. Adding a new allowlist entry should
 * require a code review that confirms the field is a safe derivative.
 *
 * Added 2026-05-17 after session-G W5.5.C security audit.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = "src/app/api";

// Words that look like a raw secret when they appear as a camelCase
// component of a field name. Matching is on camelCase word boundaries
// (split `fooBarBaz` → `foo`, `Bar`, `Baz`, lowercase, compare) so we
// don't false-positive on substrings like "pat" inside "pattern" or
// "path". Add a new word only after confirming no legitimate field
// name uses it as a substring.
const SECRET_WORDS = new Set(["secret", "password", "hash", "pat", "token"]);

// Allowlist: full field names that LOOK like they might be secrets but
// are confirmed safe-to-return derivatives (last-4 suffix, presence
// boolean, content digest, idempotency key, hashed identifier). Match
// is case-sensitive — prefer the existing casing when adding a new
// entry so the diff is obvious in review.
const ALLOWLIST = new Set([
  "tokenLast4",
  "mcpTokenLast4",
  "hasWebhookSecret",
  "webhookSecretHash",
  "digest",
  "idempotencyKey",
  "ipHash",
]);

/**
 * Split a camelCase / PascalCase identifier into lowercase word tokens.
 *   "fooBarBaz" → ["foo", "bar", "baz"]
 *   "IPHash"    → ["ip", "hash"]
 *   "tokenLast4" → ["token", "last4"]
 *   "fullNamePattern" → ["full", "name", "pattern"]
 */
function splitCamel(name) {
  return name
    // Insert a boundary before an uppercase letter that follows a
    // lowercase letter or digit: fooBar → foo|Bar
    .replace(/([a-z0-9])([A-Z])/g, "$1|$2")
    // Insert a boundary between a run of uppercase and a lowercase:
    // IPHash → IP|Hash, JSONParser → JSON|Parser
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1|$2")
    .split("|")
    .map((s) => s.toLowerCase())
    .filter(Boolean);
}

function hasSecretToken(name) {
  for (const tok of splitCamel(name)) {
    if (SECRET_WORDS.has(tok)) return true;
  }
  return false;
}

const VIOLATIONS = [];

/**
 * Return true when the given path is one we should scan:
 *   - .../route.ts
 *   - .../foo.types.ts
 */
function shouldScan(file) {
  if (file.endsWith("/route.ts") || file.endsWith("\\route.ts")) return true;
  if (file.endsWith(".types.ts")) return true;
  return false;
}

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (entry === "node_modules" || entry.startsWith(".")) continue;
      walk(full);
      continue;
    }
    if (!shouldScan(full)) continue;
    scanFile(full);
  }
}

/**
 * Extract `export interface Foo { ... }` blocks and check each field name
 * inside. We deliberately keep the parser dumb: regex-bound interface
 * blocks + a simple field-name regex. The cost of a false positive is one
 * allowlist entry; the cost of a false negative is a leaked secret.
 */
function scanFile(file) {
  const body = readFileSync(file, "utf8");

  // Match `export interface Name [extends X] { ... }`. The body is
  // delimited by a balanced pair of braces — but we only need the
  // top-level brace, so a non-greedy `[\s\S]*?` plus the next unmatched
  // `}` is good enough for the response-type shapes we hold ourselves
  // to. Nested types inside an interface are still scanned because the
  // inner brace pairs survive the match.
  const interfaceRe = /export\s+interface\s+(\w+)[^\{]*\{([\s\S]*?)\n\}/g;

  let match;
  while ((match = interfaceRe.exec(body)) !== null) {
    const interfaceName = match[1];
    const interfaceBody = match[2];
    // Field declarations: `<name>[?]: <type>;` — capture the name. We
    // also accept readonly and quoted keys.
    const fieldRe = /(?:^|\n)\s*(?:readonly\s+)?["']?([a-zA-Z_$][\w$]*)["']?\s*\??\s*:/g;
    let fmatch;
    while ((fmatch = fieldRe.exec(interfaceBody)) !== null) {
      const fieldName = fmatch[1];
      if (!hasSecretToken(fieldName)) continue;
      if (ALLOWLIST.has(fieldName)) continue;
      VIOLATIONS.push({ file, interfaceName, fieldName });
    }
  }
}

try {
  walk(ROOT);
} catch (err) {
  // Root may not exist on a fresh checkout — that's not a violation.
  if (err && err.code !== "ENOENT") {
    console.error(`::warning::scan failed: ${err.message}`);
  }
}

if (VIOLATIONS.length > 0) {
  console.error(
    `::error::Found ${VIOLATIONS.length} exported interface field(s) that look like secrets:`,
  );
  for (const v of VIOLATIONS) {
    console.error(`  ${v.file}: interface ${v.interfaceName} -> ${v.fieldName}`);
  }
  console.error(
    `Response types must not expose raw secrets. Use a safe derivative ` +
      `(e.g. tokenLast4, hasWebhookSecret) and add the name to the allowlist ` +
      `in scripts/lint-no-secret-fields-in-response-types.mjs after a security review.`,
  );
  process.exit(1);
}

console.log("OK - no secret-shaped fields in exported response types.");
