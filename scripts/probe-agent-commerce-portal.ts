// Portal manifest probe — Agent Commerce.
//
// For each entry in the seed, attempt to fetch a Portal v0.1 manifest
// from the entity's website. Validate via the canonical Portal validator.
// On success, mutates seed-data.json: sets badges.portalReady = true,
// records the manifest URL, and sets badges.x402Enabled = true if the
// manifest's pricing model is x402 (independent corroboration).
//
// Usage: npm run probe:agent-commerce-portal
//   --concurrency N    (default 8)
//   --timeout-ms N     (default 4000)
//   --dry-run          (don't write back)
//
// After probing, run `npm run build:agent-commerce` to regenerate
// data/agent-commerce.json with the updated badges.

import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

import { validateManifest } from "../src/portal/validate";

interface SeedEntry {
  name: string;
  links?: { website?: string };
  badges?: {
    portalReady?: boolean;
    x402Enabled?: boolean;
    [k: string]: unknown;
  };
  // catch-all so we don't lose other fields when we mutate
  [k: string]: unknown;
}

interface SeedFile {
  version: number;
  description?: string;
  entries: SeedEntry[];
}

interface ProbeOutcome {
  name: string;
  status: "ok" | "miss" | "invalid" | "error" | "skip";
  manifestUrl?: string;
  x402?: boolean;
  reason?: string;
}

const SEED_PATH = resolve(
  process.cwd(),
  "apps/trendingrepo-worker/src/fetchers/agent-commerce/seed-data.json",
);

function parseFlag(name: string): boolean {
  return process.argv.includes(name);
}

function parseNumber(name: string, fallback: number): number {
  const idx = process.argv.indexOf(name);
  if (idx === -1 || idx === process.argv.length - 1) return fallback;
  const n = Number.parseInt(process.argv[idx + 1] ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const DRY_RUN = parseFlag("--dry-run");
const CONCURRENCY = parseNumber("--concurrency", 8);
const TIMEOUT_MS = parseNumber("--timeout-ms", 4000);

function manifestCandidates(website: string): string[] {
  const base = website.replace(/\/$/, "");
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
        "User-Agent": "TrendingRepo-Portal-Probe/0.1 (+https://trendingrepo.com)",
      },
      redirect: "follow",
    });
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

async function probeEntry(entry: SeedEntry): Promise<ProbeOutcome> {
  const website = entry.links?.website;
  if (!website) {
    return { name: entry.name, status: "skip", reason: "no website" };
  }

  for (const url of manifestCandidates(website)) {
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
        name: entry.name,
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

    return { name: entry.name, status: "ok", manifestUrl: url, x402 };
  }

  return { name: entry.name, status: "miss" };
}

async function probeAll(entries: SeedEntry[]): Promise<ProbeOutcome[]> {
  const outcomes: ProbeOutcome[] = [];
  let cursor = 0;
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (cursor < entries.length) {
      const idx = cursor++;
      const entry = entries[idx];
      const outcome = await probeEntry(entry);
      outcomes[idx] = outcome;
      const tag = outcome.status === "ok" ? "✓" : outcome.status === "miss" ? "·" : outcome.status === "skip" ? " " : "!";
      const extra =
        outcome.status === "ok"
          ? ` ${outcome.x402 ? "[x402]" : ""} ${outcome.manifestUrl ?? ""}`
          : outcome.reason
            ? ` (${outcome.reason})`
            : "";
      console.log(`  ${tag} ${entry.name}${extra}`);
    }
  });
  await Promise.all(workers);
  return outcomes;
}

function applyOutcomes(
  seed: SeedFile,
  outcomes: ProbeOutcome[],
): { changed: number; portalReady: number; x402: number } {
  let changed = 0;
  let portalReady = 0;
  let x402 = 0;
  outcomes.forEach((outcome, idx) => {
    if (outcome.status !== "ok") return;
    const entry = seed.entries[idx];
    const badges = (entry.badges as Record<string, unknown>) ?? {};
    let didChange = false;
    if (badges.portalReady !== true) {
      badges.portalReady = true;
      didChange = true;
    }
    if (outcome.x402 && badges.x402Enabled !== true) {
      badges.x402Enabled = true;
      x402 += 1;
      didChange = true;
    }
    const links = (entry.links as Record<string, unknown>) ?? {};
    if (outcome.manifestUrl && links.portalManifest !== outcome.manifestUrl) {
      links.portalManifest = outcome.manifestUrl;
      didChange = true;
    }
    entry.badges = badges as SeedEntry["badges"];
    entry.links = links as SeedEntry["links"];
    if (didChange) changed += 1;
    portalReady += 1;
  });
  return { changed, portalReady, x402 };
}

async function main() {
  const raw = readFileSync(SEED_PATH, "utf8");
  const seed = JSON.parse(raw) as SeedFile;
  console.log(`[portal-probe] probing ${seed.entries.length} entities (concurrency=${CONCURRENCY}, timeout=${TIMEOUT_MS}ms)`);
  console.log("");

  const outcomes = await probeAll(seed.entries);

  console.log("");
  const summary = {
    ok: outcomes.filter((o) => o.status === "ok").length,
    miss: outcomes.filter((o) => o.status === "miss").length,
    invalid: outcomes.filter((o) => o.status === "invalid").length,
    skip: outcomes.filter((o) => o.status === "skip").length,
    error: outcomes.filter((o) => o.status === "error").length,
  };
  console.log(
    `[portal-probe] ok=${summary.ok}  miss=${summary.miss}  invalid=${summary.invalid}  skip=${summary.skip}  error=${summary.error}`,
  );

  if (summary.ok === 0) {
    console.log(`[portal-probe] no Portal manifests found. Seed unchanged.`);
    return;
  }

  const result = applyOutcomes(seed, outcomes);
  console.log(
    `[portal-probe] would update ${result.changed} entries (portalReady=${result.portalReady}, x402=${result.x402})`,
  );

  if (DRY_RUN) {
    console.log(`[portal-probe] --dry-run: not writing back to seed.`);
    return;
  }

  writeFileSync(SEED_PATH, JSON.stringify(seed, null, 2) + "\n", "utf8");
  console.log(`[portal-probe] wrote ${SEED_PATH}`);
  console.log(`[portal-probe] next: run \`npm run build:agent-commerce\` to regenerate the snapshot.`);
}

main().catch((err) => {
  console.error("[portal-probe] fatal:", err);
  process.exit(1);
});
