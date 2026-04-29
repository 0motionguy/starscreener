// Helpers for the per-MCP detail page (`/mcp/[slug]`).
//
// Centralizes:
//   - slug ↔ EcosystemLeaderboardItem resolution (URL-safe, lowercased)
//   - MCP downloads-history Redis read (no key exists today; reader returns
//     null and the page renders a placeholder — DO NOT invent fake history)
//
// Kept in a separate module from `src/lib/ecosystem-leaderboards.ts` so the
// per-MCP detail work can land without touching the file other agents are
// editing for H1/H2.

import {
  getMcpSignalData,
  type EcosystemLeaderboardItem,
} from "./ecosystem-leaderboards";
import { getDataStore } from "./data-store";

/**
 * URL-safe slug for an MCP item. The publish payload's `slug` is the
 * canonical key (often `vendor/package-name`); we lowercase and URL-encode
 * each path segment so router params round-trip cleanly. Falls back to the
 * item id when slug isn't set.
 *
 * Example: `Vendor/Package-Name` -> `vendor/package-name` (encoded segment-
 * by-segment to keep `/` as the separator the route accepts as a single
 * `[slug]` param).
 */
export function slugForMcp(item: EcosystemLeaderboardItem): string {
  const raw = item.id ?? "";
  // Existing items have ids like "vendor/package" or just "package".
  // The route uses a single `[slug]` segment so we encode the whole thing.
  return encodeURIComponent(raw.toLowerCase());
}

/**
 * Decode the URL-encoded slug param coming back from `/mcp/[slug]`.
 * Returns the lowercased canonical key.
 */
function normalizeSlug(slug: string): string {
  let decoded = slug;
  try {
    decoded = decodeURIComponent(slug);
  } catch {
    // Malformed URI — fall back to the raw value; downstream lookup will miss.
  }
  return decoded.toLowerCase();
}

/**
 * Resolve a single MCP item by URL slug. Returns `null` when no item in the
 * current leaderboard payload matches — the page should call
 * `notFound()` in that case.
 */
export async function getMcpDetailBySlug(
  slug: string,
): Promise<EcosystemLeaderboardItem | null> {
  const data = await getMcpSignalData();
  const target = normalizeSlug(slug);
  for (const item of data.board.items) {
    if (item.id.toLowerCase() === target) return item;
  }
  return null;
}

/**
 * Per-day download datapoint. The chart consumer renders these directly.
 */
export interface McpDownloadsHistoryPoint {
  /** UTC date in YYYY-MM-DD form. */
  date: string;
  /** Combined npm + pypi downloads for that day. */
  total: number;
  npm?: number;
  pypi?: number;
}

/**
 * Read the (currently non-existent) `mcp-downloads-history:<package>` key
 * out of the data store. Returns `null` when the key is missing — which is
 * the cold-start condition today since `npm-downloads` writes a single
 * point-in-time, not history.
 *
 * IMPORTANT: do not synthesize history from the single most recent
 * datapoint. The page's UX is to surface "Building 7-day chart…" until the
 * fetcher is extended to capture a rolling buffer.
 */
export async function readMcpDownloadsHistory(
  packageName: string,
): Promise<McpDownloadsHistoryPoint[] | null> {
  if (!packageName) return null;
  const store = getDataStore();
  const key = `mcp-downloads-history:${packageName.toLowerCase()}`;
  const result = await store.read<unknown>(key);
  if (!result.data) return null;
  const root = result.data as Record<string, unknown> | null;
  const points = root && Array.isArray(root.points) ? root.points : null;
  if (!points || points.length === 0) return null;
  const out: McpDownloadsHistoryPoint[] = [];
  for (const p of points) {
    if (!p || typeof p !== "object") continue;
    const e = p as Record<string, unknown>;
    const date = typeof e.date === "string" ? e.date : null;
    const total = typeof e.total === "number" && Number.isFinite(e.total) ? e.total : null;
    if (!date || total === null) continue;
    const npm = typeof e.npm === "number" && Number.isFinite(e.npm) ? e.npm : undefined;
    const pypi = typeof e.pypi === "number" && Number.isFinite(e.pypi) ? e.pypi : undefined;
    out.push({ date, total, npm, pypi });
  }
  // Trim to most-recent 7 entries; render in chronological order.
  out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return out.slice(-7);
}

/**
 * Tool descriptor read from the liveness side-channel. The `__liveness` blob
 * stashed on the raw payload doesn't currently include the tool list — the
 * pinger writes only a count. When/if the pinger is extended to include
 * `tools: [{ name, description }]`, this reader picks it up.
 */
export interface McpToolDescriptor {
  name: string;
  description?: string;
}

/**
 * Best-effort read of the manifest tool list. Returns `[]` when the side
 * channel hasn't been populated yet (cold-start, normal). The page
 * differentiates "empty list" from "no manifest pings" using the liveness
 * pill state, not by looking at this array's length.
 */
export async function readMcpManifestTools(
  itemId: string,
): Promise<McpToolDescriptor[]> {
  if (!itemId) return [];
  const store = getDataStore();
  // The pinger could (future) write a per-server manifest snapshot here.
  // We attempt the read and tolerate misses — the page falls back to a
  // placeholder when the list is empty.
  const key = `mcp-manifest:${itemId.toLowerCase()}`;
  const result = await store.read<unknown>(key);
  const root = result.data as Record<string, unknown> | null;
  const tools = root && Array.isArray(root.tools) ? root.tools : null;
  if (!tools) return [];
  const out: McpToolDescriptor[] = [];
  for (const t of tools) {
    if (!t || typeof t !== "object") continue;
    const e = t as Record<string, unknown>;
    const name = typeof e.name === "string" && e.name.trim().length > 0 ? e.name.trim() : null;
    if (!name) continue;
    const description =
      typeof e.description === "string" && e.description.trim().length > 0
        ? e.description.trim()
        : undefined;
    out.push({ name, description });
  }
  return out;
}
