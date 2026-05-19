// TrendingRepo — Star Activity URL state encoder / decoder.
//
// Single source of truth for the share-card URL schema. Both the interactive
// chart toggles and the /api/og/star-activity endpoint consume the same
// shape, so a copy-pasted URL reproduces the exact chart and the exact card.

import type { StarActivityMode, StarActivityScale } from "./star-activity";
import { absoluteUrl } from "./seo";

export type LegendCorner = "tr" | "tl" | "br" | "bl";

export interface StarActivityState {
  /** 1..4 owner/name strings. */
  repos: string[];
  mode: StarActivityMode;
  scale: StarActivityScale;
  legend: LegendCorner;
  /** Optional cache-buster — passes through unchanged. */
  v?: string;
}

export interface StarActivityImageState extends StarActivityState {
  aspect?: "h" | "v";
}

const FULL_NAME_RE = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;
const MAX_REPOS = 4;
const VALID_LEGEND: ReadonlySet<LegendCorner> = new Set([
  "tr",
  "tl",
  "br",
  "bl",
]);

export const DEFAULT_STAR_ACTIVITY_STATE: StarActivityState = {
  repos: [],
  mode: "date",
  scale: "lin",
  legend: "tr",
};

/**
 * Parse the canonical query schema. Tolerant — bad values fall back to
 * defaults rather than throwing, because callers receiving these from
 * untrusted URLs should never crash a page render.
 */
export function decodeStarActivityUrl(
  searchParams: URLSearchParams,
): StarActivityState {
  const reposRaw = searchParams.get("repos") ?? "";
  const repos = reposRaw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => FULL_NAME_RE.test(s))
    .slice(0, MAX_REPOS);

  const mode: StarActivityMode =
    searchParams.get("mode") === "timeline" ? "timeline" : "date";
  const scale: StarActivityScale =
    searchParams.get("scale") === "log" ? "log" : "lin";

  const legendRaw = searchParams.get("legend");
  const legend: LegendCorner =
    legendRaw && VALID_LEGEND.has(legendRaw as LegendCorner)
      ? (legendRaw as LegendCorner)
      : "tr";

  const v = searchParams.get("v") ?? undefined;

  return { repos, mode, scale, legend, v };
}

function emit(state: StarActivityState): URLSearchParams {
  const params = new URLSearchParams();
  if (state.repos.length > 0) params.set("repos", state.repos.join(","));
  if (state.mode !== "date") params.set("mode", state.mode);
  if (state.scale !== "lin") params.set("scale", state.scale);
  if (state.legend !== "tr") params.set("legend", state.legend);
  if (state.v) params.set("v", state.v);
  return params;
}

/** Build a relative URL with state encoded onto a base path. */
export function encodeStarActivityUrl(
  state: StarActivityState,
  basePath: string = "/compare",
): string {
  const params = emit(state);
  const qs = params.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

/** Build the full /api/og/star-activity URL (relative — caller decides absolute). */
export function buildShareImageUrl(
  state: StarActivityImageState,
  opts: { format?: "png" | "svg"; download?: boolean } = {},
): string {
  const params = emit(state);
  if (state.aspect && state.aspect !== "h") params.set("aspect", state.aspect);
  if (opts.format && opts.format !== "png") params.set("format", opts.format);
  if (opts.download) params.set("download", "1");
  return `/api/og/star-activity?${params.toString()}`;
}

/**
 * Build the absolute share-card URL — the value used as og:image / twitter:image.
 * X requires absolute URLs for image meta tags.
 */
export function buildAbsoluteShareImageUrl(
  state: StarActivityImageState,
  opts: { format?: "png" | "svg" } = {},
): string {
  return absoluteUrl(buildShareImageUrl(state, opts));
}

/**
 * Build the X (Twitter) web-intent URL. Pre-fills the tweet body with the
 * via-handle attribution so quote-tweets carry our wordmark too.
 */
export function buildXIntentUrl(
  state: StarActivityState,
  pageUrl: string,
): string {
  const reposLabel = state.repos.join(" vs ");
  const text = state.repos.length > 1
    ? `Star activity of ${reposLabel} — via @TrendingRepo`
    : `Star activity of ${reposLabel} — via @TrendingRepo`;
  const params = new URLSearchParams({
    text,
    url: pageUrl,
    via: "TrendingRepo",
  });
  return `https://twitter.com/intent/tweet?${params.toString()}`;
}

/**
 * Render an in-memory CSV for the supplied per-repo points. Returned as a
 * string; the caller decides whether to push to clipboard or trigger a
 * download.
 */
export interface CsvSeries {
  repoId: string;
  points: Array<{ d: string; s: number }>;
}

export function buildCsv(seriesList: CsvSeries[]): string {
  if (seriesList.length === 0) return "date,stars\n";
  if (seriesList.length === 1) {
    const lines = ["date,stars"];
    for (const p of seriesList[0].points) {
      lines.push(`${p.d},${p.s}`);
    }
    return lines.join("\n") + "\n";
  }
  // Multi-repo: union of dates × per-repo column.
  const allDates = new Set<string>();
  for (const s of seriesList) {
    for (const p of s.points) allDates.add(p.d);
  }
  const sorted = Array.from(allDates).sort();
  const header = ["date", ...seriesList.map((s) => s.repoId)].join(",");
  const lines = [header];
  for (const d of sorted) {
    const row = [d];
    for (const s of seriesList) {
      const pt = s.points.find((p) => p.d === d);
      row.push(pt ? String(pt.s) : "");
    }
    lines.push(row.join(","));
  }
  return lines.join("\n") + "\n";
}
