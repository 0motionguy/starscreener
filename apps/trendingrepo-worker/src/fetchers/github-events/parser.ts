// Pure GitHub Events normalization + filtering.
//
// Pulled out of index.ts so the test suite can exercise the parser against
// fixture payloads without touching Redis, the HTTP client, or env. Keep
// this module side-effect free and unaware of FetcherContext / Logger so
// it stays trivially unit-testable.

import {
  RELEVANT_EVENT_TYPES,
  type NormalizedGithubEvent,
  type RelevantEventType,
} from './types.js';

const RELEVANT_SET: ReadonlySet<string> = new Set(RELEVANT_EVENT_TYPES);

/** Max events per repo we keep in the per-tick payload. Matches GH's per_page=100 ceiling. */
export const MAX_EVENTS_PER_REPO = 100;

interface RawGithubEvent {
  id?: unknown;
  type?: unknown;
  actor?: {
    login?: unknown;
    avatar_url?: unknown;
    display_login?: unknown;
  } | null;
  payload?: unknown;
  created_at?: unknown;
}

function asString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asPayloadObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

/**
 * Parse a single GH event into NormalizedGithubEvent, or null if the event
 * is malformed / not one of the relevant types. Caller filters out the
 * nulls — this lets tests assert on per-event rejection reasons without
 * us baking them into the return shape.
 */
export function normalizeEvent(raw: unknown): NormalizedGithubEvent | null {
  if (!raw || typeof raw !== 'object') return null;
  const ev = raw as RawGithubEvent;

  const id = asString(ev.id);
  const type = asString(ev.type);
  const createdAt = asString(ev.created_at);
  if (!id || !type || !createdAt) return null;
  if (!RELEVANT_SET.has(type)) return null;

  // Reject obvious garbage timestamps so consumers can sort blindly.
  const ts = Date.parse(createdAt);
  if (!Number.isFinite(ts)) return null;

  const actorRaw = ev.actor ?? null;
  const login = asString(actorRaw?.login) ?? asString(actorRaw?.display_login) ?? '';
  const avatarUrl = asString(actorRaw?.avatar_url);

  return {
    id,
    type,
    actor: { login, avatarUrl },
    payload: asPayloadObject(ev.payload),
    createdAt,
  };
}

/**
 * Normalize + filter + sort an array of raw GH events. Sort is newest-first
 * by `createdAt`. Capped at MAX_EVENTS_PER_REPO defensively even though the
 * upstream per_page is already 100 — covers the case where someone bumps
 * the page size or two pages get merged.
 */
export function normalizeEvents(rawEvents: unknown): NormalizedGithubEvent[] {
  if (!Array.isArray(rawEvents)) return [];
  const out: NormalizedGithubEvent[] = [];
  for (const raw of rawEvents) {
    const ev = normalizeEvent(raw);
    if (ev) out.push(ev);
  }
  out.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  return out.slice(0, MAX_EVENTS_PER_REPO);
}

/**
 * Re-export the relevant-type set for callers that need to test inclusion
 * without round-tripping through normalizeEvent.
 */
export function isRelevantEventType(type: string): type is RelevantEventType {
  return RELEVANT_SET.has(type);
}
