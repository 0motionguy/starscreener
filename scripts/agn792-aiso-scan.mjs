#!/usr/bin/env node
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const TARGET_URL = process.env.AGN792_AISO_URL || "https://trendingrepo.com";
const API_URL = process.env.AGN792_AISO_API_URL || "https://aiso.tools/api/scan";
const now = new Date();
const stamp = now.toISOString().replaceAll(":", "").replaceAll("-", "");
// AGN-1606: write to docs/archive/forensic/<YYYY-MM-DD>/ — top-level docs/forensic/ is archived.
const dayBucket = now.toISOString().slice(0, 10);
const outDir = resolve(process.cwd(), "docs", "archive", "forensic", dayBucket);
const outDirRel = `docs/archive/forensic/${dayBucket}`;
mkdirSync(outDir, { recursive: true });

const res = await fetch(API_URL, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ url: TARGET_URL })
});

const bodyText = await res.text();
let parsed;
try { parsed = JSON.parse(bodyText); } catch { parsed = { raw: bodyText }; }
const headers = Object.fromEntries(res.headers.entries());
const retryAfter = Number(parsed?.retryAfterSeconds ?? headers["retry-after"] ?? 0);
const nextRetryAt = retryAfter > 0 ? new Date(Date.now() + retryAfter * 1000).toISOString() : null;

const artifact = {
  capturedAt: now.toISOString(),
  targetUrl: TARGET_URL,
  request: { method: "POST", url: API_URL, payload: { url: TARGET_URL } },
  response: { status: res.status, headers, body: parsed, retryAfterSeconds: retryAfter || null, nextRetryAt }
};

const jsonPath = resolve(outDir, `AGN-792-AISO-SCAN-${stamp}.json`);
writeFileSync(jsonPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");

const mdPath = resolve(outDir, "13-AISO-SELF-SCAN.md");
const lines = [
  "",
  `## Automated attempt � ${now.toISOString()}`,
  "",
  `- Target: \`${TARGET_URL}\``,
  `- Endpoint: \`${API_URL}\``,
  `- Status: \`${res.status}\``,
  `- Artifact: \`${outDirRel}/AGN-792-AISO-SCAN-${stamp}.json\``,
  parsed?.error ? `- Error: \`${parsed.error}\`` : null,
  retryAfter ? `- Retry after (seconds): \`${retryAfter}\`` : null,
  nextRetryAt ? `- Next retry at (UTC): \`${nextRetryAt}\`` : null
].filter(Boolean);
appendFileSync(mdPath, `${lines.join("\n")}\n`, "utf8");

console.log(JSON.stringify(artifact, null, 2));
if (res.status >= 400) process.exit(1);
