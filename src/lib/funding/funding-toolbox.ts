// Funding TOOLBOX read adapter — Phase A.2 reader-switch for funding.
//
// Mirrors src/lib/toolbox-store.ts (devto / hn / reddit / bluesky adapters).
// Reads `funding.startup` (19K rows) + `funding.sec.formd` (9.3K rows) from
// TOOLBOX's /v1/signals/leaderboard endpoint and shapes them into the same
// `FundingEventsFile` shape that the local data-store returns. The caller
// (refreshFundingFromStore) falls back to the legacy data-store path on
// null, preserving degraded-render behaviour when TOOLBOX is unreachable.
//
// Two independent signal types, two independent env flags — operators can
// flip startups onto TOOLBOX without touching the SEC pipeline (and vice
// versa). Both fetchers return null on flag-off / missing env / fetch fail.

import "server-only";

import type { ToolboxEvent, ToolboxFetchOptions } from "../toolbox-store-common";
import {
  fetchLeaderboardEvents,
  maxProducedAtMs,
} from "../toolbox-store-common";
import type {
  FundingEvent,
  FundingEventConfidence,
  FundingEventRound,
  FundingEventsFile,
} from "./types";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function isoFromMaxOrNow(maxMs: number): string {
  return (maxMs > 0 ? new Date(maxMs) : new Date()).toISOString();
}

const ROUND_TYPES: ReadonlySet<FundingEventRound> = new Set([
  "pre-seed",
  "seed",
  "series-a",
  "series-b",
  "series-c",
  "series-d+",
  "bridge",
  "acquisition",
  "ipo",
]);

const CONFIDENCE_VALUES: ReadonlySet<FundingEventConfidence> = new Set([
  "exact-domain",
  "exact-name",
  "alias",
  "fuzzy",
]);

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asRoundType(value: unknown): FundingEventRound | null {
  return typeof value === "string" && ROUND_TYPES.has(value as FundingEventRound)
    ? (value as FundingEventRound)
    : null;
}

function asConfidence(value: unknown): FundingEventConfidence {
  return typeof value === "string" &&
    CONFIDENCE_VALUES.has(value as FundingEventConfidence)
    ? (value as FundingEventConfidence)
    : "fuzzy";
}

function asInvestors(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string" && v.length > 0);
}

/**
 * Pure shaping function — TOOLBOX event row → FundingEvent. Returns null if
 * the required fields aren't present (companyName + roundType + closedAt).
 */
function eventToFundingEvent(event: ToolboxEvent): FundingEvent | null {
  const f = event.fields;
  if (typeof f !== "object" || f === null) return null;

  const companyName = asString(f.company_name) ?? asString(f.companyName);
  if (!companyName) return null;

  const roundType =
    asRoundType(f.round_type) ?? asRoundType(f.roundType);
  if (!roundType) return null;

  const closedAt =
    asString(f.closed_at) ??
    asString(f.closedAt) ??
    asString(f.announced_at) ??
    event.produced_at;
  if (!closedAt) return null;

  return {
    // Stable id — drives dedupe-on-merge in tryFetchFundingFromToolbox.
    // target_id is the upstream Postgres PK (stable per company-round).
    // Fallback composes companyName + closedAt — deterministic for the
    // same upstream row so the merge stays safe even when target_id is
    // empty. See FundingEvent.id JSDoc in ./types.ts for the contract.
    id: event.target_id || `${companyName}:${closedAt}`,
    companyName,
    companySlug: asString(f.company_slug) ?? asString(f.companySlug),
    repoFullName: asString(f.repo_full_name) ?? asString(f.repoFullName),
    roundType,
    amountUsd: asNumber(f.amount_usd) ?? asNumber(f.amountUsd),
    closedAt,
    investors: asInvestors(f.investors),
    sourceUrl:
      asString(f.source_url) ?? asString(f.sourceUrl) ?? event.target_identity,
    sourceName: asString(f.source_name) ?? asString(f.sourceName) ?? "toolbox",
    confidence: asConfidence(f.confidence),
    sector: asString(f.sector),
  };
}

function shapeEventsFile(
  events: ToolboxEvent[],
  source: string,
): FundingEventsFile {
  const shaped: FundingEvent[] = [];
  for (const ev of events) {
    const out = eventToFundingEvent(ev);
    if (out) shaped.push(out);
  }
  return {
    fetchedAt: isoFromMaxOrNow(maxProducedAtMs(events)),
    source,
    events: shaped,
  };
}

