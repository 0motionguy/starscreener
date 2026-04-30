// Unknown-mentions lake — data/unknown-mentions.jsonl.
//
// When a social scraper finds a github.com/<owner>/<repo> link in a post
// but the repo is NOT yet in the tracked set, we lose the signal: the
// mention extractor drops it on the floor. The lake captures those drops
// as append-only JSONL rows so a downstream promotion job can surface
// top-N unknown candidates for inclusion in the tracked seed (the
// "discovery loop" the audit's S2/F3 calls for).
//
// Each row:
//   {
//     source: "bluesky" | "reddit" | "hackernews" | ...,
//     fullName: "owner/repo",   // already normalized via normalizeGithubFullName
//     observedAt: "2026-04-30T..." // ISO-8601
//   }
//
// Append-only by design — the promotion job is responsible for compaction
// (group-by fullName, count occurrences). Adapters call once per scrape
// pass with the de-duplicated set of unknown candidates seen this run.

import { appendFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const LAKE_PATH = resolve(__dirname, "..", "data", "unknown-mentions.jsonl");

let dirEnsured = null;

/**
 * Append unknown-mention rows to data/unknown-mentions.jsonl.
 *
 * @param {Array<{source: string, fullName: string, observedAt?: string}>} rows
 * @returns {Promise<{appended: number}>}
 */
export async function appendUnknownMentions(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return { appended: 0 };
  }
  if (!dirEnsured) {
    dirEnsured = mkdir(dirname(LAKE_PATH), { recursive: true });
  }
  await dirEnsured;
  const ts = new Date().toISOString();
  const lines = rows
    .map((r) =>
      JSON.stringify({
        source: String(r.source ?? "unknown"),
        fullName: String(r.fullName ?? ""),
        observedAt: String(r.observedAt ?? ts),
      }),
    )
    .join("\n") + "\n";
  await appendFile(LAKE_PATH, lines, "utf8");
  return { appended: rows.length };
}

export const UNKNOWN_MENTIONS_LAKE_PATH = LAKE_PATH;
