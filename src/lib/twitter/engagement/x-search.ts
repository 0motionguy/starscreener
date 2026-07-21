// X engagement — candidate search.
//
// Reuses the READ side of the toolbox Twitter engine (the same
// `twitter.nitter_search` skill the collectors call in
// scripts/_toolbox-twitter-provider.ts), mapped into EngagementCandidate.
//
//   POST ${TOOLBOX_API_URL}/v1/skills/twitter.nitter_search/run
//   Authorization: Bearer ${TOOLBOX_API_KEY}
//   { "input": { "query": "<search>", "limit": <1..50> } }
//
// Best-effort by design: a missing engine env or any transport error yields an
// empty list rather than throwing — the runner treats "no candidates" as a
// clean no-op. The nitter source carries no engagement metrics, so likeCount
// is 0 (same degraded contract as the collector path); reply/retweet flags are
// inferred from the text.

import "server-only";

import type { EngagementCandidate } from "./types";

const RUN_PATH = "/v1/skills/twitter.nitter_search/run";
const MAX_LIMIT = 50;

interface ToolboxXSignal {
  type?: string;
  subject?: { kind?: string; id?: string; url?: string };
  value?: {
    text?: string;
    author_handle?: string;
    posted_at?: string | null;
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

/**
 * Detect a retweet from the post text. Nitter surfaces reposts as `RT @user: …`.
 */
function looksLikeRetweet(text: string): boolean {
  return /^RT\s+@\w/i.test(text.trim());
}

/**
 * Detect a reply from the post text. A leading @mention is the strongest
 * signal nitter gives us (the search query also excludes replies engine-side
 * where supported).
 */
function looksLikeReply(text: string): boolean {
  return /^@\w/.test(text.trim());
}

/** Map one engine signal to an EngagementCandidate, or null if unusable. */
export function mapSignalToCandidate(
  signal: ToolboxXSignal,
  reason: string,
): EngagementCandidate | null {
  if (signal?.type !== "social.x.post") return null;
  const id = signal.subject?.id?.trim() ?? "";
  const url = signal.subject?.url?.trim() ?? "";
  if (!id || !url) return null;
  const handle = (signal.value?.author_handle ?? "").trim().replace(/^@+/, "");
  const text = signal.value?.text ?? "";
  return {
    id,
    url,
    authorId: handle.toLowerCase() || id,
    authorHandle: handle,
    text,
    createdAt: signal.value?.posted_at ?? new Date(0).toISOString(),
    isReply: looksLikeReply(text),
    isRetweet: looksLikeRetweet(text),
    likeCount: 0,
    matchedReason: reason,
  };
}

/**
 * Search X for candidate posts matching `query`. Returns [] on any failure.
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

  const limit = Math.min(Math.max(1, opts.limit ?? 20), MAX_LIMIT);
  const fetchImpl = opts.fetchImpl ?? fetch;
  const reason = opts.reason ?? query;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 30_000);
  try {
    const res = await fetchImpl(`${base}${RUN_PATH}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ input: { query, limit } }),
      signal: controller.signal,
    });
    if (!res.ok) {
      console.warn(
        `[x-engagement] search HTTP ${res.status} for "${query.slice(0, 60)}" — skipping`,
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
      const candidate = mapSignalToCandidate(raw as ToolboxXSignal, reason);
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
      `[x-engagement] search failed for "${query.slice(0, 60)}": ${err instanceof Error ? err.message : String(err)}`,
    );
    return [];
  } finally {
    clearTimeout(timer);
  }
}
