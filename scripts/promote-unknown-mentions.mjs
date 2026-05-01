// Promote unknown-mention candidates from data/unknown-mentions.jsonl into a
// ranked top-N JSON for the admin UI. Closes the discovery loop: the lake is
// append-only and write-only without this; here we compact it once a day.
//
// Reads:  data/unknown-mentions.jsonl     ({source, fullName, observedAt} per line)
// Writes: data/unknown-mentions-promoted.json
//   {
//     generatedAt, totalUnknownMentions, distinctRepos, minSources, topN,
//     rows: [{ fullName, totalCount, sourceCount, sources, firstSeenAt, lastSeenAt }]
//   }
//
// Knobs (env): PROMOTE_TOP_N (default 200), PROMOTE_MIN_SOURCES (default 1).
// Sort: sourceCount desc, totalCount desc, lastSeenAt desc — cross-source
// signal beats single-source spam.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const LAKE_PATH = resolve(__dirname, "..", "data", "unknown-mentions.jsonl");
const OUT_PATH = resolve(__dirname, "..", "data", "unknown-mentions-promoted.json");

const DEFAULT_TOP_N = 200;
const DEFAULT_MIN_SOURCES = 1;

/**
 * Pure aggregation — exposed for tests. Does no I/O.
 *
 * @param {Iterable<{source: string, fullName: string, observedAt?: string}>} rows
 * @param {{ topN?: number, minSources?: number }} [opts]
 */
export function aggregateUnknownMentions(rows, opts = {}) {
  const topN = Number.isFinite(opts.topN) ? opts.topN : DEFAULT_TOP_N;
  const minSources = Number.isFinite(opts.minSources)
    ? opts.minSources
    : DEFAULT_MIN_SOURCES;

  /** @type {Map<string, {fullName: string, totalCount: number, sources: Map<string, number>, firstSeenAt: string, lastSeenAt: string}>} */
  const groups = new Map();
  let totalUnknownMentions = 0;

  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const fullName = String(row.fullName ?? "").trim();
    if (!fullName) continue;
    const source = String(row.source ?? "unknown");
    const observedAt = String(row.observedAt ?? "");
    totalUnknownMentions++;

    let g = groups.get(fullName);
    if (!g) {
      g = {
        fullName,
        totalCount: 0,
        sources: new Map(),
        firstSeenAt: observedAt,
        lastSeenAt: observedAt,
      };
      groups.set(fullName, g);
    }
    g.totalCount++;
    g.sources.set(source, (g.sources.get(source) ?? 0) + 1);
    if (observedAt) {
      if (!g.firstSeenAt || observedAt < g.firstSeenAt) g.firstSeenAt = observedAt;
      if (!g.lastSeenAt || observedAt > g.lastSeenAt) g.lastSeenAt = observedAt;
    }
  }

  const distinctRepos = groups.size;
  const ranked = [];
  for (const g of groups.values()) {
    const sources = [...g.sources.keys()].sort();
    if (sources.length < minSources) continue;
    ranked.push({
      fullName: g.fullName,
      totalCount: g.totalCount,
      sourceCount: sources.length,
      sources,
      firstSeenAt: g.firstSeenAt,
      lastSeenAt: g.lastSeenAt,
    });
  }

  ranked.sort((a, b) => {
    if (b.sourceCount !== a.sourceCount) return b.sourceCount - a.sourceCount;
    if (b.totalCount !== a.totalCount) return b.totalCount - a.totalCount;
    if (a.lastSeenAt < b.lastSeenAt) return 1;
    if (a.lastSeenAt > b.lastSeenAt) return -1;
    return a.fullName < b.fullName ? -1 : a.fullName > b.fullName ? 1 : 0;
  });

  const capped = ranked.slice(0, Math.max(0, topN));
  return { rows: capped, totalUnknownMentions, distinctRepos };
}

async function readLakeRows(path) {
  let raw;
  try {
    raw = await readFile(path, "utf8");
  } catch (err) {
    if (err && err.code === "ENOENT") return { rows: [], malformed: 0 };
    throw err;
  }
  const out = [];
  let malformed = 0;
  const lines = raw.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    try {
      out.push(JSON.parse(line));
    } catch {
      malformed++;
      process.stderr.write(`[promote-unknown-mentions] skip malformed line ${i + 1}\n`);
    }
  }
  return { rows: out, malformed };
}

export async function main() {
  const topN = Number.isFinite(Number(process.env.PROMOTE_TOP_N))
    ? Number(process.env.PROMOTE_TOP_N)
    : DEFAULT_TOP_N;
  const minSources = Number.isFinite(Number(process.env.PROMOTE_MIN_SOURCES))
    ? Number(process.env.PROMOTE_MIN_SOURCES)
    : DEFAULT_MIN_SOURCES;

  const { rows: lakeRows, malformed } = await readLakeRows(LAKE_PATH);
  const { rows, totalUnknownMentions, distinctRepos } = aggregateUnknownMentions(
    lakeRows,
    { topN, minSources },
  );

  const payload = {
    generatedAt: new Date().toISOString(),
    totalUnknownMentions,
    distinctRepos,
    minSources,
    topN,
    rows,
  };

  await mkdir(dirname(OUT_PATH), { recursive: true });
  await writeFile(OUT_PATH, JSON.stringify(payload, null, 2) + "\n", "utf8");

  process.stdout.write(
    `[promote-unknown-mentions] lake=${totalUnknownMentions} distinct=${distinctRepos} ranked=${rows.length} malformed=${malformed}\n`,
  );
}

export const PROMOTED_OUTPUT_PATH = OUT_PATH;
export const UNKNOWN_MENTIONS_LAKE_PATH = LAKE_PATH;

const isMain = import.meta.url === `file://${process.argv[1]}` ||
  fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  main().catch((err) => {
    process.stderr.write(`[promote-unknown-mentions] fatal: ${err?.stack ?? err}\n`);
    process.exit(1);
  });
}