// ---------------------------------------------------------------------------
// Public fetchers
// ---------------------------------------------------------------------------

/**
 * Pull `funding.startup` events from TOOLBOX. Returns null when the flag is
 * off, env vars are missing, or the fetch fails — caller falls back to the
 * legacy data-store path on null.
 */
export async function fetchFundingStartupFromToolbox(
  opts: ToolboxFetchOptions,
): Promise<FundingEventsFile | null> {
  const body = await fetchLeaderboardEvents(opts, "funding.startup");
  if (!body) return null;
  return shapeEventsFile(body.targets, "toolbox:funding.startup");
}

/**
 * Pull `funding.sec.formd` events from TOOLBOX. Same null contract as the
 * startup fetcher — null means "fall back to legacy".
 */
export async function fetchFundingSecFormDFromToolbox(
  opts: ToolboxFetchOptions,
): Promise<FundingEventsFile | null> {
  const body = await fetchLeaderboardEvents(opts, "funding.sec.formd");
  if (!body) return null;
  return shapeEventsFile(body.targets, "toolbox:funding.sec.formd");
}

// ---------------------------------------------------------------------------
// Flag-gated try-fetch (used by refresh hook in aggregate.ts)
// ---------------------------------------------------------------------------

/**
 * Combined try-fetch: pulls startup + SEC Form D from TOOLBOX as configured,
 * merges into a single FundingEventsFile. Returns null when neither flag is
 * on OR both fetches returned null. Diagnostics surface via the second tuple
 * member so the caller can log `had_toolbox_flag` / `read_source`.
 */
export async function tryFetchFundingFromToolbox(): Promise<{
  file: FundingEventsFile | null;
  diag: {
    hadStartupFlag: boolean;
    hadSecFlag: boolean;
    startupSource: "toolbox" | "null" | "skipped";
    secSource: "toolbox" | "null" | "skipped";
  };
}> {
  const hadStartupFlag = process.env.TOOLBOX_READ_FUNDING_STARTUP === "true";
  const hadSecFlag = process.env.TOOLBOX_READ_FUNDING_SEC_FORMD === "true";

  if (!hadStartupFlag && !hadSecFlag) {
    return {
      file: null,
      diag: {
        hadStartupFlag,
        hadSecFlag,
        startupSource: "skipped",
        secSource: "skipped",
      },
    };
  }

  const apiUrl = process.env.TOOLBOX_API_URL;
  const apiKey = process.env.TOOLBOX_API_KEY;
  if (!apiUrl || !apiKey) {
    return {
      file: null,
      diag: {
        hadStartupFlag,
        hadSecFlag,
        startupSource: "skipped",
        secSource: "skipped",
      },
    };
  }

  const opts: ToolboxFetchOptions = { apiUrl, apiKey };

  const [startup, sec] = await Promise.all([
    hadStartupFlag ? fetchFundingStartupFromToolbox(opts) : Promise.resolve(null),
    hadSecFlag ? fetchFundingSecFormDFromToolbox(opts) : Promise.resolve(null),
  ]);

  const startupSource: "toolbox" | "null" | "skipped" = hadStartupFlag
    ? startup
      ? "toolbox"
      : "null"
    : "skipped";
  const secSource: "toolbox" | "null" | "skipped" = hadSecFlag
    ? sec
      ? "toolbox"
      : "null"
    : "skipped";

  if (!startup && !sec) {
    return {
      file: null,
      diag: { hadStartupFlag, hadSecFlag, startupSource, secSource },
    };
  }

  // Merge — dedupe on event.id, prefer startup row when both sources
  // emit the same id (startup pipeline is more enriched than SEC).
  const merged = new Map<string, FundingEvent>();
  for (const ev of sec?.events ?? []) merged.set(ev.id, ev);
  for (const ev of startup?.events ?? []) merged.set(ev.id, ev);

  // fetchedAt = newest of the two payloads.
  const startupMs = startup ? Date.parse(startup.fetchedAt) : 0;
  const secMs = sec ? Date.parse(sec.fetchedAt) : 0;
  const fetchedAt = isoFromMaxOrNow(Math.max(startupMs, secMs));

  const sourceParts = [
    startup ? "startup" : null,
    sec ? "sec.formd" : null,
  ].filter((s): s is string => s !== null);

  return {
    file: {
      fetchedAt,
      source: `toolbox:${sourceParts.join("+")}`,
      events: Array.from(merged.values()),
    },
    diag: { hadStartupFlag, hadSecFlag, startupSource, secSource },
  };
}
