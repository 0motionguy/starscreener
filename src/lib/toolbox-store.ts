// TOOLBOX read adapter — Phase A.2 reader-switch
//
// Reads aggregated signal events from TOOLBOX (api.aiso.tools) and shapes
// them into the same data structures the local data-store returns. Lets
// us flip per-source readers to TOOLBOX without changing the UI layer.
//
// Each fetchXFromToolbox() returns the legacy file shape (HnMentionsFile,
// etc.) or `null` on any failure — callers fall back to the legacy
// data-store path on null. This keeps the per-source feature flag a
// one-line guard at the refresh hook and preserves degraded-render
// behaviour when TOOLBOX is unreachable.
//
// Endpoint: GET /v1/signals/leaderboard?type=<signal_type>&limit=...
// Reconstructs logical events server-side (TOOLBOX's tb_signals is EAV);
// each returned row is one repo's most recent event.
//
// Adapter contract (per-source):
//   fetchHnMentionsFromToolbox({ apiUrl, apiKey, limit?, timeoutMs? })
//     → HnMentionsFile | null

import "server-only";

import type {
  HnLeaderboardEntry,
  HnMentionsFile,
  HnRepoMention,
  HnStory,
  HnStoryRef,
} from "./hackernews";

const DEFAULT_LIMIT = 500;
const DEFAULT_TIMEOUT_MS = 8_000;

interface ToolboxEvent {
  target_id: string;
  target_kind: string;
  target_identity: string;
  scan_id: string;
  run_id: string;
  signal_type: string;
  produced_at: string;
  fields: Record<string, unknown>;
}

interface ToolboxLeaderboardResponse {
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

function extractGithubFullName(targetIdentity: string): string | null {
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

function slugIdFromFullName(fullName: string): string {
  return String(fullName)
    .toLowerCase()
    .replace(/\//g, "--")
    .replace(/\./g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

function eventToMention(event: ToolboxEvent): HnRepoMention | null {
  const f = event.fields;
  if (typeof f !== "object" || f === null) return null;
  const count7d = typeof f.count_7d === "number" ? f.count_7d : null;
  if (count7d === null) return null;
  const scoreSum7d = typeof f.score_sum_7d === "number" ? f.score_sum_7d : 0;
  const everHitFrontPage =
    typeof f.ever_hit_front_page === "boolean" ? f.ever_hit_front_page : false;
  const topStory =
    f.top_story && typeof f.top_story === "object"
      ? (f.top_story as HnStoryRef)
      : null;
  const stories = Array.isArray(f.stories_top10) ? (f.stories_top10 as HnStory[]) : [];
  return {
    count7d,
    scoreSum7d,
    everHitFrontPage,
    topStory,
    stories,
  };
}

/**
 * Fetch the latest HN mentions snapshot from TOOLBOX and shape it into an
 * HnMentionsFile. Returns null on any error so the caller can fall back to
 * the legacy data-store path without throwing.
 *
 * Caveat: TOOLBOX's dual-write caps stories at 10 per repo (see
 * trendingrepo's `scripts/_toolbox-ingest.mjs`), so windowed counts
 * (count24h, count30d) computed at reader load time will undercount for
 * viral repos with more than 10 stories in a 7-day window. Acceptable for
 * the tracer-bullet flip; revisit if it materially shifts ranking.
 */
export async function fetchHnMentionsFromToolbox(
  opts: ToolboxFetchOptions,
): Promise<HnMentionsFile | null> {
  const limit = opts.limit ?? DEFAULT_LIMIT;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") return null;

  const base = opts.apiUrl.replace(/\/+$/, "");
  const url = `${base}/v1/signals/leaderboard?type=trending.hn.mentions&limit=${limit}`;

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  let body: ToolboxLeaderboardResponse | null = null;
  try {
    const res = await fetchImpl(url, {
      headers: {
        authorization: `Bearer ${opts.apiKey}`,
        accept: "application/json",
      },
      signal: ac.signal,
    });
    if (!res.ok) return null;
    body = (await res.json()) as ToolboxLeaderboardResponse;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }

  if (!body || !Array.isArray(body.targets)) return null;

  const mentions: Record<string, HnRepoMention> = {};
  const mentionsByRepoId: Record<string, HnRepoMention> = {};
  let latestProducedAtMs = 0;

  for (const ev of body.targets) {
    const fullName = extractGithubFullName(ev.target_identity);
    if (!fullName) continue;
    const mention = eventToMention(ev);
    if (!mention) continue;
    mentions[fullName] = mention;
    mentionsByRepoId[slugIdFromFullName(fullName)] = mention;
    const producedAtMs = Date.parse(ev.produced_at);
    if (Number.isFinite(producedAtMs) && producedAtMs > latestProducedAtMs) {
      latestProducedAtMs = producedAtMs;
    }
  }

  const leaderboard: HnLeaderboardEntry[] = Object.entries(mentions)
    .map(([fullName, m]) => ({
      fullName,
      count7d: m.count7d,
      scoreSum7d: m.scoreSum7d,
    }))
    .sort((a, b) => b.scoreSum7d - a.scoreSum7d);

  return {
    fetchedAt:
      latestProducedAtMs > 0
        ? new Date(latestProducedAtMs).toISOString()
        : new Date().toISOString(),
    windowDays: 7,
    scannedAlgoliaHits: 0,
    scannedFirebaseItems: 0,
    mentions,
    mentionsByRepoId,
    leaderboard,
  };
}
