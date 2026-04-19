#!/usr/bin/env node
// StarScreener CLI (`ss`) — read-only terminal client for the StarScreener API.
// Native Node 18+ only. No external dependencies.

"use strict";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const BASE_URL = (
  process.env.STARSCREENER_API_URL || "http://localhost:3023"
).replace(/\/+$/, "");

const CLI_VERSION = "0.1.0";

// Map our --window values to the API's `period` param.
const WINDOW_TO_PERIOD = {
  "24h": "today",
  today: "today",
  "7d": "week",
  week: "week",
  "30d": "month",
  month: "month",
};

// ---------------------------------------------------------------------------
// Argv parser
// Tiny handwritten parser. Supports:
//   --flag            → { flag: true }
//   --key=value       → { key: "value" }
//   --key value       → { key: "value" }   (only if value doesn't start with --)
// Positional args accumulate in `_`.
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i];
    if (tok.startsWith("--")) {
      const eq = tok.indexOf("=");
      if (eq !== -1) {
        out[tok.slice(2, eq)] = tok.slice(eq + 1);
      } else {
        const key = tok.slice(2);
        const next = argv[i + 1];
        if (next !== undefined && !next.startsWith("--")) {
          out[key] = next;
          i++;
        } else {
          out[key] = true;
        }
      }
    } else {
      out._.push(tok);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

async function apiGet(path) {
  const url = `${BASE_URL}${path}`;
  let res;
  try {
    res = await fetch(url, { headers: { accept: "application/json" } });
  } catch (err) {
    fail(`network error: ${err.message}\n  (is the dev server running at ${BASE_URL}?)`);
  }
  if (!res.ok) {
    let body = "";
    try {
      body = await res.text();
    } catch {
      /* ignore */
    }
    fail(
      `HTTP ${res.status} ${res.statusText} on ${path}${
        body ? `\n  ${body.slice(0, 400)}` : ""
      }`,
    );
  }
  try {
    return await res.json();
  } catch (err) {
    fail(`invalid JSON from ${path}: ${err.message}`);
  }
}

// ---------------------------------------------------------------------------
// Output helpers
// ---------------------------------------------------------------------------

function fail(msg) {
  process.stderr.write(`ss: ${msg}\n`);
  process.exit(1);
}

function printJson(obj) {
  process.stdout.write(JSON.stringify(obj, null, 2) + "\n");
}

function pad(str, width, align = "left") {
  const s = String(str);
  if (s.length >= width) return s.slice(0, width);
  const gap = " ".repeat(width - s.length);
  return align === "right" ? gap + s : s + gap;
}

function fmtNum(n) {
  if (n == null || Number.isNaN(n)) return "-";
  const v = Number(n);
  if (!Number.isFinite(v)) return "-";
  return v.toLocaleString("en-US");
}

function fmtDelta(n) {
  if (n == null || Number.isNaN(n)) return "-";
  const v = Number(n);
  if (!Number.isFinite(v)) return "-";
  if (v === 0) return "0";
  const sign = v > 0 ? "+" : "";
  return sign + v.toLocaleString("en-US");
}

function fmtMomentum(n) {
  if (n == null || Number.isNaN(n)) return "-";
  const v = Number(n);
  if (!Number.isFinite(v)) return "-";
  return v.toFixed(1);
}

function renderTable(headers, rows, aligns = []) {
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => String(r[i] ?? "").length)),
  );
  const line = (cells) =>
    cells.map((c, i) => pad(c, widths[i], aligns[i] || "left")).join("  ");
  process.stdout.write(line(headers) + "\n");
  process.stdout.write(
    widths.map((w) => "-".repeat(w)).join("  ") + "\n",
  );
  for (const r of rows) process.stdout.write(line(r) + "\n");
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

function buildRepoTable(repos, { showRank = true } = {}) {
  const headers = showRank
    ? ["#", "REPO", "STARS", "24H", "7D", "MOMENTUM", "STATUS"]
    : ["REPO", "STARS", "24H", "7D", "MOMENTUM", "STATUS"];
  const aligns = showRank
    ? ["right", "left", "right", "right", "right", "right", "left"]
    : ["left", "right", "right", "right", "right", "left"];
  const rows = repos.map((r, i) => {
    const base = [
      pad(r.fullName || "-", 30),
      fmtNum(r.stars),
      fmtDelta(r.starsDelta24h),
      fmtDelta(r.starsDelta7d),
      fmtMomentum(r.momentumScore),
      r.movementStatus || "-",
    ];
    return showRank ? [String(i + 1), ...base] : base;
  });
  renderTable(headers, rows, aligns);
}

