// Portal manifest probe — full snapshot.
//
// Probes the FULL agent-commerce snapshot (7K+ entities) for Portal v0.1
// manifests, deduped by host so each domain is hit at most once. Output
// goes to .data/portal-probe-snapshot.json which the build step merges
// to set badges.portalReady on every matching entity.
//
// Distinct from scripts/probe-agent-commerce-portal.ts (which mutates
// seed-data.json directly for the 89 hand-curated entries).
//
// Usage:
//   npm run probe:portal-snapshot -- [--concurrency N] [--timeout-ms N] [--limit N]

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";

import { validateManifest } from "../src/portal/validate";

interface SnapshotItem {
  slug: string;
  name: string;
  links?: { website?: string };
}

interface SnapshotFile {
  fetchedAt?: string;
  items: SnapshotItem[];
}

interface HostOutcome {
  host: string;
  status: "ok" | "miss" | "invalid" | "error";
  manifestUrl?: string;
  x402?: boolean;
  reason?: string;
}

const SNAPSHOT_PATH = resolve(
  process.cwd(),
  "data/agent-commerce.json",
);
const OUT_PATH = resolve(
  process.cwd(),
  ".data/portal-probe-snapshot.json",
);

function flag(name: string): boolean {
  return process.argv.includes(name);
}

function num(name: string, fallback: number): number {
  const idx = process.argv.indexOf(name);
  if (idx === -1 || idx === process.argv.length - 1) return fallback;
  const n = Number.parseInt(process.argv[idx + 1] ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const DRY_RUN = flag("--dry-run");
const CONCURRENCY = num("--concurrency", 8);
const TIMEOUT_MS = num("--timeout-ms", 4000);
const LIMIT = num("--limit", 0); // 0 = no cap

function safeHost(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

function manifestCandidates(host: string): string[] {
  const base = `https://${host}`;
  return [
    `${base}/.well-known/portal.json`,
    `${base}/portal.json`,
    `${base}/portal`,
  ];
}

async function fetchWithTimeout(url: string): Promise<Response | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, {
      signal: ctrl.signal,
      headers: {
        Accept: "application/json",
        "User-Agent":
          "TrendingRepo-Portal-Probe/0.1 (+https://trendingrepo.com)",
      },
      redirect: "follow",
    });
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

async function probeHost(host: string): Promise<HostOutcome> {
  for (const url of manifestCandidates(host)) {
    const res = await fetchWithTimeout(url);
    if (!res || !res.ok) continue;
    const ctype = res.headers.get("content-type") ?? "";
    if (!ctype.includes("json")) continue;
    let payload: unknown;
    try {
      payload = await res.json();
    } catch {
      continue;
    }
    const result = validateManifest(payload);
    if (!result.ok) {
      return {
        host,
        status: "invalid",
        manifestUrl: url,
        reason: result.errors[0],
      };
    }
    let x402 = false;
    if (
      payload &&
      typeof payload === "object" &&
      "pricing" in payload &&
      payload.pricing &&
      typeof payload.pricing === "object" &&
      "model" in payload.pricing &&
      payload.pricing.model === "x402"
    ) {
      x402 = true;
    }
    return { host, status: "ok", manifestUrl: url, x402 };
  }
  return { host, status: "miss" };
}

async function main(): Promise<void> {
  const snap = JSON.parse(readFileSync(SNAPSHOT_PATH, "utf8")) as SnapshotFile;
  const hosts = new Set<string>();
  for (const item of snap.items ?? []) {
    const h = safeHost(item.links?.website ?? "");
    if (h) hosts.add(h);
  }
  let queue = Array.from(hosts);
  if (LIMIT > 0 && queue.length > LIMIT) {
    queue = queue.slice(0, LIMIT);
    console.log(`[portal-snap] capped at --limit ${LIMIT}`);
  }
  console.log(
    `[portal-snap] probing ${queue.length} distinct hosts (concurrency=${CONCURRENCY}, timeout=${TIMEOUT_MS}ms)`,
  );
  console.log("");

  const outcomes: HostOutcome[] = [];
  let cursor = 0;
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (cursor < queue.length) {
      const idx = cursor++;
      const host = queue[idx];
      const outcome = await probeHost(host);
      outcomes[idx] = outcome;
      const tag =
        outcome.status === "ok" ? "✓" : outcome.status === "invalid" ? "!" : ".";
      const extra =
        outcome.status === "ok"
          ? ` [${outcome.x402 ? "x402" : "free"}] ${outcome.manifestUrl ?? ""}`
          : outcome.reason
            ? ` (${outcome.reason})`
            : "";
      if (outcome.status !== "miss") {
        console.log(`  ${tag} ${host}${extra}`);
      }
    }
  });
  await Promise.all(workers);

  const summary = {
    ok: outcomes.filter((o) => o.status === "ok").length,
    invalid: outcomes.filter((o) => o.status === "invalid").length,
    miss: outcomes.filter((o) => o.status === "miss").length,
    total: outcomes.length,
  };
  console.log("");
  console.log(
    `[portal-snap] ok=${summary.ok}  invalid=${summary.invalid}  miss=${summary.miss}  total=${summary.total}`,
  );

  if (DRY_RUN) {
    console.log("[portal-snap] --dry-run — nothing written.");
    return;
  }

  const okOutcomes = outcomes.filter((o) => o?.status === "ok");
  const byHost: Record<
    string,
    { manifestUrl: string; x402: boolean }
  > = {};
  for (const o of okOutcomes) {
    if (o.manifestUrl) {
      byHost[o.host] = { manifestUrl: o.manifestUrl, x402: !!o.x402 };
    }
  }

  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(
    OUT_PATH,
    JSON.stringify(
      {
        fetchedAt: new Date().toISOString(),
        summary,
        byHost,
      },
      null,
      2,
    ),
    "utf8",
  );
  console.log(`[portal-snap] wrote ${OUT_PATH}`);
  console.log(
    "[portal-snap] next: run `npm run build:agent-commerce` to merge.",
  );
}

main().catch((err) => {
  console.error("[portal-snap] fatal:", err);
  process.exit(1);
});
