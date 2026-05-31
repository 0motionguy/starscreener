#!/usr/bin/env node
// collect-all — morning warm-up wrapper. Runs the source collectors in parallel
// with a bounded concurrency (default 3) and prints per-source live status.
//
// Usage:
//   node scripts/collect-all.mjs
//   node scripts/collect-all.mjs --only=reddit,twitter
//   node scripts/collect-all.mjs --no-twitter
//   node scripts/collect-all.mjs --push                  // git add+commit data files when done
//   node scripts/collect-all.mjs --concurrency=2
//   node scripts/collect-all.mjs --help

import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import { mkdirSync, createWriteStream, statSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const LOG_DIR = join(REPO_ROOT, ".data", "admin-scan-runs");

// Source registry — name → { script, countPaths[] }
// countPaths is the list of files to sum line counts from for the pre/post delta.
// Whichever exists at run time gets counted; missing files silently skipped.
const SOURCES = [
  {
    name: "reddit",
    script: "scrape:reddit",
    countPaths: ["data/reddit-mentions.json"],
  },
  {
    name: "hn",
    script: "scrape:hn",
    countPaths: ["data/hackernews-trending.json", "data/hackernews-repo-mentions.json"],
  },
  {
    name: "bsky",
    script: "scrape:bsky",
    countPaths: ["data/bluesky-trending.json", "data/bluesky-mentions.json"],
  },
  {
    name: "devto",
    script: "scrape:devto",
    countPaths: ["data/devto-trending.json", "data/devto-mentions.json"],
  },
  {
    name: "lobsters",
    script: "scrape:lobsters",
    countPaths: ["data/lobsters-trending.json", "data/lobsters-mentions.json"],
  },
  {
    name: "ph",
    script: "scrape:ph",
    countPaths: ["data/producthunt-launches.json"],
  },
  {
    name: "twitter",
    script: "collect:twitter",
    countPaths: [".data/twitter-repo-signals.jsonl", ".data/twitter-scans.jsonl"],
  },
];

const ANSI = {
  enabled: Boolean(process.stdout.isTTY) && process.env.NO_COLOR == null,
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
};

function color(name, text) {
  if (!ANSI.enabled) return text;
  return `${ANSI[name] ?? ""}${text}${ANSI.reset}`;
}

function parseArgs(argv) {
  const args = {
    only: null,
    skip: new Set(),
    push: false,
    concurrency: 3,
    help: false,
  };
  for (const raw of argv.slice(2)) {
    if (raw === "--help" || raw === "-h") {
      args.help = true;
    } else if (raw === "--push") {
      args.push = true;
    } else if (raw === "--no-twitter") {
      args.skip.add("twitter");
    } else if (raw.startsWith("--no-")) {
      args.skip.add(raw.slice("--no-".length));
    } else if (raw.startsWith("--only=")) {
      const value = raw.slice("--only=".length).trim();
      if (value) args.only = value.split(",").map((s) => s.trim()).filter(Boolean);
    } else if (raw.startsWith("--concurrency=")) {
      const n = Number.parseInt(raw.slice("--concurrency=".length), 10);
      if (!Number.isFinite(n) || n < 1) {
        throw new Error(`invalid --concurrency value: ${raw}`);
      }
      args.concurrency = n;
    } else {
      throw new Error(`unknown flag: ${raw}`);
    }
  }
  return args;
}

function printHelp() {
  const help = `collect-all — morning warm-up wrapper for trend-source collectors

Usage:
  node scripts/collect-all.mjs [flags]

Flags:
  --only=a,b,c       Run only these sources (names: ${SOURCES.map((s) => s.name).join(", ")})
  --no-<name>        Skip a single source (e.g. --no-twitter)
  --push             git add+commit data/*, .data/* if all non-twitter sources succeed
  --concurrency=N    Max parallel collectors (default 3)
  --help             Show this message

Sources run (priority order):
${SOURCES.map((s) => `  ${s.name.padEnd(10)} → npm run ${s.script}`).join("\n")}

Per-source logs:  .data/admin-scan-runs/collect-all-<source>-<timestamp>.log
Exit codes:        0 = all ok · 1 = one or more failed · 2 = config error
`;
  process.stdout.write(help);
}

function lineCountSync(path) {
  try {
    const stat = statSync(path);
    if (!stat.isFile()) return null;
    const buf = readFileSync(path);
    if (buf.length === 0) return 0;
    let n = 0;
    for (let i = 0; i < buf.length; i++) {
      if (buf[i] === 10) n++;
    }
    // Files without trailing newline: account for the final partial line.
    if (buf[buf.length - 1] !== 10) n++;
    return n;
  } catch {
    return null;
  }
}

function sumCounts(paths) {
  let total = 0;
  let any = false;
  for (const rel of paths) {
    const n = lineCountSync(join(REPO_ROOT, rel));
    if (n != null) {
      total += n;
      any = true;
    }
  }
  return any ? total : null;
}

function fmtCount(n) {
  return n == null ? color("gray", "—") : String(n);
}

function fmtDelta(pre, post) {
  if (pre == null || post == null) return color("gray", "—");
  const d = post - pre;
  if (d === 0) return color("gray", "+0");
  const text = `${d > 0 ? "+" : ""}${d}`;
  return color(d > 0 ? "green" : "yellow", text);
}

function fmtDuration(ms) {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}m${r.toString().padStart(2, "0")}s`;
}

const SPINNER_FRAMES = ANSI.enabled ? ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] : ["|", "/", "-", "\\"];

class StatusBoard {
  constructor(sources) {
    this.entries = new Map();
    for (const src of sources) {
      this.entries.set(src.name, { state: "queued", frame: 0, message: "" });
    }
    this.timer = null;
    this.dirty = false;
    this.tickCount = 0;
    this.canRedraw = ANSI.enabled;
  }

  setState(name, state, message = "") {
    const entry = this.entries.get(name);
    if (!entry) return;
    entry.state = state;
    entry.message = message;
    this.dirty = true;
    if (!this.canRedraw) {
      // Plain mode: print one line per state transition so non-TTY logs stay readable.
      const stateLabel = state.toUpperCase().padEnd(8);
      process.stdout.write(`[${name.padEnd(10)}] ${stateLabel} ${message}\n`);
    }
  }

  start() {
    if (!this.canRedraw) {
      process.stdout.write("collect-all: starting (non-TTY mode, no spinner)\n");
      return;
    }
    this._draw();
    this.timer = setInterval(() => this._tick(), 100);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.canRedraw) {
      this._draw();
      process.stdout.write("\n");
    }
  }

  _tick() {
    this.tickCount++;
    let active = false;
    for (const entry of this.entries.values()) {
      if (entry.state === "running") {
        entry.frame = (entry.frame + 1) % SPINNER_FRAMES.length;
        active = true;
      }
    }
    if (active || this.dirty) this._draw();
  }

  _draw() {
    if (!this.canRedraw) return;
    const lines = [];
    for (const [name, entry] of this.entries) {
      const icon = this._icon(entry);
      const line = `  ${icon}  ${name.padEnd(10)} ${color("dim", entry.message || "")}`;
      lines.push(line);
    }
    const out = lines.join("\n");
    if (this._lastDrawnLines) {
      process.stdout.write(`\x1b[${this._lastDrawnLines}A`);
    }
    process.stdout.write(`\x1b[0J`);
    process.stdout.write(out + "\n");
    this._lastDrawnLines = lines.length;
    this.dirty = false;
  }

  _icon(entry) {
    switch (entry.state) {
      case "queued":
        return color("gray", "·");
      case "running":
        return color("cyan", SPINNER_FRAMES[entry.frame]);
      case "ok":
        return color("green", "✓");
      case "fail":
        return color("red", "✗");
      case "skip":
        return color("gray", "○");
      default:
        return "?";
    }
  }
}

function npmCommand() {
  // Windows uses npm.cmd; everywhere else it's npm. spawn() needs the right binary
  // on Windows because npm is a .cmd shim, not an executable.
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

async function ensureLogDir() {
  await fs.mkdir(LOG_DIR, { recursive: true });
}

function timestampSlug() {
  const d = new Date();
  const pad = (n) => n.toString().padStart(2, "0");
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

async function runSource(source, board, runStamp) {
  const startedAt = Date.now();
  const preCount = sumCounts(source.countPaths);
  board.setState(source.name, "running", `npm run ${source.script}`);

  const logPath = join(LOG_DIR, `collect-all-${source.name}-${runStamp}.log`);
  mkdirSync(dirname(logPath), { recursive: true });
  const logStream = createWriteStream(logPath, { flags: "a" });
  logStream.write(`# collect-all ${source.name} npm run ${source.script}\n`);
  logStream.write(`# started_at=${new Date(startedAt).toISOString()}\n`);

  return new Promise((resolvePromise) => {
    const child = spawn(npmCommand(), ["run", "--silent", source.script], {
      cwd: REPO_ROOT,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
      // Inherit shell behaviour on Windows so .cmd shims resolve cleanly.
      shell: process.platform === "win32",
    });

    let lastStderrLine = "";
    let stderrBuf = "";
    child.stdout.on("data", (chunk) => {
      logStream.write(chunk);
    });
    child.stderr.on("data", (chunk) => {
      logStream.write(chunk);
      stderrBuf += chunk.toString("utf8");
      const lines = stderrBuf.split(/\r?\n/);
      stderrBuf = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed) lastStderrLine = trimmed;
      }
    });

    child.on("error", (err) => {
      logStream.end(`\n# spawn_error=${err.message}\n`);
      const duration = Date.now() - startedAt;
      board.setState(source.name, "fail", `spawn error: ${err.message}`);
      resolvePromise({
        name: source.name,
        ok: false,
        duration,
        preCount,
        postCount: sumCounts(source.countPaths),
        error: err.message,
        logPath,
      });
    });

    child.on("close", (code) => {
      logStream.end(`\n# exit_code=${code}\n`);
      const duration = Date.now() - startedAt;
      const postCount = sumCounts(source.countPaths);
      const ok = code === 0;
      const errSnippet = lastStderrLine.slice(0, 80);
      const summary = ok
        ? `${fmtDuration(duration)} ${fmtDelta(preCount, postCount)} posts`
        : `${fmtDuration(duration)} exit=${code}${errSnippet ? ` :: ${errSnippet}` : ""}`;
      board.setState(source.name, ok ? "ok" : "fail", summary);
      resolvePromise({
        name: source.name,
        ok,
        duration,
        preCount,
        postCount,
        error: ok ? null : errSnippet || `exit ${code}`,
        exitCode: code,
        logPath,
      });
    });
  });
}

