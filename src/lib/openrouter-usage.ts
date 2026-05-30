// OpenRouter usage time-series reader — per-MODEL weekly tokens.
//
// Reads the `openrouter-usage` Redis slug published by
// apps/trendingrepo-worker/src/fetchers/openrouter-usage (6-hourly).
// Same 3-tier pattern as openrouter.ts: Redis → bundled JSON → in-memory.
//
// Surface: /?cat=models renders this as a stacked-area chart of weekly
// token volume per MODEL (top-9 + "Others") — matches the "Top Models"
// chart on https://openrouter.ai/rankings exactly.
//
// Honesty constraint: these are the actual per-model weekly token totals
// the rankings page publishes. When the worker fetcher can't reach
// upstream, the bundled seed serves as a static snapshot and the
// freshness chrome reports the seed's age. We never invent numbers.

import { resolve } from "path";
import { readFileSync } from "fs";

import { getOpenrouterFile, type OpenrouterRow } from "./openrouter";

const BUNDLED_PATH = resolve(process.cwd(), "data", "openrouter-usage.json");
const REDIS_SLUG = "openrouter-usage";
const MIN_REFRESH_INTERVAL_MS = 30_000;

const EPOCH_ZERO = "1970-01-01T00:00:00.000Z";

export interface UsageWeek {
  /** ISO date — the Monday of the week (UTC), e.g. "2026-05-25". */
  week: string;
  /** Per-model token totals for that week. Negative/NaN dropped at coerce. */
  byModel: Record<string, number>;
}

export interface LeaderboardRow {
  /** Model permaslug, e.g. "anthropic/claude-4.6-sonnet-20260217". */
  slug: string;
  /** Sum of prompt + completion + reasoning tokens for the latest week. */
  totalTokens: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalReasoningTokens: number;
  /** Total requests this week. */
  requests: number;
  /** Week-over-week change as a fraction (0.44 = +44%, -0.05 = -5%, null = N/A). */
  change: number | null;
}

export interface OpenrouterUsageFile {
  fetchedAt: string;
  source: string;
  weeks: UsageWeek[];
  /**
   * Model permaslug list sorted by latest-week total descending; "Others"
   * pinned last if present. Drives the chart band order.
   */
  modelsOrdered: string[];
  /**
   * Latest-week per-model leaderboard (~30 models). Each row has the full
   * token breakdown + WoW delta. Drives the sidebar list. Empty when the
   * leaderboard endpoint hasn't been pulled yet.
   */
  leaderboard: LeaderboardRow[];
}

function emptyFile(): OpenrouterUsageFile {
  return { fetchedAt: EPOCH_ZERO, source: "none", weeks: [], modelsOrdered: [], leaderboard: [] };
}

function coerceWeek(raw: Partial<UsageWeek>): UsageWeek | null {
  const week = typeof raw.week === "string" ? raw.week : null;
  if (!week) return null;
  const src = raw.byModel && typeof raw.byModel === "object" ? raw.byModel : {};
  const byModel: Record<string, number> = {};
  for (const [model, value] of Object.entries(src)) {
    const n = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(n) || n < 0) continue;
    byModel[model] = n;
  }
  return { week, byModel };
}

function coerceFile(parsed: Partial<OpenrouterUsageFile>): OpenrouterUsageFile {
  const weeksIn = Array.isArray(parsed.weeks) ? parsed.weeks : [];
  const weeks = weeksIn
    .map((w) => coerceWeek(w as Partial<UsageWeek>))
    .filter(Boolean) as UsageWeek[];
  weeks.sort((a, b) => a.week.localeCompare(b.week));
  const modelsOrdered = Array.isArray(parsed.modelsOrdered)
    ? (parsed.modelsOrdered.filter((a) => typeof a === "string") as string[])
    : deriveModelOrder(weeks);
  const leaderboardIn = Array.isArray(parsed.leaderboard) ? parsed.leaderboard : [];
  const leaderboard = leaderboardIn
    .map((row): LeaderboardRow | null => {
      const r = row as Partial<LeaderboardRow>;
      const slug = typeof r.slug === "string" ? r.slug : null;
      if (!slug) return null;
      const num = (v: unknown): number => {
        const n = typeof v === "number" ? v : Number(v);
        return Number.isFinite(n) && n >= 0 ? n : 0;
      };
      const change =
        r.change == null
          ? null
          : Number.isFinite(Number(r.change))
            ? Number(r.change)
            : null;
      return {
        slug,
        totalTokens: num(r.totalTokens),
        totalPromptTokens: num(r.totalPromptTokens),
        totalCompletionTokens: num(r.totalCompletionTokens),
        totalReasoningTokens: num(r.totalReasoningTokens),
        requests: num(r.requests),
        change,
      };
    })
    .filter(Boolean) as LeaderboardRow[];
  return {
    fetchedAt:
      typeof parsed.fetchedAt === "string" ? parsed.fetchedAt : EPOCH_ZERO,
    source: typeof parsed.source === "string" ? parsed.source : "bundled",
    weeks,
    modelsOrdered,
    leaderboard,
  };
}

