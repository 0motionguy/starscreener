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
  // Wave 2 surfaces — keep in sync with src/app/llms.txt/route.ts.
  ["Curated OSS collections", "/collections"],
  ["AI / open-source glossary", "/glossary"],
  ["What is an AI agent?", "/glossary/ai-agent"],
  ["What is MCP / the Model Context Protocol?", "/glossary/mcp"],
  ["What is RAG?", "/glossary/rag"],
  ["What is a vector database?", "/glossary/vector-database"],
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

// Ask Perplexity the target question and report whether trendingrepo.com is in
// the cited sources. This boolean — across the target queries — is the real GEO
// KPI (are AI engines citing us?), not search rank. Key-gated: only runs when
// PERPLEXITY_API_KEY is set, so CI / offline runs stay key-free.
async function checkCitation(query) {
  const key = process.env.PERPLEXITY_API_KEY;
  try {
    const res = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.PERPLEXITY_MODEL || "sonar",
        messages: [
          {
            role: "system",
            content:
              "Answer concisely and cite your sources. The user is researching trending open-source projects.",
          },
          { role: "user", content: query },
        ],
      }),
    });
    if (!res.ok) return { error: `HTTP ${res.status}` };
    const data = await res.json();
    // Perplexity returns top-level `citations` (array of URLs) and/or
    // `search_results` ([{url,...}]). Collect both, defensively.
    const sources = [
      ...(Array.isArray(data.citations) ? data.citations : []),
      ...(Array.isArray(data.search_results)
        ? data.search_results.map((s) => s?.url).filter(Boolean)
        : []),
    ];
    const cited = sources.some(
      (u) => typeof u === "string" && u.includes("trendingrepo.com"),
    );
    return { cited, sources };
  } catch (err) {
    return { error: String(err?.message || err) };
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

  // --- Citation check (the GEO KPI) — key-gated -------------------------
  // Runs only when PERPLEXITY_API_KEY is set, so CI / offline stays key-free.
  if (process.env.PERPLEXITY_API_KEY) {
    console.log("GEO citation check (Perplexity) — is trendingrepo.com cited?\n");
    let hits = 0;
    let asked = 0;
    let errors = 0;
    for (const [query] of TARGETS) {
      asked++;
      const r = await checkCitation(query);
      if (r.error) {
        errors++;
        console.log(`??    [${r.error}] Q: "${query}"`);
      } else {
        if (r.cited) hits++;
        console.log(`${r.cited ? "CITED" : "miss "} Q: "${query}"`);
      }
      // Gentle on rate limits.
      await new Promise((resolve) => setTimeout(resolve, 1200));
    }
    const measured = asked - errors;
    console.log(
      `\nGEO citation hit-rate: ${hits}/${measured} measured queries cite trendingrepo.com` +
        (errors ? ` (${errors} errored)` : "") +
        "\n",
    );
  } else {
    console.log(
      "(citation check skipped — set PERPLEXITY_API_KEY to measure AI-engine citations)\n",
    );
  }

  // Exit status reflects the CONTRACT only; the citation check is informational
  // so it never fails CI.
  process.exit(bad > 0 ? 1 : 0);
}

main();
