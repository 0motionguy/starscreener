#!/usr/bin/env node
// StarScreener — Sentry DSN verify probe (AGN-70 / AGN-803 follow-up).
//
// Sends a deterministic test event to the Sentry ingest endpoint parsed from
// SENTRY_DSN. No SDK dependency — uses the documented public Store API
// (https://develop.sentry.dev/sdk/store/) directly via Node 22's built-in fetch.
//
// USAGE
//   SENTRY_DSN=https://<public_key>@<host>/<project_id> npm run verify:sentry
//
// EXPECTED OUTPUT
//   ✓ DSN parsed (project_id=<id>, host=<host>)
//   ✓ event accepted by Sentry (id=<event_id>)
//     dashboard: https://<host>/issues/?query=<event_id>
//
// WHEN TO RUN
//   Post-deploy, after the operator sets SENTRY_DSN in the Vercel env (Production
//   + Preview). Confirms the DSN is well-formed and that ingest is reachable from
//   the operator's network. Exit 0 = wiring works; exit 1 = something to fix.

const dsn = process.env.SENTRY_DSN?.trim();

if (!dsn) {
  console.error("✗ MISSING — set SENTRY_DSN env var (https://<key>@<host>/<project_id>)");
  process.exit(1);
}

let parsed;
try {
  parsed = new URL(dsn);
} catch (err) {
  console.error(`✗ SENTRY_DSN is not a valid URL: ${err.message ?? err}`);
  process.exit(1);
}

const publicKey = parsed.username;
const projectId = parsed.pathname.replace(/^\//, "");

if (!publicKey || !projectId) {
  console.error(
    "✗ SENTRY_DSN missing public key or project id.\n" +
      "  Expected shape: https://<public_key>@<host>/<project_id>",
  );
  process.exit(1);
}

const ingestOrigin = `${parsed.protocol}//${parsed.host}`;
const storeEndpoint = `${ingestOrigin}/api/${projectId}/store/`;

console.log(`✓ DSN parsed (project_id=${projectId}, host=${parsed.host})`);

const timestamp = new Date().toISOString();
const payload = {
  message: `AGN-70 verify probe — ${timestamp}`,
  level: "info",
  environment: process.env.NODE_ENV ?? "verify-script",
  platform: "node",
  timestamp,
};

const sentryAuth = [
  "Sentry sentry_version=7",
  `sentry_client=starscreener-verify-script/1.0`,
  `sentry_timestamp=${Math.floor(Date.now() / 1000)}`,
  `sentry_key=${publicKey}`,
].join(", ");

let response;
try {
  response = await fetch(storeEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Sentry-Auth": sentryAuth,
      "User-Agent": "starscreener-verify-script/1.0",
    },
    body: JSON.stringify(payload),
  });
} catch (err) {
  console.error(`✗ network error reaching ${storeEndpoint}: ${err.message ?? err}`);
  process.exit(1);
}

const bodyText = await response.text();

if (response.status !== 200 && response.status !== 202) {
  console.error(`✗ Sentry rejected event (HTTP ${response.status})`);
  console.error(`  endpoint: ${storeEndpoint}`);
  console.error(`  body:     ${bodyText}`);
  process.exit(1);
}

let eventId = null;
try {
  const parsedBody = JSON.parse(bodyText);
  eventId = parsedBody?.id ?? null;
} catch {
  // Body wasn't JSON — keep eventId null but the 200/202 still counts as success.
}

console.log(`✓ event accepted by Sentry (id=${eventId ?? "<no id in response>"})`);
if (eventId) {
  console.log(`  dashboard: ${ingestOrigin}/issues/?query=${eventId}`);
}
process.exit(0);