async function cmdTrending(args) {
  const windowArg = args.window || "7d";
  const period = WINDOW_TO_PERIOD[windowArg];
  if (!period) {
    fail(
      `invalid --window "${windowArg}" (valid: 24h, 7d, 30d)`,
    );
  }
  const limit = clampLimit(args.limit, 20);
  const data = await apiGet(
    `/api/repos?period=${period}&limit=${limit}`,
  );
  if (args.json) return printJson(data);
  const repos = data.repos || [];
  if (repos.length === 0) {
    process.stdout.write("No trending repos found.\n");
    return;
  }
  process.stdout.write(
    `Trending repos (window=${windowArg}, showing ${repos.length} of ${data.meta?.total ?? repos.length})\n\n`,
  );
  buildRepoTable(repos);
}

async function cmdBreakouts(args) {
  const limit = clampLimit(args.limit, 20);
  const data = await apiGet(
    `/api/repos?filter=breakouts&limit=${limit}`,
  );
  if (args.json) return printJson(data);
  const repos = data.repos || [];
  if (repos.length === 0) {
    process.stdout.write("No breakouts right now.\n");
    return;
  }
  process.stdout.write(`Breakouts (${repos.length})\n\n`);
  buildRepoTable(repos);
}

async function cmdNew(args) {
  const limit = clampLimit(args.limit, 20);
  // API filter preset is "new-under-30d".
  const data = await apiGet(
    `/api/repos?filter=new-under-30d&limit=${limit}`,
  );
  if (args.json) return printJson(data);
  const repos = data.repos || [];
  if (repos.length === 0) {
    process.stdout.write("No new repos (<30d) found.\n");
    return;
  }
  process.stdout.write(`New repos under 30 days old (${repos.length})\n\n`);
  buildRepoTable(repos);
}

async function cmdSearch(args) {
  const query = args._[0];
  if (!query) fail("search: missing query. usage: ss search <query>");
  const limit = clampLimit(args.limit, 10);
  const data = await apiGet(
    `/api/search?q=${encodeURIComponent(query)}&limit=${limit}`,
  );
  if (args.json) return printJson(data);
  const results = data.results || [];
  if (results.length === 0) {
    process.stdout.write(`No results for "${query}".\n`);
    return;
  }
  process.stdout.write(
    `Search results for "${query}" (${results.length} of ${data.meta?.total ?? results.length})\n\n`,
  );
  buildRepoTable(results);
}

async function cmdRepo(args) {
  const spec = args._[0];
  if (!spec) fail("repo: missing owner/name. usage: ss repo <owner/name>");
  const [owner, name] = spec.split("/");
  if (!owner || !name) fail(`repo: invalid spec "${spec}" — expected owner/name`);

  // Primary path: /api/repos/:owner/:name (returns full summary).
  const path = `/api/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;
  const data = await apiGet(path);
  if (args.json) return printJson(data);

  const r = data.repo;
  if (!r) fail("repo: API returned no repo object");

  const lines = [];
  lines.push(`${r.fullName}`);
  if (r.description) lines.push(`  ${r.description}`);
  lines.push("");
  lines.push(`  URL          ${r.url || "-"}`);
  lines.push(`  Language     ${r.language || "-"}`);
  lines.push(`  Category     ${r.categoryId || "-"}`);
  lines.push(`  Stars        ${fmtNum(r.stars)}`);
  lines.push(`  Forks        ${fmtNum(r.forks)}`);
  lines.push(`  Contributors ${fmtNum(r.contributors)}`);
  lines.push(`  Open issues  ${fmtNum(r.openIssues)}`);
  lines.push("");
  lines.push(`  Δ 24h        ${fmtDelta(r.starsDelta24h)}`);
  lines.push(`  Δ 7d         ${fmtDelta(r.starsDelta7d)}`);
  lines.push(`  Δ 30d        ${fmtDelta(r.starsDelta30d)}`);
  lines.push(`  Momentum     ${fmtMomentum(r.momentumScore)}  (${r.movementStatus || "-"})`);
  lines.push(`  Rank         #${r.rank ?? "-"}`);
  if (r.lastCommitAt) lines.push(`  Last commit  ${r.lastCommitAt}`);
  if (r.lastReleaseAt)
    lines.push(
      `  Last release ${r.lastReleaseAt}${r.lastReleaseTag ? ` (${r.lastReleaseTag})` : ""}`,
    );
  if (Array.isArray(r.topics) && r.topics.length > 0) {
    lines.push(`  Topics       ${r.topics.slice(0, 10).join(", ")}`);
  }
  if (data.reasons && data.reasons.summary) {
    lines.push("");
    lines.push(`  Why moving:  ${data.reasons.summary}`);
  }
  process.stdout.write(lines.join("\n") + "\n");
}

