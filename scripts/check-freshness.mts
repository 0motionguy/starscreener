#!/usr/bin/env tsx

import "./_load-env.mjs";

type Status = "GREEN" | "YELLOW" | "RED" | "DEAD";

interface FreshnessSource {
  name: string;
  lastUpdate: string | null;
  freshnessBudget: string;
  ageMs: number | null;
  status: Status;
}

interface FreshnessState {
  checkedAt: string;
  sources: FreshnessSource[];
  summary: {
    green: number;
    yellow: number;
    red: number;
    dead: number;
  };
}

interface HealthState {
  status?: string;
  sourceStatus?: string;
  lastFetchedAt?: string | null;
  computedAt?: string | null;
}

interface Options {
  baseUrl: string;
  json: boolean;
  timeoutMs: number;
}

const DEFAULT_BASE_URL = "http://localhost:3023";
const PROD_BASE_URL = "https://trendingrepo.com";
const DEFAULT_TIMEOUT_MS = 15_000;
const DAY_MS = 24 * 60 * 60 * 1000;

function usage(): string {
  return [
    "usage: npm run freshness:check -- [--prod] [--base-url <url>] [--json]",
    "",
    "Checks /api/health and /api/cron/freshness/state.",
    "Default target is http://localhost:3023. --prod targets https://trendingrepo.com.",
  ].join("\n");
}

function parseArgs(argv: string[]): Options {
  let prod = false;
  let baseUrl: string | null = null;
  let json = false;
  let timeoutMs = DEFAULT_TIMEOUT_MS;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--prod") {
      prod = true;
    } else if (arg === "--json") {
      json = true;
    } else if (arg === "--help" || arg === "-h") {
      console.log(usage());
      process.exit(0);
    } else if (arg === "--base-url") {
      const next = argv[i + 1];
      if (!next) failUsage("--base-url requires a value");
      baseUrl = next;
      i += 1;
    } else if (arg.startsWith("--base-url=")) {
      baseUrl = arg.slice("--base-url=".length);
    } else if (arg === "--timeout-ms") {
      const next = argv[i + 1];
      if (!next) failUsage("--timeout-ms requires a value");
      timeoutMs = parseTimeout(next);
      i += 1;
    } else if (arg.startsWith("--timeout-ms=")) {
      timeoutMs = parseTimeout(arg.slice("--timeout-ms=".length));
    } else {
      failUsage(`unknown argument: ${arg}`);
    }
  }

  if (prod && baseUrl) failUsage("use either --prod or --base-url, not both");
  return {
    baseUrl: normalizeBaseUrl(baseUrl ?? (prod ? PROD_BASE_URL : DEFAULT_BASE_URL)),
    json,
    timeoutMs,
  };
}

function parseTimeout(raw: string): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1000) failUsage("--timeout-ms must be a number >= 1000");
  return Math.floor(n);
}

function failUsage(message: string): never {
  console.error(`freshness-check: ${message}`);
  console.error(usage());
  process.exit(64);
}

function normalizeBaseUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    failUsage(`invalid base URL: ${raw}`);
  }
  if (url.username || url.password) {
    failUsage("base URL must not include credentials");
  }
  url.pathname = url.pathname.replace(/\/+$/, "");
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/+$/, "");
}

function redactSecret(value: string): string {
  const secret = process.env.CRON_SECRET;
  if (!secret) return value;
  return value.split(secret).join("[REDACTED]");
}

function endpoint(baseUrl: string, path: string): string {
  return `${baseUrl}${path}`;
}

