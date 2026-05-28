#!/usr/bin/env node
// GEO citation probe — the success metric for the answer-surface work.
//
// Two checks:
//   1. CONTRACT: every canonical answer URL we tell AI engines to cite (in
//      llms.txt) must return HTTP 200 — not a 30x redirect, not a 429. A
//      broken contract trains engines that we're unreliable.
//   2. CITATION (optional, needs a key): query a generative engine with the
//      target question and record whether trendingrepo.com appears in the
//      cited sources. That boolean — not search rank — is the GEO KPI.
//
// Usage:
//   node scripts/geo-citation-probe.mjs                      # contract vs localhost:3023
//   node scripts/geo-citation-probe.mjs https://trendingrepo.com
//
// Zero deps (Node 18+ global fetch). Citation check is left as a documented
// TODO so this runs offline in CI without leaking keys.

const BASE = (process.argv[2] || "http://localhost:3023").replace(/\/+$/, "");

// Target query -> the canonical TrendingRepo URL that should answer it.
// Keep in sync with the "Sample queries we answer" block in
// src/app/llms.txt/route.ts.
const TARGETS = [
  ["What AI agent repos are trending today?", "/categories/ai-agents"],
  ["Best open-source AI agents?", "/best/ai-agents"],
  ["Best AI coding assistants / copilots?", "/best/ai-coding-assistants"],
  ["Top MCP servers right now?", "/categories/mcp"],
  ["Best MCP servers?", "/best/mcp-servers"],
  ["Best local LLM / on-device inference projects?", "/categories/local-llm"],
  ["Best local LLM tools?", "/best/local-llm-tools"],
  ["Best vector databases?", "/best/vector-databases"],
  ["Best self-hosted AI tools?", "/best/self-hosted-ai"],
  ["Top Rust ecosystem projects right now?", "/categories/rust-ecosystem"],
  ["Browse trending open-source categories", "/categories"],
  ["Curated best-of open-source rankings", "/best"],
];

async function checkUrl(path) {
  const url = `${BASE}${path}`;
  try {
    // manual redirect so a 30x is a FAILURE, not silently followed.
    const res = await fetch(url, { redirect: "manual", headers: { "user-agent": "geo-citation-probe" } });
    return { url, status: res.status, location: res.headers.get("location") || "" };
  } catch (err) {
    return { url, status: 0, location: String(err?.message || err) };
  }
}

async function main() {
  console.log(`\nGEO citation-contract probe → ${BASE}\n`);
  let ok = 0;
  let bad = 0;
  for (const [query, path] of TARGETS) {
    const r = await checkUrl(path);
    const pass = r.status === 200;
    if (pass) ok++;
    else bad++;
    const flag = pass ? "OK " : "XX ";
    const extra = pass ? "" : `  -> ${r.status} ${r.location}`;
    console.log(`${flag}[${String(r.status).padStart(3)}] ${path}${extra}`);
    console.log(`        Q: "${query}"`);
  }
  console.log(`\n${ok}/${TARGETS.length} canonical answer URLs return 200. ${bad ? `${bad} BROKEN.` : "Contract intact."}\n`);

  // --- Optional citation check (manual / future) -------------------------
  // For each query, ask Perplexity (PERPLEXITY_API_KEY) or Google AI and check
  // whether the cited sources include trendingrepo.com. Record the hit rate
  // over time — that is the GEO KPI. Left unwired so this script stays
  // key-free and CI-safe; enable behind an env flag when ready.

  process.exit(bad > 0 ? 1 : 0);
}

main();