async function runWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const launchers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await worker(items[i], i);
    }
  });
  await Promise.all(launchers);
  return results;
}

function selectSources(args) {
  let selected = SOURCES.slice();
  if (args.only) {
    const known = new Set(SOURCES.map((s) => s.name));
    const unknown = args.only.filter((n) => !known.has(n));
    if (unknown.length) {
      throw new Error(`unknown source(s) in --only: ${unknown.join(", ")}`);
    }
    selected = selected.filter((s) => args.only.includes(s.name));
  }
  if (args.skip.size) {
    selected = selected.filter((s) => !args.skip.has(s.name));
  }
  return selected;
}

function printSummary(results) {
  const headers = ["Source", "Status", "Duration", "Pre", "Post", "Delta"];
  const rows = results.map((r) => [
    r.name,
    r.ok ? color("green", "ok") : color("red", "fail"),
    fmtDuration(r.duration),
    fmtCount(r.preCount),
    fmtCount(r.postCount),
    fmtDelta(r.preCount, r.postCount),
  ]);
  // Strip ANSI for width calculation (otherwise control bytes throw off padding).
  const stripAnsi = (s) => s.replace(/\x1b\[[0-9;]*m/g, "");
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((row) => stripAnsi(row[i]).length))
  );
  const pad = (text, w) => {
    const visible = stripAnsi(text).length;
    return text + " ".repeat(Math.max(0, w - visible));
  };
  process.stdout.write("\n" + color("bold", headers.map((h, i) => pad(h, widths[i])).join("  ")) + "\n");
  for (const row of rows) {
    process.stdout.write(row.map((cell, i) => pad(cell, widths[i])).join("  ") + "\n");
  }
  for (const r of results) {
    if (!r.ok) {
      process.stdout.write(color("dim", `  log: ${r.logPath}\n`));
    }
  }
}

