#!/usr/bin/env node
// Fetch x402 historical settlement volume from Dune.
//
// Companion SQL: .dune/x402-volume.sql (paste into Dune, save, note query id).
// Output: .data/dune-x402-volume.json
//
// Auth: DUNE_API_KEY env var (sent as X-Dune-API-Key header).
//
// Flags:
//   --query-id <N>   Dune query id to execute (required for live submission)
//   --dry-run        print SQL + planned API calls, exit 0
//   --timeout <sec>  cap status polling (default 300)

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";

const SQL_PATH = resolve(process.cwd(), ".dune/x402-volume.sql");
const OUT_PATH = resolve(process.cwd(), ".data/dune-x402-volume.json");
const DRY_RUN = process.argv.includes("--dry-run");
const QUERY_ID = parseStringArg("--query-id", null);
const TIMEOUT_SEC = parseNumberArg("--timeout", 300);
const POLL_INTERVAL_MS = 5000;

function parseNumberArg(name, fallback) {
  const idx = process.argv.indexOf(name);
  if (idx === -1 || idx === process.argv.length - 1) return fallback;
  const n = parseInt(process.argv[idx + 1], 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function parseStringArg(name, fallback) {
  const idx = process.argv.indexOf(name);
  if (idx === -1 || idx === process.argv.length - 1) return fallback;
  const v = process.argv[idx + 1];
  return v && !v.startsWith("--") ? v : fallback;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function duneFetch(path, init = {}) {
  const url = `https://api.dune.com/api/v1${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      "X-Dune-API-Key": process.env.DUNE_API_KEY ?? "",
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (res.status === 401) throw new Error(`Dune 401: bad/missing DUNE_API_KEY`);
  if (res.status === 402) throw new Error(`Dune 402: out of execution credits`);
  if (res.status === 429) throw new Error(`Dune 429: rate limited`);
  if (!res.ok) throw new Error(`Dune ${res.status}: ${await res.text()}`);
  return res.json();
}

async function main() {
  const sql = readFileSync(SQL_PATH, "utf8");

  if (DRY_RUN) {
    console.log("[dune-x402] --dry-run");
    console.log(`[dune-x402] sql file: ${SQL_PATH} (${sql.length} bytes)`);
    console.log(`[dune-x402] would: POST /query/${QUERY_ID ?? "<id>"}/execute`);
    console.log(`[dune-x402] would: GET  /execution/<exec_id>/status (poll every ${POLL_INTERVAL_MS}ms, cap ${TIMEOUT_SEC}s)`);
    console.log(`[dune-x402] would: GET  /execution/<exec_id>/results -> ${OUT_PATH}`);
    return;
  }

  if (!QUERY_ID) {
    console.error(
      "[dune-x402] --query-id is required.\n" +
        "Paste .dune/x402-volume.sql into a Dune query and pass its numeric id.",
    );
    process.exit(2);
  }
  if (!process.env.DUNE_API_KEY) {
    console.error("[dune-x402] DUNE_API_KEY not set in environment.");
    process.exit(2);
  }

  console.log(`[dune-x402] executing query ${QUERY_ID}`);
  const exec = await duneFetch(`/query/${QUERY_ID}/execute`, { method: "POST" });
  const execId = exec.execution_id;
  if (!execId) throw new Error(`no execution_id in response: ${JSON.stringify(exec)}`);
  console.log(`[dune-x402] execution_id=${execId}; polling status (cap ${TIMEOUT_SEC}s)`);

  const deadline = Date.now() + TIMEOUT_SEC * 1000;
  let state = "QUERY_STATE_PENDING";
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);
    const status = await duneFetch(`/execution/${execId}/status`);
    state = status.state ?? "UNKNOWN";
    process.stdout.write(`  state=${state}\n`);
    if (state === "QUERY_STATE_COMPLETED") break;
    if (state === "QUERY_STATE_FAILED" || state === "QUERY_STATE_CANCELLED") {
      throw new Error(`execution ${execId} ended in state ${state}`);
    }
  }
  if (state !== "QUERY_STATE_COMPLETED") {
    throw new Error(`execution ${execId} did not complete within ${TIMEOUT_SEC}s (last state: ${state})`);
  }

  const results = await duneFetch(`/execution/${execId}/results`);
  const rows = (results.result?.rows ?? []).map((r) => ({
    day: typeof r.day === "string" ? r.day.slice(0, 10) : r.day,
    facilitator: r.facilitator,
    txCount: Number(r.tx_count ?? 0),
    volumeUsdc: r.volume_usdc != null ? Number(r.volume_usdc).toFixed(2) : "0.00",
  }));
  rows.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : a.facilitator.localeCompare(b.facilitator)));

  const lastDay = rows.length ? rows[rows.length - 1].day : null;
  const out = {
    fetchedAt: new Date().toISOString(),
    source: "dune.com",
    queryId: QUERY_ID,
    executionId: execId,
    lastDay,
    rows,
  };

  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(out, null, 2), "utf8");
  console.log(`[dune-x402] wrote ${OUT_PATH} (${rows.length} rows, lastDay=${lastDay})`);
}

main().catch((err) => {
  console.error("[dune-x402] fatal:", err.message ?? err);
  process.exit(1);
});