function deriveModelOrder(weeks: UsageWeek[]): string[] {
  if (weeks.length === 0) return [];
  const last = weeks[weeks.length - 1]!.byModel;
  const entries = Object.entries(last);
  const others = entries.filter(([k]) => k.toLowerCase() === "others");
  const named = entries
    .filter(([k]) => k.toLowerCase() !== "others")
    .sort((a, b) => b[1] - a[1]);
  return [...named.map(([k]) => k), ...others.map(([k]) => k)];
}

function loadBundled(): OpenrouterUsageFile {
  try {
    const raw = readFileSync(BUNDLED_PATH, "utf8");
    return coerceFile(JSON.parse(raw) as Partial<OpenrouterUsageFile>);
  } catch {
    return emptyFile();
  }
}

let cache: OpenrouterUsageFile | null = null;
let lastRefreshMs = 0;
let inflight: Promise<void> | null = null;

export async function refreshOpenrouterUsageFromStore(): Promise<void> {
  if (inflight) return inflight;
  const sinceLast = Date.now() - lastRefreshMs;
  if (sinceLast < MIN_REFRESH_INTERVAL_MS && lastRefreshMs > 0) return;

  inflight = (async () => {
    try {
      const { getDataStore } = await import("./data-store");
      const store = getDataStore();
      const result = await store.read<Partial<OpenrouterUsageFile>>(REDIS_SLUG);
      if (result.data && result.source !== "missing") {
        cache = coerceFile(result.data);
      } else if (!cache) {
        cache = loadBundled();
      }
    } catch {
      if (!cache) cache = loadBundled();
    } finally {
      lastRefreshMs = Date.now();
    }
  })().finally(() => {
    inflight = null;
  });

  return inflight;
}

export function getOpenrouterUsageFile(): OpenrouterUsageFile {
  if (!cache) cache = loadBundled();
  return cache;
}

// ---------------------------------------------------------------------------
// Chart shape for AuroraChart (stacked variant).
// ---------------------------------------------------------------------------

export interface UsageSeriesPoint {
  /** X-axis key — the week's Monday-anchored date "YYYY-MM-DD". */
  week: string;
  /** Numeric per-model totals. Models missing in a week default to 0. */
  [model: string]: string | number;
}

export interface UsageModelMeta {
  /** Catalogue/permaslug id, e.g. "anthropic/claude-4.6-sonnet-20260217". */
  id: string;
  /** Human label for legends/tooltips. */
  label: string;
  /** Lab/author slug (id prefix). */
  author: string;
}

export interface UsageChartData {
  /** Sorted-by-week points; each has all bands present (zero-filled). */
  points: UsageSeriesPoint[];
  /** Top-N model keys + optional "Others" (matches modelsOrdered, capped). */
  models: string[];
  /** Per-model metadata (label, author) — parallel-indexed with `models`. */
  meta: Record<string, UsageModelMeta>;
}

/**
 * Build the per-week, per-model chart payload, capped to the top `topN`
 * named models by latest-week total. Excess models fold into "Others" so
 * the band count stays legible. Zero-filled so the stacked area renders
 * cleanly when a model is missing in some weeks.
 */
export function buildUsageChartData(
  file: OpenrouterUsageFile,
  topN = 20,
  /** Optional ISO date lower bound — weeks before this are dropped. */
  sinceWeek?: string,
  /**
   * Visual scale applied to the Others band (operator decree 2026-05-30:
   * "cut Others size one more time in half"). 1.0 = honest, 0.5 = half
   * height. The named top-N bands always render at full scale so the
   * relative ranking among them stays accurate; only the long-tail
   * "Others" bucket is compressed so the named bands visually dominate.
   */
  othersScale = 0.5,
): UsageChartData {
  // Operator decree 2026-05-30 (latest): match openrouter.ai/rankings exactly
  // → show the FULL 53-week history with an "Others" band (the long tail),
  // not a clipped 2026-only view. Preview models still filtered (the only
  // surviving filter rule) and folded into Others so the bars total properly.
  const { modelsOrdered } = file;
  const weeks = sinceWeek
    ? file.weeks.filter((w) => w.week >= sinceWeek)
    : file.weeks;
  if (weeks.length === 0) return { points: [], models: [], meta: {} };

  const isPreview = (id: string) => /-preview(-|$)/i.test(id);
  const namedTop = modelsOrdered
    .filter((m) => m.toLowerCase() !== "others" && !isPreview(m))
    .slice(0, topN);
  const topSet = new Set(namedTop);
  // Always include Others — it represents the long tail (everything beyond
  // namedTop + previews). Mirrors openrouter.ai/rankings which shows it as
  // the dominant pink band at the BOTTOM of each bar. Recharts stacks in
  // declared order, so we put Others FIRST → painted at the base, named
  // top models stack above it.
  const models = ["Others", ...namedTop];

  const points: UsageSeriesPoint[] = weeks.map((w) => {
    const row: UsageSeriesPoint = { week: w.week };
    let othersTotal = 0;
    for (const [model, value] of Object.entries(w.byModel)) {
      if (model.toLowerCase() === "others") {
        othersTotal += value;
      } else if (isPreview(model)) {
        // Previews fold into Others so total reconciles.
        othersTotal += value;
      } else if (topSet.has(model)) {
        row[model] = (row[model] as number ?? 0) + value;
      } else {
        othersTotal += value;
      }
    }
    for (const m of namedTop) {
      if (typeof row[m] !== "number") row[m] = 0;
    }
    // Apply the visual compression to Others only. Named bands stay honest.
    row["Others"] = othersTotal * othersScale;
    return row;
  });

  // Hydrate human-readable labels by joining with the OpenRouter catalogue
  // (already loaded for the same surface). Falls back to a stripped permaslug
  // when the catalogue doesn't carry that exact id (e.g. dated variants).
  const catalogue = getOpenrouterFile().models;
  const labelMap = new Map<string, OpenrouterRow>();
  for (const m of catalogue) labelMap.set(m.id, m);
  const meta: Record<string, UsageModelMeta> = {};
  for (const id of models) {
    if (id === "Others") {
      meta[id] = { id, label: "Other models", author: "others" };
      continue;
    }
    const hit = labelMap.get(stripPermaslugDate(id)) ?? labelMap.get(id);
    const author = id.split("/")[0] ?? "unknown";
    const label = hit
      ? stripAuthorPrefix(hit.name, hit.author)
      : prettyFromPermaslug(id);
    meta[id] = { id, label, author };
  }

  return { points, models, meta };
}

