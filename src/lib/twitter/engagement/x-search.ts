// X engagement — candidate search.
//
// The toolbox `twitter.nitter_search` skill was retired (nitter is dead); the
// live toolbox X-reading skill is `social.scrapecreators` (tier-2 enriched,
// per-handle discovery). We call it once per curated target handle and map its
// `social.post` signals into EngagementCandidate.
//
//   POST ${TOOLBOX_API_URL}/v1/skills/social.scrapecreators/run
//   Authorization: Bearer ${TOOLBOX_API_KEY}
//   { "input": { "mode": "discover", "platform": "twitter", "handle": "<h>", "limit": <1..50> } }
//
// The runner passes `from:<handle> -filter:replies -filter:retweets` queries;
// we extract <handle> from that. Free-text / topic queries have no
// scrapecreators discovery equivalent, so they yield an empty list (skipped).
//
// Best-effort by design: a missing engine env or any transport error yields an
// empty list rather than throwing — the runner treats "no candidates" as a
// clean no-op. The source carries no engagement metrics, so likeCount is 0;
// reply/retweet flags are inferred from the text.

import "server-only";

import type { EngagementCandidate } from "./types";

const RUN_PATH = "/v1/skills/social.scrapecreators/run";
const MAX_LIMIT = 50;

/** One signal from social.scrapecreators (discover mode). */
interface ScrapeCreatorsSignal {
  type?: string;
  subject?: { kind?: string; id?: string; url?: string };
  value?: {
    text?: string;
    author?: string;
    author_id?: string;
    published_at?: string | null;
    url?: string;
    permalink?: string;
    platform?: string;
  };
}

export interface SearchCandidatesOptions {
  limit?: number;
  /** ISO floor — candidates older than this are dropped client-side. */
  sinceISO?: string;
  /** Reason tag stamped onto every returned candidate (target handle / topic). */
  reason?: string;
  /** Override for tests. Defaults to global fetch. */
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

let warnedMissingEnv = false;

/** Nitter/scraper surfaces reposts as `RT @user: …`. */
function looksLikeRetweet(text: string): boolean {
  return /^RT\s+@\w/i.test(text.trim());
}

/** A leading @mention is the strongest reply signal the source gives us. */
function looksLikeReply(text: string): boolean {
  return /^@\w/.test(text.trim());
}

/**
 * Extract the bare X handle from a `from:<handle> …` query. Returns null for
 * free-text/topic queries (which scrapecreators discovery cannot serve).
 */
export function handleFromQuery(query: string): string | null {
  const m = query.match(/(?:^|\s)from:@?([A-Za-z0-9_]{1,15})\b/);
  return m ? m[1] : null;
}

/** Map one scrapecreators signal to an EngagementCandidate, or null if unusable. */
export function mapSignalToCandidate(
  signal: ScrapeCreatorsSignal,
  reason: string,
): EngagementCandidate | null {
  if (signal?.type !== "social.post") return null;
  const id = signal.subject?.id?.trim() ?? "";
  const url = (
    signal.subject?.url ??
    signal.value?.url ??
    signal.value?.permalink ??
    ""
  ).trim();
  if (!id || !url) return null;
  const handle = (signal.value?.author ?? "").trim().replace(/^@+/, "");
  const text = signal.value?.text ?? "";
  return {
    id,
    url,
    authorId: handle.toLowerCase() || signal.value?.author_id || id,
    authorHandle: handle,
    text,
    createdAt: signal.value?.published_at ?? new Date(0).toISOString(),
    isReply: looksLikeReply(text),
    isRetweet: looksLikeRetweet(text),
    likeCount: 0,
    matchedReason: reason,
  };
}

/**
 * Search X for candidate posts from the handle named in `query`. Returns [] on
 * any failure, on a non-handle query, or when the engine env is unset.
 */
export async function searchEngagementCandidates(
  query: string,
  opts: SearchCandidatesOptions = {},
): Promise<EngagementCandidate[]> {
  const base = (process.env.TOOLBOX_API_URL ?? "").trim().replace(/\/+$/, "");
  const apiKey = (process.env.TOOLBOX_API_KEY ?? "").trim();
  if (!base || !apiKey) {
    if (!warnedMissingEnv) {
      warnedMissingEnv = true;
      console.warn(
        "[x-engagement] TOOLBOX_API_URL / TOOLBOX_API_KEY unset — candidate search disabled (no-op).",
      );
    }
    return [];
  }

  const handle = handleFromQuery(query);
  if (!handle) {
    // Topic / free-text query — scrapecreators has no search mode (handle-only
    // discovery). Skip quietly; the curated per-account path carries the run.
    return [];
  }

  const limit = Math.min(Math.max(1, opts.limit ?? 20), MAX_LIMIT);
  const fetchImpl = opts.fetchImpl ?? fetch;
  const reason = opts.reason ?? `target:@${handle}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 30_000);
  try {
    const res = await fetchImpl(`${base}${RUN_PATH}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        input: { mode: "discover", platform: "twitter", handle, limit },
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      console.warn(
        `[x-engagement] scrapecreators HTTP ${res.status} for @${handle} — skipping`,
      );
      return [];
    }
    const body = (await res.json().catch(() => null)) as
      | { signals?: unknown }
      | unknown[]
      | null;
    const signals: unknown[] = Array.isArray(body)
      ? body
      : Array.isArray((body as { signals?: unknown } | null)?.signals)
        ? ((body as { signals: unknown[] }).signals)
        : [];

    const sinceMs = opts.sinceISO ? Date.parse(opts.sinceISO) : Number.NaN;
    const out: EngagementCandidate[] = [];
    for (const raw of signals) {
      const candidate = mapSignalToCandidate(raw as ScrapeCreatorsSignal, reason);
      if (!candidate) continue;
      if (Number.isFinite(sinceMs)) {
        const postedMs = Date.parse(candidate.createdAt);
        if (Number.isFinite(postedMs) && postedMs < sinceMs) continue;
      }
      out.push(candidate);
    }
    return out;
  } catch (err) {
    console.warn(
      `[x-engagement] scrapecreators search failed for @${handle}: ${err instanceof Error ? err.message : String(err)}`,
    );
    return [];
  } finally {
    clearTimeout(timer);
  }
}