function gitCommit(commitTimestamp) {
  return new Promise((resolvePromise) => {
    // Stage only the data directories — never `git add .` (CLAUDE.md anti-pattern).
    const adds = ["data/.", ".data/."];
    const child = spawn("git", ["add", ...adds], {
      cwd: REPO_ROOT,
      stdio: "inherit",
    });
    child.on("close", (addCode) => {
      if (addCode !== 0) {
        resolvePromise({ ok: false, step: "git add", code: addCode });
        return;
      }
      const message = `data: collect-all ${commitTimestamp}`;
      const commitChild = spawn("git", ["commit", "-m", message], {
        cwd: REPO_ROOT,
        stdio: "inherit",
      });
      commitChild.on("close", (commitCode) => {
        // Exit 1 from git commit usually means "nothing to commit" — treat as success.
        const ok = commitCode === 0 || commitCode === 1;
        resolvePromise({ ok, step: "git commit", code: commitCode });
      });
    });
  });
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv);
  } catch (err) {
    process.stderr.write(color("red", `error: ${err.message}\n`));
    printHelp();
    process.exit(2);
  }
  if (args.help) {
    printHelp();
    return;
  }

  let sources;
  try {
    sources = selectSources(args);
  } catch (err) {
    process.stderr.write(color("red", `error: ${err.message}\n`));
    process.exit(2);
  }
  if (sources.length === 0) {
    process.stderr.write(color("red", "error: no sources matched filter\n"));
    process.exit(2);
  }

  await ensureLogDir();
  const runStamp = timestampSlug();

  process.stdout.write(
    color("bold", "collect-all") +
      color("dim", ` · ${sources.length} source${sources.length === 1 ? "" : "s"}`) +
      color("dim", ` · concurrency=${args.concurrency}`) +
      color("dim", ` · run=${runStamp}`) +
      "\n",
  );

  const board = new StatusBoard(sources);
  board.start();

  let results;
  try {
    results = await runWithConcurrency(sources, args.concurrency, (source) =>
      runSource(source, board, runStamp),
    );
  } finally {
    board.stop();
  }

  printSummary(results);

  const failed = results.filter((r) => !r.ok);
  const nonTwitterFailed = failed.filter((r) => r.name !== "twitter");

  if (args.push) {
    if (nonTwitterFailed.length) {
      process.stdout.write(
        color("yellow", `\n--push skipped: ${nonTwitterFailed.length} non-twitter source(s) failed\n`),
      );
    } else {
      process.stdout.write(color("dim", "\nstaging data/ + .data/ ...\n"));
      const commitTimestamp = new Date().toISOString();
      const commitResult = await gitCommit(commitTimestamp);
      if (!commitResult.ok) {
        process.stdout.write(
          color("red", `${commitResult.step} failed (exit ${commitResult.code}); not pushing\n`),
        );
      } else {
        process.stdout.write(color("green", "commit ok (push manually)\n"));
      }
    }
  }

  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
  process.stderr.write(color("red", `fatal: ${err && err.stack ? err.stack : err}\n`));
  process.exit(2);
});