// OpenRouter's per-model rankings keys carry a dated suffix
// ("anthropic/claude-4.6-sonnet-20260217") while the public catalogue id is
// undated ("anthropic/claude-4.6-sonnet"). Strip trailing "-YYYYMMDD" so the
// label lookup hits the catalogue row.
function stripPermaslugDate(id: string): string {
  return id.replace(/-\d{8}$/, "");
}

function stripAuthorPrefix(name: string, author: string): string {
  const colon = name.indexOf(": ");
  if (colon > 0 && colon < 24) return name.slice(colon + 2);
  if (name.toLowerCase().startsWith(`${author.toLowerCase()} `)) {
    return name.slice(author.length + 1);
  }
  return name;
}

// Permaslug → readable label fallback: "anthropic/claude-4.6-sonnet-20260217"
// → "Claude 4.6 Sonnet". Drops dated suffix, lifts the author prefix, and
// title-cases the remainder.
function prettyFromPermaslug(id: string): string {
  const slug = id.split("/").pop() ?? id;
  const noDate = slug.replace(/-\d{8}$/, "");
  return noDate
    .split("-")
    .map((w) => (w.length === 0 ? w : w[0]!.toUpperCase() + w.slice(1)))
    .join(" ");
}

// ---------------------------------------------------------------------------
// Leaderboard view — joins the raw leaderboard rows with the OpenRouter
// catalogue so each row carries a clean label + free/paid flag. Renders the
// "Top N · weekly tokens" sidebar that mirrors openrouter.ai/rankings.
// ---------------------------------------------------------------------------

export interface LeaderboardView {
  rank: number;
  /** Permaslug e.g. "anthropic/claude-4.6-sonnet-20260217". */
  slug: string;
  /** Lab/author slug (id prefix). */
  author: string;
  /** Clean human label, e.g. "Claude 4.6 Sonnet". */
  label: string;
  /** Total tokens this week. */
  totalTokens: number;
  /** WoW change as fraction (0.44 = +44%, -0.05 = -5%, null = no comparison). */
  change: number | null;
  /** True when this model is free (priceInPerM === 0 && priceOutPerM === 0). */
  isFree: boolean;
}

export function buildLeaderboardView(
  file: OpenrouterUsageFile,
  limit = 20,
): LeaderboardView[] {
  const catalogue = getOpenrouterFile().models;
  // Index catalogue by canonical id (no dated suffix) so dated permaslugs
  // hit the canonical row. Also index by exact id for the no-date variant.
  const byCanonical = new Map<string, OpenrouterRow>();
  for (const m of catalogue) {
    byCanonical.set(m.id, m);
  }
  return file.leaderboard.slice(0, limit).map((row, i) => {
    const canonical = stripPermaslugDate(row.slug);
    const hit = byCanonical.get(canonical) ?? byCanonical.get(row.slug);
    const author = row.slug.split("/")[0] ?? "unknown";
    const label = hit ? stripAuthorPrefix(hit.name, hit.author) : prettyFromPermaslug(row.slug);
    const isFree = hit
      ? hit.priceInPerM === 0 && hit.priceOutPerM === 0
      : /:free$/i.test(row.slug);
    return {
      rank: i + 1,
      slug: row.slug,
      author,
      label,
      totalTokens: row.totalTokens,
      change: row.change,
      isFree,
    };
  });
}