async function fetchJson<T>(url: string, timeoutMs: number, auth: boolean): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (auth && process.env.CRON_SECRET) {
    headers.Authorization = `Bearer ${process.env.CRON_SECRET}`;
  }

  try {
    const response = await fetch(url, { headers, signal: controller.signal });
    const text = await response.text();
    if (!response.ok) {
      const snippet = redactSecret(text).slice(0, 300).replace(/\s+/g, " ");
      throw new Error(`GET ${sanitizeUrl(url)} failed: HTTP ${response.status}${snippet ? ` ${snippet}` : ""}`);
    }
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new Error(`GET ${sanitizeUrl(url)} returned invalid JSON`);
    }
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`GET ${sanitizeUrl(url)} timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function sanitizeUrl(raw: string): string {
  const url = new URL(raw);
  url.username = "";
  url.password = "";
  return url.toString();
}

function validateFreshnessState(value: FreshnessState): void {
  if (!value || typeof value !== "object") throw new Error("freshness state is not an object");
  if (typeof value.checkedAt !== "string") throw new Error("freshness state missing checkedAt");
  if (!Array.isArray(value.sources)) throw new Error("freshness state missing sources[]");
  if (!value.summary || typeof value.summary !== "object") {
    throw new Error("freshness state missing summary");
  }
  for (const source of value.sources) {
    if (typeof source.name !== "string") throw new Error("source missing name");
    if (source.lastUpdate !== null && typeof source.lastUpdate !== "string") {
      throw new Error(`${source.name} has invalid lastUpdate`);
    }
    if (typeof source.freshnessBudget !== "string") {
      throw new Error(`${source.name} missing freshnessBudget`);
    }
    if (source.ageMs !== null && typeof source.ageMs !== "number") {
      throw new Error(`${source.name} has invalid ageMs`);
    }
    if (!["GREEN", "YELLOW", "RED", "DEAD"].includes(source.status)) {
      throw new Error(`${source.name} has invalid status`);
    }
  }
}

function formatDuration(ms: number | null): string {
  if (ms === null) return "-";
  if (ms < 0) return "future";
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
  if (ms < DAY_MS) return `${(ms / 3_600_000).toFixed(1)}h`;
  return `${(ms / DAY_MS).toFixed(1)}d`;
}

function parseBudgetMs(label: string): number | null {
  const match = label.trim().match(/^(\d+(?:\.\d+)?)(ms|s|m|h|d)$/i);
  if (!match) return null;
  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  if (!Number.isFinite(amount)) return null;
  if (unit === "ms") return amount;
  if (unit === "s") return amount * 1000;
  if (unit === "m") return amount * 60_000;
  if (unit === "h") return amount * 3_600_000;
  if (unit === "d") return amount * DAY_MS;
  return null;
}

function exitCodeFor(state: FreshnessState): number {
  let anyNonGreen = false;
  let anyPastHardLimit = false;
  for (const source of state.sources) {
    if (source.status !== "GREEN") anyNonGreen = true;
    if (source.status === "DEAD") anyPastHardLimit = true;
    const budgetMs = parseBudgetMs(source.freshnessBudget);
    if (
      source.ageMs !== null &&
      budgetMs !== null &&
      source.ageMs > budgetMs + DAY_MS
    ) {
      anyPastHardLimit = true;
    }
  }
  if (anyPastHardLimit) return 2;
  if (anyNonGreen) return 1;
  return 0;
}

function printReport(opts: Options, health: HealthState, state: FreshnessState): void {
  console.log(
    `freshness-check target=${opts.baseUrl} health=${health.status ?? "unknown"} sourceStatus=${health.sourceStatus ?? "unknown"} checkedAt=${state.checkedAt}`,
  );
  console.log("");
  console.log("| source | status | last_update | age | budget |");
  console.log("|---|---:|---|---:|---:|");
  for (const source of state.sources) {
    console.log(
      `| ${source.name} | ${source.status} | ${source.lastUpdate ?? "-"} | ${formatDuration(source.ageMs)} | ${source.freshnessBudget} |`,
    );
  }
  console.log("");
  console.log(
    `summary: green=${state.summary.green} yellow=${state.summary.yellow} red=${state.summary.red} dead=${state.summary.dead}`,
  );
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  const healthUrl = endpoint(opts.baseUrl, "/api/health?soft=1");
  const stateUrl = endpoint(opts.baseUrl, "/api/cron/freshness/state");

  const [health, state] = await Promise.all([
    fetchJson<HealthState>(healthUrl, opts.timeoutMs, false),
    fetchJson<FreshnessState>(stateUrl, opts.timeoutMs, true),
  ]);

  validateFreshnessState(state);
  const code = exitCodeFor(state);

  if (opts.json) {
    console.log(JSON.stringify({ target: opts.baseUrl, health, freshness: state, exitCode: code }, null, 2));
  } else {
    printReport(opts, health, state);
    if (code === 0) {
      console.log("PASS freshness all green");
    } else if (code === 2) {
      console.log("FAIL freshness source past budget by more than 24h");
    } else {
      console.log("FAIL freshness non-green source detected");
    }
  }
  process.exitCode = code;
}

process.on("SIGINT", () => {
  process.exit(130);
});

main().catch((error) => {
  console.error(`freshness-check: ${redactSecret(error instanceof Error ? error.message : String(error))}`);
  process.exitCode = 2;
});