async function cmdCompare(args) {
  const specs = args._;
  if (specs.length < 2) {
    fail("compare: need at least 2 repos. usage: ss compare <owner/name> <owner/name> [...]");
  }
  // Fetch each repo via /api/repos/:owner/:name — the id-slug rules (dots →
  // hyphens) are nontrivial, so per-repo lookup is more reliable than
  // building `?ids=` manually.
  const repos = [];
  for (const spec of specs) {
    const [owner, name] = spec.split("/");
    if (!owner || !name) fail(`compare: invalid spec "${spec}" — expected owner/name`);
    const data = await apiGet(
      `/api/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`,
    );
    if (data.repo) repos.push(data.repo);
  }
  if (args.json) {
    return printJson({ repos });
  }
  if (repos.length === 0) {
    process.stdout.write("No repos matched.\n");
    return;
  }
  process.stdout.write(`Compare (${repos.length} repos)\n\n`);
  const headers = ["REPO", "STARS", "FORKS", "24H", "7D", "MOMENTUM", "STATUS"];
  const aligns = ["left", "right", "right", "right", "right", "right", "left"];
  const rows = repos.map((r) => [
    r.fullName || "-",
    fmtNum(r.stars),
    fmtNum(r.forks),
    fmtDelta(r.starsDelta24h),
    fmtDelta(r.starsDelta7d),
    fmtMomentum(r.momentumScore),
    r.movementStatus || "-",
  ]);
  renderTable(headers, rows, aligns);
}

async function cmdCategories(args) {
  const data = await apiGet("/api/categories");
  if (args.json) return printJson(data);
  const cats = data.categories || [];
  if (cats.length === 0) {
    process.stdout.write("No categories found.\n");
    return;
  }
  process.stdout.write(`Categories (${cats.length})\n\n`);
  const headers = ["CATEGORY", "REPOS", "AVG MOMENTUM", "TOP MOVER"];
  const aligns = ["left", "right", "right", "left"];
  const rows = cats.map((c) => [
    c.shortName || c.name || c.id,
    fmtNum(c.repoCount),
    fmtMomentum(c.avgMomentum),
    c.topMoverId || "-",
  ]);
  renderTable(headers, rows, aligns);
}

function cmdHelp() {
  const text = `
StarScreener CLI (ss) v${CLI_VERSION}
API: ${BASE_URL}    (override with STARSCREENER_API_URL)

USAGE
  ss <command> [options]

COMMANDS
  trending    [--window=24h|7d|30d] [--limit=20] [--json]
                Top movers for a time window. Default: 7d.

  breakouts   [--limit=20] [--json]
                Repos currently flagged as breakouts.

  new         [--limit=20] [--json]
                Repos created in the last 30 days.

  search      <query> [--limit=10] [--json]
                Full-text search over name, description, and topics.

  repo        <owner/name> [--json]
                Detailed view of one repo.

  compare     <owner/name> <owner/name> [...] [--json]
                Side-by-side comparison of stars / forks / deltas / momentum.

  categories  [--json]
                List of categories with repo counts and average momentum.

  stream      [--types=rank_changed,snapshot_captured,breakout_detected,alert_triggered]
                Tail the live SSE event stream. Ctrl+C to stop.

  help                    Show this help.
  --version, -v           Print CLI version.

EXAMPLES
  ss trending --window=24h --limit=10
  ss search "rust database" --limit=5
  ss repo vercel/next.js
  ss compare vercel/next.js ollama/ollama
  ss trending --json | jq '.repos[].fullName'
`;
  process.stdout.write(text);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clampLimit(raw, defaultVal) {
  if (raw === undefined) return defaultVal;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    fail(`invalid --limit "${raw}" — must be a positive integer`);
  }
  return Math.min(Math.max(Math.floor(n), 1), 100);
}

