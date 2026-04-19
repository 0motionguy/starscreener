#!/usr/bin/env node
/**
 * Portal v0.1 conformance runner — Star Screener.
 *
 * Vendored slim runner so CI can verify a Vercel preview (or prod) URL
 * without checking out the visitportal.dev spec repo. Exercises the
 * parts of the v0.1 contract that the server doesn't already guard
 * itself (the server's module-load validator covers manifest shape).
 *
 * Checks:
 *   1. GET <url>            → 200, application/json, portal_version ^0.1.
 *   2. POST /portal/call    → conformance probe returns {ok:false, code:"NOT_FOUND"}.
 *   3. POST /portal/call    → each of top_gainers, search_repos,
 *                              maintainer_profile returns a v0.1 envelope
 *                              (ok:true | ok:false with valid code).
 *
 * Usage:
 *   node scripts/portal-conformance.mjs <url>
 *     default: http://localhost:3023/portal
 *
 * Exit codes: 0 pass, 1 fail.
 */

const url = process.argv[2] ?? "http://localhost:3023/portal";
const TIMEOUT_MS = 8000;
const ERROR_CODES = [
  "NOT_FOUND",
  "INVALID_PARAMS",
  "UNAUTHORIZED",
  "RATE_LIMITED",
  "INTERNAL",
];

const results = [];

function record(name, ok, detail) {
  results.push({ name, ok, detail });
  const mark = ok ? "PASS" : "FAIL";
  console.log(`  ${mark}  ${name}${detail ? `  — ${detail}` : ""}`);
}

async function withTimeout(fn) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fn(ctrl.signal);
  } finally {
    clearTimeout(timer);
  }
}

async function check1Manifest() {
  console.log(`→ GET ${url}`);
  try {
    const res = await withTimeout((signal) =>
      fetch(url, { headers: { accept: "application/json" }, signal }),
    );
    if (!res.ok) {
      record("manifest reachable", false, `HTTP ${res.status}`);
      return null;
    }
    const ctype = res.headers.get("content-type") ?? "";
    if (!ctype.includes("application/json")) {
      record("manifest content-type", false, `got '${ctype}'`);
    } else {
      record("manifest content-type", true, "application/json");
    }
    const m = await res.json();
    record("manifest reachable", true, `${res.status} ${res.statusText}`);
    if (typeof m.portal_version !== "string" || !/^0\.1(\.[0-9]+)?$/.test(m.portal_version)) {
      record("portal_version matches ^0.1", false, `got ${JSON.stringify(m.portal_version)}`);
    } else {
      record("portal_version matches ^0.1", true, m.portal_version);
    }
    for (const k of ["name", "brief", "tools", "call_endpoint"]) {
      if (!(k in m)) {
        record(`manifest has '${k}'`, false);
      }
    }
    if (!Array.isArray(m.tools) || m.tools.length === 0) {
      record("manifest has tools", false);
      return m;
    }
    record("manifest has tools", true, `${m.tools.length} tools`);
    return m;
  } catch (err) {
    record("manifest reachable", false, String(err instanceof Error ? err.message : err));
    return null;
  }
}

async function check2NotFound(callEndpoint) {
  console.log(`→ POST ${callEndpoint}  { tool: "__visitportal_conformance_probe__" }`);
  try {
    const body = await postJson(callEndpoint, {
      tool: "__visitportal_conformance_probe__",
      params: {},
    });
    const ok =
      body &&
      typeof body === "object" &&
      body.ok === false &&
      typeof body.error === "string" &&
      body.code === "NOT_FOUND";
    record(
      "NOT_FOUND round-trip",
      ok,
      ok ? "envelope ok" : `got ${JSON.stringify(body).slice(0, 160)}`,
    );
  } catch (err) {
    record("NOT_FOUND round-trip", false, err instanceof Error ? err.message : String(err));
  }
}

async function check3Tool(callEndpoint, toolName, params) {
  console.log(`→ POST ${callEndpoint}  { tool: "${toolName}", ... }`);
  try {
    const body = await postJson(callEndpoint, { tool: toolName, params });
    if (body && typeof body === "object") {
      if (body.ok === true && "result" in body) {
        record(`${toolName} envelope`, true, "ok:true");
        return;
      }
      if (
        body.ok === false &&
        typeof body.error === "string" &&
        typeof body.code === "string" &&
        ERROR_CODES.includes(body.code)
      ) {
        record(
          `${toolName} envelope`,
          true,
          `ok:false code:${body.code} (acceptable on empty index)`,
        );
        return;
      }
    }
    record(
      `${toolName} envelope`,
      false,
      `malformed: ${JSON.stringify(body).slice(0, 160)}`,
    );
  } catch (err) {
    record(`${toolName} envelope`, false, err instanceof Error ? err.message : String(err));
  }
}

async function postJson(endpoint, body) {
  return withTimeout(async (signal) => {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify(body),
      signal,
    });
    return await res.json();
  });
}

async function main() {
  console.log(`Portal v0.1 conformance — ${url}\n`);

  const m = await check1Manifest();
  if (!m || !m.call_endpoint) {
    console.log("\nAborting — manifest unusable.");
    process.exit(1);
  }

  await check2NotFound(m.call_endpoint);
  await check3Tool(m.call_endpoint, "top_gainers", { limit: 3 });
  await check3Tool(m.call_endpoint, "search_repos", { query: "a", limit: 2 });
  await check3Tool(m.call_endpoint, "maintainer_profile", { handle: "anthropics" });

  const pass = results.every((r) => r.ok);
  const passed = results.filter((r) => r.ok).length;
  console.log(`\n${passed}/${results.length} checks passed`);
  console.log(pass ? "OK · Portal conformance green" : "FAIL · Portal conformance red");
  process.exit(pass ? 0 : 1);
}

await main();
