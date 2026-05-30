#!/usr/bin/env node
// Seed data/openrouter-usage.json with real per-MODEL data from OpenRouter's
// /rankings page Server Actions.
//
// Pulls TWO endpoints — each one is the right tool for its job:
//   1. CHART action — proper weekly time-series, top-9 named models +
//      "Others" per week, 53 weeks of history. Powers the stacked bar chart
//      so bars span the full timeline.
//   2. DATASET action with body ["week"] — latest-week per-model aggregation
//      with WoW deltas (~400 rows). Powers the top-20 sidebar.
//
// Why both: the chart action gives weekly history but only top-9 bands. The
// dataset action gives 400 models for the latest week but no real history
// (older weeks come back near-empty). Each surface uses the right one.
//
// Usage: node scripts/seed-openrouter-usage.mjs

import { writeFileSync } from "node:fs";

const URL = "https://openrouter.ai/rankings";
const STATE =
  "%5B%22%22%2C%7B%22children%22%3A%5B%22(home)%22%2C%7B%22children%22%3A%5B%22rankings%22%2C%7B%22children%22%3A%5B%22__PAGE__%22%2C%7B%7D%2Cnull%2Cnull%2C0%5D%7D%2Cnull%2Cnull%2C0%5D%7D%2Cnull%2Cnull%2C0%5D%7D%2Cnull%2Cnull%2C20%5D";
// CHART action — weekly per-model time-series, 53 weeks back, top-9 + Others.
// Rotates on every OpenRouter deploy; mirrored in worker fetcher as
// FALLBACK_NEXT_ACTION_MODEL.
const ACTION_CHART = "40b649b2cc6d44a360a3c410849222d446a6f535e9";
// DATASET action — per-model latest-week aggregation + WoW deltas.
// Same rotation caveat; mirrored as FALLBACK_NEXT_ACTION_LEADERBOARD.
const ACTION_DATASET = "40f9c1737045f5080a2f0df80bb985450bdd0f4367";

async function call(action, body = "[]") {
  const r = await fetch(URL, {
    method: "POST",
    headers: {
      "next-action": action,
      "content-type": "text/plain;charset=UTF-8",
      "accept": "text/x-component",
      "user-agent": "trendingrepo-worker/1.0 (+https://trendingrepo.com)",
      "next-router-state-tree": STATE,
    },
    body,
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const text = await r.text();
  const dataLine = text.split("\n").find((l) => l.startsWith("1:"));
  if (!dataLine) throw new Error("no RSC data line");
  return JSON.parse(dataLine.slice(2));
}

// 1. CHART time-series — top-9 + Others per week, 53 weeks. The 9 named
//    models shift week-over-week (different models top the list at different
//    times), so the UNION across 53 weeks is ~75 models. We persist all of
//    them and rank by ALL-TIME total so the chart can show 20+ stacked bands
//    (each week paints whichever 9 were top that week, others sit at zero).
const chartRaw = await call(ACTION_CHART);
const weeks = chartRaw.map((p) => ({ week: p.x, byModel: p.ys }));
console.log("chart weeks:", weeks.length, "first:", weeks[0].week, "last:", weeks[weeks.length - 1].week);

// All-time totals: sum each model's value across every week it appears in.
const allTimeTotals = new Map();
for (const w of weeks) {
  for (const [k, v] of Object.entries(w.byModel)) {
    allTimeTotals.set(k, (allTimeTotals.get(k) ?? 0) + Number(v));
  }
}
console.log("unique models across all weeks:", allTimeTotals.size);
const othersEntries = [...allTimeTotals.entries()].filter(([k]) => k.toLowerCase() === "others");
const namedEntries = [...allTimeTotals.entries()]
  .filter(([k]) => k.toLowerCase() !== "others")
  .sort((a, b) => b[1] - a[1]);
const modelsOrdered = [...namedEntries.map(([k]) => k), ...othersEntries.map(([k]) => k)];

// 2. Leaderboard via ["week"] body — latest-week aggregation + WoW deltas.
const lbRaw = await call(ACTION_DATASET, '["week"]');
const lbBucket = new Map();
for (const row of lbRaw) {
  const slug = row.model_permaslug;
  if (typeof slug !== "string" || slug.length === 0) continue;
  const prev = lbBucket.get(slug) ?? {
    slug,
    totalPromptTokens: 0,
    totalCompletionTokens: 0,
    totalReasoningTokens: 0,
    requests: 0,
    change: null,
  };
  prev.totalPromptTokens += Number(row.total_prompt_tokens || 0);
  prev.totalCompletionTokens += Number(row.total_completion_tokens || 0);
  prev.totalReasoningTokens += Number(row.total_native_tokens_reasoning || 0);
  prev.requests += Number(row.count || 0);
  if (row.change != null && Number.isFinite(Number(row.change))) {
    prev.change = Number(row.change);
  }
  lbBucket.set(slug, prev);
}
const leaderboard = [...lbBucket.values()]
  .map((m) => ({
    ...m,
    totalTokens: m.totalPromptTokens + m.totalCompletionTokens + m.totalReasoningTokens,
  }))
  .filter((m) => m.totalTokens > 0)
  .sort((a, b) => b.totalTokens - a.totalTokens)
  .slice(0, 30);
console.log("leaderboard rows:", leaderboard.length, "top:", leaderboard[0]?.slug);

const payload = {
  fetchedAt: new Date().toISOString(),
  source: "openrouter.ai /rankings server-action (chart action + dataset week)",
  weeks,
  modelsOrdered,
  leaderboard,
};

writeFileSync("data/openrouter-usage.json", JSON.stringify(payload, null, 2));
console.log("wrote data/openrouter-usage.json");
console.log("  chart bands:", modelsOrdered.length, "across", weeks.length, "weeks");
console.log("  leaderboard:", leaderboard.length, "models with WoW delta");
