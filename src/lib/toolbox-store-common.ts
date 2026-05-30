// TOOLBOX read adapter — shared primitives
//
// Common types + fetch wrapper + helpers used by per-signal adapters in
// toolbox-store.ts (mentions: hn/reddit/bluesky/devto) and
// toolbox-store-velocity.ts (stars + fork velocity). New adapters
// (huggingface variants, openai-rss, etc.) import from here
// instead of duplicating the boilerplate.
//
// Each adapter still owns its own row-shaping logic (mapping TOOLBOX
// events to the legacy file shape that the UI layer expects); only the
// transport + identity-extraction live here.

import "server-only";

export const DEFAULT_LIMIT = 500;
export const DEFAULT_TIMEOUT_MS = 8_000;

export interface ToolboxEvent {
  target_id: string;
  target_kind: string;
  target_identity: string;
  scan_id: string;
  run_id: string;
  signal_type: string;
  produced_at: string;
  fields: Record<string, unknown>;
}

export interface ToolboxLeaderboardResponse {
  count: number;
  targets: ToolboxEvent[];
}

export interface ToolboxFetchOptions {
  apiUrl: string;
  apiKey: string;
  limit?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export function extractGithubFullName(targetIdentity: string): string | null {
  try {
    const url = new URL(targetIdentity);
    const host = url.hostname.toLowerCase();
    if (host !== "github.com" && host !== "www.github.com") return null;
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length < 2) return null;
    return `${parts[0]}/${parts[1]}`;
  } catch {
    return null;
  }
}

export async function fetchLeaderboardEvents(
  opts: ToolboxFetchOptions,
  signalType: string,
): Promise<ToolboxLeaderboardResponse | null> {
  const limit = opts.limit ?? DEFAULT_LIMIT;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") return null;

  const base = opts.apiUrl.replace(/\/+$/, "");
  const url = `${base}/v1/signals/leaderboard?type=${encodeURIComponent(signalType)}&limit=${limit}`;

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, {
      headers: {
        authorization: `Bearer ${opts.apiKey}`,
        accept: "application/json",
      },
      signal: ac.signal,
    });
    if (!res.ok) return null;
    const body = (await res.json()) as ToolboxLeaderboardResponse;
    if (!body || !Array.isArray(body.targets)) return null;
    return body;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function maxProducedAtMs(events: ToolboxEvent[]): number {
  let max = 0;
  for (const ev of events) {
    const t = Date.parse(ev.produced_at);
    if (Number.isFinite(t) && t > max) max = t;
  }
  return max;
}