// ---------------------------------------------------------------------------
// Entry
// ---------------------------------------------------------------------------

// Exit cleanly on Ctrl+C so Node doesn't dump an unhandled-rejection trace.
process.on("SIGINT", () => {
  process.stderr.write("\naborted\n");
  process.exit(130);
});

const COMMANDS = {
  trending: cmdTrending,
  breakouts: cmdBreakouts,
  new: cmdNew,
  search: cmdSearch,
  repo: cmdRepo,
  compare: cmdCompare,
  categories: cmdCategories,
  stream: cmdStream,
  help: () => cmdHelp(),
};

// ---------------------------------------------------------------------------
// Stream command — tails /api/stream (Server-Sent Events) and prints one
// event per line. No deps: small incremental parser for the `event:`/`data:`
// frame format separated by blank lines.
// ---------------------------------------------------------------------------

async function cmdStream(args) {
  const types = typeof args.types === "string" ? args.types : "";
  const url = types
    ? `${BASE_URL}/api/stream?types=${encodeURIComponent(types)}`
    : `${BASE_URL}/api/stream`;

  process.stderr.write(`[ss] tailing ${url} (Ctrl+C to stop)\n`);

  const controller = new AbortController();
  process.on("SIGINT", () => {
    controller.abort();
    process.exit(130);
  });

  const res = await fetch(url, {
    headers: { Accept: "text/event-stream" },
    signal: controller.signal,
  });
  if (!res.ok || !res.body) {
    fail(`stream failed: HTTP ${res.status} ${res.statusText}`);
  }

  const decoder = new TextDecoder();
  let buffer = "";
  for await (const chunk of res.body) {
    buffer += decoder.decode(chunk, { stream: true });
    let idx;
    while ((idx = buffer.indexOf("\n\n")) !== -1) {
      const frame = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      if (frame.startsWith(":")) continue; // heartbeat comment
      const lines = frame.split("\n");
      let event = "message";
      let data = "";
      for (const line of lines) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) data += line.slice(5).trim();
      }
      if (args.json) {
        process.stdout.write(`${JSON.stringify({ event, data: safeParse(data) })}\n`);
      } else {
        const ts = new Date().toISOString().slice(11, 19);
        let summary = data;
        try {
          const p = JSON.parse(data);
          if (event === "snapshot_captured") {
            summary = `${p.fullName} stars=${p.stars} 24h=${p.starsDelta24h ?? "-"}`;
          } else if (event === "rank_changed") {
            summary = `${p.fullName} ${p.fromRank ?? "-"} → ${p.toRank}`;
          } else if (event === "breakout_detected") {
            summary = `${p.fullName} score=${p.score.toFixed(1)}`;
          } else if (event === "alert_triggered") {
            summary = `${p.fullName} rule=${p.ruleId} ${p.condition}`;
          } else if (event === "ready") {
            summary = `subscribed types=${(p.types || []).join(",")}`;
          }
        } catch {}
        process.stdout.write(`${ts}  ${event.padEnd(20)}  ${summary}\n`);
      }
    }
  }
}

function safeParse(s) {
  try { return JSON.parse(s); } catch { return s; }
}

async function main() {
  const rawArgs = process.argv.slice(2);

  // Top-level flags before command.
  if (rawArgs.length === 0) {
    cmdHelp();
    return;
  }
  if (rawArgs[0] === "--version" || rawArgs[0] === "-v") {
    process.stdout.write(`ss ${CLI_VERSION}\n`);
    return;
  }
  if (rawArgs[0] === "--help" || rawArgs[0] === "-h") {
    cmdHelp();
    return;
  }

  const cmd = rawArgs[0];
  const rest = rawArgs.slice(1);
  const handler = COMMANDS[cmd];
  if (!handler) {
    fail(`unknown command "${cmd}". run "ss help" for usage.`);
  }
  const args = parseArgs(rest);
  await handler(args);
}

main().catch((err) => {
  fail(err && err.message ? err.message : String(err));
});
