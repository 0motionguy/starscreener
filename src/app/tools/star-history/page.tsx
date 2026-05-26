// /tools/star-history — single-repo star-history visualization.
//
// 2026-05-24 rebuild — operator decree: "search box, lifetime button, less
// fuss". Stripped the previous 1500-line surface (right-rail SharePanel,
// 10-row swap picker, starter-pack chip row, theme/metric/mode switchers,
// bottom KPI mini-cards) down to the actual job:
//
//   1. Paste owner/name or a github.com URL → see the curve.
//   2. Pick a window up to LIFETIME (true cumulative, no slicing).
//   3. Grab the chart as a PNG / share link / tweet.
//
// Native <form method="get"> with <datalist> for repo suggestions — no
// client JS, zero hydration cost, works with keyboard out of the box.
// Submission preserves window + scale via hidden inputs.
//
// URL state: ?repo=<owner/name>&window=<id>&scale=<id>

import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { Icon } from "@/components/icon/Icon";
import { ShareBar } from "@/components/share/ShareBar";
import { FreshnessPill } from "@/components/shell/FreshnessPill";
import { SketchArt } from "@/components/star-history/SketchArt";
import { StarChart } from "@/components/star-history/StarChart";
import { ThemeLab } from "@/components/star-history/ThemeLab";
import {
  buildChartGeometry as buildSharedChartGeometry,
  type ChartGeometry as SharedChartGeometry,
  PAD as SHARED_PAD,
  VB_H as SHARED_VB_H,
  VB_W as SHARED_VB_W,
} from "@/components/star-history/geometry";
import {
  GALLERY_THEMES,
  PUBLIC_THEME_META,
  type GalleryThemeName,
  type PublicThemeName,
} from "@/lib/charts/public-themes";
import { getDerivedRepos, getDerivedRepoByFullName } from "@/lib/derived-repos";
import { classifyFreshness } from "@/lib/news/freshness";
import {
  filterPayloadByWindow,
  getStarActivity,
  refreshStarActivityFromStore,
  type StarActivityPayload,
  type StarActivityScale,
  type StarActivityWindow,
} from "@/lib/star-activity";
import { getLastFetchedAt, refreshTrendingFromStore } from "@/lib/trending";
import type { Repo } from "@/lib/types";
import { absoluteUrl } from "@/lib/seo";

export const revalidate = 300;

// Dynamic per-URL metadata so a paste-link to X / Slack / Discord pulls the
// SPECIFIC chart the user is sharing, not the generic tools card. The OG
// image URL embeds the same repo / window / scale / cmp params the page
// reads, so the preview card looks identical to the live view.
export async function generateMetadata({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  const params = (await searchParams) ?? {};
  const repoRaw = Array.isArray(params.repo) ? params.repo[0] : params.repo;
  const repo = typeof repoRaw === "string" && /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/.test(repoRaw.trim())
    ? repoRaw.trim()
    : null;

  const cmpRaw = Array.isArray(params.cmp) ? params.cmp[0] : params.cmp;
  const cmpList = typeof cmpRaw === "string" ? cmpRaw : "";

  const windowRaw = Array.isArray(params.window) ? params.window[0] : params.window;
  const windowVal = typeof windowRaw === "string" ? windowRaw : "";

  const scaleRaw = Array.isArray(params.scale) ? params.scale[0] : params.scale;
  const scaleVal = typeof scaleRaw === "string" ? scaleRaw : "";

  const themeRaw = Array.isArray(params.theme) ? params.theme[0] : params.theme;
  const themeVal = typeof themeRaw === "string" ? themeRaw : "";

  // Build the OG image URL with all the params that affect the chart shape.
  // Absolute URL is mandatory for X / Slack / Discord crawlers — relative
  // paths are silently dropped.
  const ogQuery = new URLSearchParams();
  if (repo) ogQuery.set("repo", repo);
  if (cmpList) ogQuery.set("cmp", cmpList);
  if (windowVal) ogQuery.set("window", windowVal);
  if (scaleVal) ogQuery.set("scale", scaleVal);
  if (themeVal) ogQuery.set("theme", themeVal);
  const ogPath = `/api/og/star-history${ogQuery.toString() ? `?${ogQuery.toString()}` : ""}`;
  const ogUrl = absoluteUrl(ogPath);

  const title = repo
    ? `${repo} — star history · TrendingRepo`
    : "Star History — TrendingRepo";
  const description = repo
    ? `Cumulative GitHub star history for ${repo}${cmpList ? ` vs ${cmpList.split(",").slice(0, 3).join(", ")}` : ""} on TrendingRepo.`
    : "Cumulative GitHub star history for any tracked repo. Paste owner/name or a github.com URL, pick a window up to lifetime, grab the chart.";

  const imageAlt = repo
    ? `${repo} star history chart`
    : "TrendingRepo star history";

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: [{ url: ogUrl, width: 1200, height: 630, alt: imageAlt }],
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [{ url: ogUrl, alt: imageAlt }],
      creator: "@TrendingRepo",
      site: "@TrendingRepo",
    },
  };
}

// ---------------------------------------------------------------------------
// URL state contract
// ---------------------------------------------------------------------------

const WINDOW_OPTIONS = [
  { id: "7d",  label: "7D",       eyebrow: "7-day window" },
  { id: "30d", label: "30D",      eyebrow: "30-day window" },
  { id: "90d", label: "90D",      eyebrow: "90-day window" },
  { id: "6m",  label: "6M",       eyebrow: "6-month window" },
  { id: "1y",  label: "1Y",       eyebrow: "12-month window" },
  { id: "all", label: "LIFETIME", eyebrow: "lifetime" },
] as const satisfies ReadonlyArray<{
  id: StarActivityWindow;
  label: string;
  eyebrow: string;
}>;
const DEFAULT_WINDOW = WINDOW_OPTIONS[1]; // 30d

const SCALE_OPTIONS = [
  { id: "lin", label: "LIN" },
  { id: "log", label: "LOG" },
] as const satisfies ReadonlyArray<{ id: StarActivityScale; label: string }>;
const DEFAULT_SCALE = SCALE_OPTIONS[0];

// Chart THEMES (not chart kinds). One canonical chart kind underneath:
// smooth cumulative-stars area chart. The visual variety comes from:
//   - 12 registered ECharts themes in src/lib/charts/public-themes.ts —
//     `aurora` (brand default) + 5 new curated themes (parchment, newsprint,
//     phosphor, blueprint, riso) + 6 vendored Apache-2.0 themes.
//   - `sketch` — xkcd-style hand-drawn via SketchArt (custom SVG with
//     turbulence-displaced rough stroke; not an ECharts theme).
//   - `poster` — solid-orange share-card composition (custom SVG).

type ChartTheme = PublicThemeName | "sketch" | "poster";

const THEME_OPTIONS: ReadonlyArray<{ id: ChartTheme; label: string; swatch: string }> = [
  ...PUBLIC_THEME_META.map((t) => ({ id: t.id, label: t.label, swatch: t.swatch })),
  { id: "sketch" as const, label: "SKETCH", swatch: "linear-gradient(135deg,#FCFBF7 60%,#EA4A1F 60%)" },
  { id: "poster" as const, label: "POSTER", swatch: "#ff6b35" },
];
const DEFAULT_THEME = THEME_OPTIONS[0];

const MAX_COMPARE = 3;

// ---------------------------------------------------------------------------
// SVG chart geometry — shared with SketchArt / PosterArt via the canonical
// helper in @/components/star-history/geometry. We re-alias here so the
// existing local references inside this file keep compiling.
// ---------------------------------------------------------------------------

const VB_W = SHARED_VB_W;
const VB_H = SHARED_VB_H;
const PAD = SHARED_PAD;

type ChartGeometry = SharedChartGeometry;

interface ResolvedRepo {
  fullName: string;
  raw: string | null;
  resolved: Repo | null;
  invalid: boolean;
}

interface Props {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

// ---------------------------------------------------------------------------
// Param resolution — accepts pasted github.com URLs as well as owner/name
// ---------------------------------------------------------------------------

const GITHUB_URL_RE = /^(?:https?:\/\/)?(?:www\.)?github\.com\/([^/\s?#]+)\/([^/\s?#]+)/i;

function parseRepoParam(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  const m = trimmed.match(GITHUB_URL_RE);
  if (m) {
    const owner = m[1];
    const name = m[2].replace(/\.git$/i, "");
    return `${owner}/${name}`;
  }
  return trimmed;
}

type WindowOption = (typeof WINDOW_OPTIONS)[number];
type ScaleOption = (typeof SCALE_OPTIONS)[number];

function resolveWindow(raw: string | string[] | undefined): WindowOption {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return WINDOW_OPTIONS.find((w) => w.id === v) ?? DEFAULT_WINDOW;
}
function resolveScale(raw: string | string[] | undefined): ScaleOption {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return SCALE_OPTIONS.find((s) => s.id === v) ?? DEFAULT_SCALE;
}

function resolveTheme(raw: string | string[] | undefined): ChartTheme {
  const v = Array.isArray(raw) ? raw[0] : raw;
  const match = THEME_OPTIONS.find((t) => t.id === v);
  return (match?.id ?? DEFAULT_THEME.id) as ChartTheme;
}

/**
 * Parse `?cmp=` (comma-separated owner/name list) AND the optional `?_addCmp`
 * append-slot value into a deduped, capped list of compare repos. The
 * `_addCmp` channel exists so empty compare slots can be plain server-side
 * `<form>`s that mutate the URL on submit — no client JS needed. Github URLs
 * paste-resolve the same way as the main `?repo=`. Main repo is excluded so
 * a repo never compares against itself.
 */
function parseCompareParam(
  cmpRaw: string | string[] | undefined,
  addRaw: string | string[] | undefined,
  excludeMain: string,
): string[] {
  const cmpRawValue = Array.isArray(cmpRaw) ? cmpRaw[0] : cmpRaw;
  const list: string[] = [];
  if (typeof cmpRawValue === "string") {
    for (const part of cmpRawValue.split(",")) {
      const parsed = parseRepoParam(part);
      if (parsed) list.push(parsed);
    }
  }
  const addValue = parseRepoParam(addRaw);
  if (addValue) list.push(addValue);
  const excludeLower = excludeMain.toLowerCase();
  const seen = new Set<string>();
  const out: string[] = [];
  for (const name of list) {
    const key = name.toLowerCase();
    if (key === excludeLower) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
    if (out.length >= MAX_COMPARE) break;
  }
  return out;
}

function pickTopMovers(repos: Repo[], limit: number): Repo[] {
  // Dedupe by lowercased fullName before sorting — `getDerivedRepos()` can
  // emit the same repo twice when multiple upstream signal sources surface
  // it. Without this, the React datalist keys collide (DEV warning) and
  // suggestions appear duplicated.
  const seen = new Set<string>();
  const unique: Repo[] = [];
  for (const r of repos) {
    if (!r.fullName || !r.fullName.includes("/")) continue;
    const key = r.fullName.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(r);
  }
  return unique
    .sort((a, b) => (b.starsDelta7d ?? 0) - (a.starsDelta7d ?? 0))
    .slice(0, limit);
}

function resolveRepo(raw: string | null, all: Repo[]): ResolvedRepo {
  if (!raw) {
    // Default landing: pick the top mover. The CALLER then walks down the
    // top-mover list to find one with an existing star-activity payload —
    // see `pickDefaultRepoWithData()` in the page handler. We still seed with
    // the #1 mover here so /tools/star-history?repo=… deep-links work even
    // when none of the top movers have backfilled history yet.
    const fallback = pickTopMovers(all, 1)[0] ?? null;
    return {
      fullName: fallback?.fullName ?? "",
      raw: null,
      resolved: fallback,
      invalid: false,
    };
  }
  const direct = getDerivedRepoByFullName(raw);
  if (direct) {
    return { fullName: direct.fullName, raw, resolved: direct, invalid: false };
  }
  const lower = raw.toLowerCase();
  const ci = all.find((r) => r.fullName.toLowerCase() === lower) ?? null;
  if (ci) {
    return { fullName: ci.fullName, raw, resolved: ci, invalid: false };
  }
  const fallback = pickTopMovers(all, 1)[0] ?? null;
  return {
    fullName: fallback?.fullName ?? raw,
    raw,
    resolved: fallback,
    invalid: true,
  };
}

/**
 * When the user lands without `?repo=`, walk the top 20 movers in parallel
 * and pick the first one whose star-activity payload is already backfilled
 * in Redis. Without this the default landing renders the empty "backfill
 * queued" state for ~80% of trending repos (the daily appender + manual
 * `workflow_dispatch` backfills haven't covered the long tail of fresh
 * entrants). Bounded at 20 to keep the parallel fan-out cheap.
 */
async function pickDefaultRepoWithData(all: Repo[]): Promise<Repo | null> {
  const candidates = pickTopMovers(all, 20);
  if (candidates.length === 0) return null;
  await Promise.all(
    candidates.map((r) => refreshStarActivityFromStore(r.fullName).catch(() => undefined)),
  );
  for (const r of candidates) {
    const payload = getStarActivity(r.fullName);
    if (payload && payload.points.length > 0) return r;
  }
  return candidates[0] ?? null;
}

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

function formatStars(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${Math.round(n / 1_000)}K`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return Math.round(n).toLocaleString();
}

function shortDayLabel(iso: string): string {
  const ts = Date.parse(`${iso}T00:00:00Z`);
  if (!Number.isFinite(ts)) return iso.slice(5);
  const d = new Date(ts);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

// ---------------------------------------------------------------------------
// Chart math — cumulative stars only. Delegates to the shared helper in
// @/components/star-history/geometry so SketchArt + PosterArt + the page
// all paint into the same coordinate frame.
// ---------------------------------------------------------------------------

const buildChartGeometry = buildSharedChartGeometry;

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function StarHistoryPage({ searchParams }: Props) {
  const params = (await searchParams) ?? {};
  const rawRepo = parseRepoParam(params.repo);
  const activeWindow = resolveWindow(params.window);
  const activeScale = resolveScale(params.scale);
  const activeTheme = resolveTheme(params.theme);

  await refreshTrendingFromStore();
  const allRepos = getDerivedRepos();
  let target = resolveRepo(rawRepo, allRepos);

  // When the user lands without ?repo=, pick a top mover that ALREADY has a
  // backfilled payload so the page never opens to an empty "backfill queued"
  // shell. The walk is bounded at 20 candidates and reads Redis in parallel.
  if (!rawRepo) {
    const withData = await pickDefaultRepoWithData(allRepos);
    if (withData) {
      target = {
        fullName: withData.fullName,
        raw: null,
        resolved: withData,
        invalid: false,
      };
    }
  } else if (target.fullName) {
    await refreshStarActivityFromStore(target.fullName);
  }
  const rawPayload = target.fullName ? getStarActivity(target.fullName) : null;
  const payload = rawPayload
    ? filterPayloadByWindow(rawPayload, activeWindow.id)
    : null;

  const geom = buildChartGeometry(payload, activeScale.id);

  // Compare repos — server-rendered. parseCompareParam merges ?cmp= and
  // ?_addCmp so empty slots can be pure <form> submits.
  const compareNames = parseCompareParam(params.cmp, params._addCmp, target.fullName);
  await Promise.all(
    compareNames.map((n) => refreshStarActivityFromStore(n).catch(() => undefined)),
  );
  const compareSlots = compareNames.map((name) => {
    const repo =
      getDerivedRepoByFullName(name) ??
      allRepos.find((r) => r.fullName.toLowerCase() === name.toLowerCase()) ??
      null;
    const rawCmpPayload = getStarActivity(name);
    const cmpPayload = rawCmpPayload
      ? filterPayloadByWindow(rawCmpPayload, activeWindow.id)
      : null;
    return {
      name,
      repo,
      payload: cmpPayload,
      geom: buildChartGeometry(cmpPayload, activeScale.id),
    };
  });

  // Series array for the main multi-line chart: primary repo first, then
  // every compare repo that already has a backfilled payload. Missing-payload
  // repos still show as chips in the picker (with "queued" label) but don't
  // pollute the chart with empty series.
  const chartSeries: Array<{ name: string; payload: StarActivityPayload }> = [];
  if (payload) chartSeries.push({ name: target.fullName, payload });
  for (const s of compareSlots) {
    if (s.payload) chartSeries.push({ name: s.name, payload: s.payload });
  }

  const liveStars = geom?.current ?? target.resolved?.stars ?? 0;
  const peakStars = geom?.peak?.stars ?? target.resolved?.stars ?? 0;
  const peakDate = geom?.peak?.date ?? null;

  const lastUpdatedAt = rawPayload?.updatedAt ?? getLastFetchedAt() ?? null;
  const fresh = classifyFreshness("repos", lastUpdatedAt);

  // Datalist suggestions — top 30 by 7d delta gives the user a productive
  // jumping-off point without flooding the autocomplete dropdown.
  const suggestions = pickTopMovers(allRepos, 30);

  function buildHref(overrides: Partial<{
    repo: string | null;
    window: StarActivityWindow;
    scale: StarActivityScale;
    theme: ChartTheme;
    cmp: string[];
  }>): string {
    const q = new URLSearchParams();
    const repo = overrides.repo !== undefined ? overrides.repo : target.fullName || null;
    if (repo) q.set("repo", repo);
    const w = overrides.window ?? activeWindow.id;
    const s = overrides.scale ?? activeScale.id;
    const t = overrides.theme ?? activeTheme;
    if (w !== DEFAULT_WINDOW.id) q.set("window", w);
    if (s !== DEFAULT_SCALE.id) q.set("scale", s);
    if (t !== DEFAULT_THEME.id) q.set("theme", t);
    const nextCmp = overrides.cmp ?? compareNames;
    if (nextCmp.length > 0) q.set("cmp", nextCmp.join(","));
    const qs = q.toString();
    return qs ? `/tools/star-history?${qs}` : "/tools/star-history";
  }

  const hasData = geom !== null;

  return (
    <div
      className="star-history-tool main-inner"
      style={{ padding: "16px 22px 32px", maxWidth: 1280, margin: "0 auto" }}
    >
      <Hero
        target={target}
        liveStars={liveStars}
        peakStars={peakStars}
        peakDate={peakDate}
        windowDeltaPct={geom?.windowDeltaPct ?? 0}
        fresh={fresh}
        lastUpdatedAt={lastUpdatedAt}
        activeWindow={activeWindow}
      />

      <RepoSearchBox
        currentRepo={target.fullName}
        activeWindow={activeWindow.id}
        activeScale={activeScale.id}
        suggestions={suggestions}
      />

      {/* Series bar — main repo + up to MAX_COMPARE compare repos, all
       * rendered as colored chips ABOVE the chart so the picker sits next
       * to its output instead of beneath it. Operator request 2026-05-25:
       * "ADD repo up so you max 4 in total so you see multiple line charts
       * on 1 PReivew". */}
      <SeriesBar
        mainRepo={target.fullName}
        compareNames={compareNames}
        compareSlots={compareSlots}
        activeWindow={activeWindow.id}
        activeScale={activeScale.id}
        activeTheme={activeTheme}
        buildHref={buildHref}
      />

      <div className="sh-controls" role="toolbar" aria-label="Chart controls">
        <div className="seg-chip-row" role="group" aria-label="Time window">
          {WINDOW_OPTIONS.map((opt) => {
            const isOn = opt.id === activeWindow.id;
            const isLifetime = opt.id === "all";
            return (
              <Link
                key={opt.id}
                href={buildHref({ window: opt.id })}
                className={`seg-chip${isOn ? " on" : ""}${isLifetime ? " sh-lifetime" : ""}`}
                aria-current={isOn ? "true" : undefined}
                prefetch={false}
              >
                {isLifetime ? <span aria-hidden="true">★</span> : null}
                <span>{opt.label}</span>
              </Link>
            );
          })}
        </div>

        {/* Theme chip row removed 2026-05-25 — the theme lab below the chart
         * is the canonical theme picker (clickable tile previews are a
         * better UX than 14 small chips). Keep window + scale chips only. */}

        <div className="grow" />

        <div className="seg-chip-row" role="group" aria-label="Y-axis scale">
          {SCALE_OPTIONS.map((opt) => {
            const isOn = opt.id === activeScale.id;
            return (
              <Link
                key={opt.id}
                href={buildHref({ scale: opt.id })}
                className={`seg-chip${isOn ? " on" : ""}`}
                aria-current={isOn ? "true" : undefined}
                prefetch={false}
              >
                {opt.label}
              </Link>
            );
          })}
        </div>
      </div>

      <section className={`sh-chart-shell sh-art sh-art-${activeTheme}`} data-theme={activeTheme}>
        <div className="sh-chart-head">
          <span className="slash">{"// star activity"}</span>
          <span className="title">
            {chartSeries.length > 1
              ? `${chartSeries.length} repos`
              : target.fullName}
          </span>
          <span className="meta">
            {geom ? (
              <>
                <b>{geom.current?.toLocaleString() ?? "0"}</b> stars total
                {geom.windowDelta !== 0 ? (
                  <>
                    {" · "}
                    <b style={{ color: geom.windowDelta > 0 ? "var(--up)" : "var(--down)" }}>
                      {geom.windowDelta > 0 ? "+" : ""}
                      {geom.windowDelta.toLocaleString()}
                    </b>{" "}
                    over {activeWindow.eyebrow}
                  </>
                ) : (
                  <> · {activeWindow.eyebrow}</>
                )}
              </>
            ) : (
              <>history backfilling · check back shortly</>
            )}
          </span>
        </div>
        <div className="sh-chart-body">
          {hasData && geom && payload ? (
            <ChartArtwork
              geom={geom}
              windowedPayload={payload}
              series={chartSeries}
              theme={activeTheme}
              repoFullName={target.fullName}
              scale={activeScale.id}
            />
          ) : (
            <OnboardingState
              fullName={target.fullName}
              invalid={target.invalid}
              rawRequest={target.raw}
            />
          )}
        </div>
      </section>

      {target.fullName ? (
        <section className="sh-share-mega" aria-label="Share">
          <div className="sh-share-mega-head">
            <span className="sh-share-mega-eyebrow">{"// grab the chart"}</span>
            <span className="sh-share-mega-hint">
              PNG · SVG · CSV · link · post on X · embed
            </span>
          </div>
          <ShareBar
            shareText={`Star history for ${target.fullName}${compareNames.length > 0 ? ` vs ${compareNames.join(", ")}` : ""} — ${activeWindow.label.toLowerCase()} on TrendingRepo.`}
            hashtags={["github", "opensource"]}
            pagePath={buildHref({})}
            imageEndpoint="/api/og/star-history"
            variant="mega"
            state={{
              repos: [target.fullName, ...compareNames],
              mode: "date",
              scale: activeScale.id,
              legend: "tr",
            }}
            csvSeries={
              payload?.points
                ? [{ repoId: target.fullName, points: payload.points.map((p) => ({ d: p.d, s: p.s })) }]
                : undefined
            }
          />
        </section>
      ) : null}

      {hasData && geom && payload ? (
        <ThemeLab
          geom={geom}
          windowedPayload={payload}
          scale={activeScale.id}
          repoFullName={target.fullName}
          activeTheme={activeTheme}
          themeHrefs={Object.fromEntries(
            GALLERY_THEMES.map((t) => [t.id, buildHref({ theme: t.id as ChartTheme })]),
          ) as Partial<Record<GalleryThemeName, string>>}
        />
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hero — title + KPI tiles + freshness pill
// ---------------------------------------------------------------------------

interface HeroProps {
  target: ResolvedRepo;
  liveStars: number;
  peakStars: number;
  peakDate: string | null;
  windowDeltaPct: number;
  fresh: { status: "live" | "warn" | "cold"; ageLabel: string };
  lastUpdatedAt: string | null;
  activeWindow: WindowOption;
}

function Hero({
  target,
  liveStars,
  peakStars,
  peakDate,
  windowDeltaPct,
  fresh,
  lastUpdatedAt,
  activeWindow,
}: HeroProps) {
  const trendChip = windowDeltaPct >= 0 ? "up" : "dn";
  const trendSign = windowDeltaPct >= 0 ? "+" : "";
  const { fullName, resolved: repo, invalid, raw: rawRequest } = target;

  return (
    <section className="sh-hero">
      <div className="sh-hero-left">
        <div
          className="page-eyebrow"
          style={{ display: "inline-flex", alignItems: "center", gap: 10 }}
        >
          <FreshnessPill source="repos" fetchedAt={lastUpdatedAt} />
          <span aria-hidden="true">·</span>
          <span>star history</span>
          <span aria-hidden="true">·</span>
          <span>{activeWindow.eyebrow}</span>
        </div>

        <h1
          className="page-title"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginTop: 4,
            fontFamily: "var(--font-display)",
            fontWeight: 600,
            letterSpacing: "-0.025em",
            fontSize: "clamp(22px, 2.4vw, 32px)",
          }}
        >
          <RepoAvatar repo={repo} size={32} />
          <span>{fullName || "Star history"}</span>
        </h1>
        <p className="page-sub" style={{ maxWidth: "62ch" }}>
          {repo?.description ||
            "Daily cumulative GitHub stars for any tracked repo. One bucket per UTC day, dual-ended for repos above the stargazer API cap."}
        </p>

        {invalid && rawRequest ? (
          <div
            role="status"
            style={{
              marginTop: 10,
              padding: "8px 12px",
              background: "var(--warning-soft)",
              border: "1px solid rgba(255,181,71,0.30)",
              borderRadius: "var(--r-xs)",
              color: "var(--fg)",
              fontSize: 12,
              fontFamily: "var(--font-mono)",
            }}
          >
            <b style={{ color: "var(--warning)", fontWeight: 600 }}>Repo not found</b>
            {" — "}
            &ldquo;{rawRequest}&rdquo; isn&rsquo;t in the tracked set yet. Showing top mover by 7d delta instead.
          </div>
        ) : null}
      </div>

      <div className="sh-hero-right">
        <div className="kpi" style={{ borderRadius: "var(--r-md)", border: "1px solid var(--border-subtle)" }}>
          <div className="kpi-label">Live stars</div>
          <div className="kpi-value">{formatStars(liveStars)}</div>
          <div
            style={{
              marginTop: 4,
              fontSize: 9.5,
              color: "var(--fg-faint)",
              fontFamily: "var(--font-mono)",
              letterSpacing: "var(--t-control)",
              textTransform: "uppercase",
            }}
          >
            scanned {fresh.ageLabel}
          </div>
        </div>

        <div className="kpi" style={{ borderRadius: "var(--r-md)", border: "1px solid var(--border-subtle)" }}>
          <div className="kpi-label">{activeWindow.label} peak</div>
          <div className="kpi-value">{formatStars(peakStars)}</div>
          {peakDate ? (
            <div
              style={{
                marginTop: 4,
                fontSize: 9.5,
                color: "var(--fg-faint)",
                fontFamily: "var(--font-mono)",
                letterSpacing: "var(--t-control)",
                textTransform: "uppercase",
              }}
            >
              {shortDayLabel(peakDate)}
            </div>
          ) : null}
        </div>

        <div className="kpi" style={{ borderRadius: "var(--r-md)", border: "1px solid var(--border-subtle)" }}>
          <div className="kpi-label">{activeWindow.label} shift</div>
          <div
            className="kpi-value"
            style={{ color: trendChip === "up" ? "var(--up)" : "var(--down)" }}
          >
            {trendSign}
            {windowDeltaPct.toFixed(1)}%
          </div>
          <div
            style={{
              marginTop: 4,
              fontSize: 9.5,
              color: "var(--fg-faint)",
              fontFamily: "var(--font-mono)",
              letterSpacing: "var(--t-control)",
              textTransform: "uppercase",
            }}
          >
            stars delta
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Repo search box — native form, datalist, zero hydration
// ---------------------------------------------------------------------------

interface RepoSearchBoxProps {
  currentRepo: string;
  activeWindow: StarActivityWindow;
  activeScale: StarActivityScale;
  suggestions: Repo[];
}

function RepoSearchBox({
  currentRepo,
  activeWindow,
  activeScale,
  suggestions,
}: RepoSearchBoxProps) {
  return (
    <form
      action="/tools/star-history"
      method="get"
      role="search"
      aria-label="Pick a repo"
      className="sh-search"
    >
      <span className="sh-search-icon" aria-hidden="true">
        <Icon name="search" size="sm" />
      </span>
      <input
        type="search"
        name="repo"
        list="sh-repo-suggest"
        defaultValue={currentRepo}
        placeholder="owner/name or github.com URL"
        spellCheck={false}
        autoCapitalize="off"
        autoComplete="off"
        autoCorrect="off"
        className="sh-search-input"
        aria-label="Repo to chart"
      />
      <datalist id="sh-repo-suggest">
        {suggestions.map((r) => (
          <option
            key={r.fullName}
            value={r.fullName}
            label={
              r.starsDelta7d
                ? `+${Math.round(r.starsDelta7d).toLocaleString()} stars · 7d`
                : undefined
            }
          />
        ))}
      </datalist>
      {/* Preserve window + scale across submission so the user's view tuning
          survives the repo swap. */}
      {activeWindow !== DEFAULT_WINDOW.id ? (
        <input type="hidden" name="window" value={activeWindow} />
      ) : null}
      {activeScale !== DEFAULT_SCALE.id ? (
        <input type="hidden" name="scale" value={activeScale} />
      ) : null}
      <button type="submit" className="sh-search-submit">
        Chart
        <span aria-hidden="true">→</span>
      </button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Chart artwork — 12 ECharts-backed themes via <StarChart> + a SVG POSTER
// share-card + an SVG SKETCH (xkcd) renderer. The hand-rolled SVG renderers
// for non-special themes were replaced 2026-05-24 because they looked basic
// and were not shareable; sketch + poster stay custom because ECharts can't
// produce either look natively.
// ---------------------------------------------------------------------------

interface ArtworkProps {
  geom: ChartGeometry;
  windowedPayload: StarActivityPayload;
  /** 1-N repos rendered as separate line series on the main ECharts chart.
   * Sketch + Poster are single-series share-card compositions that only
   * show the primary repo. */
  series: ReadonlyArray<{ name: string; payload: StarActivityPayload }>;
  repoFullName: string;
  scale: StarActivityScale;
  theme: ChartTheme;
}

function ChartArtwork({
  geom,
  series,
  repoFullName,
  scale,
  theme,
}: ArtworkProps) {
  if (theme === "poster") {
    return <PosterArt geom={geom} repoFullName={repoFullName} />;
  }
  if (theme === "sketch") {
    return <SketchArt geom={geom} repoFullName={repoFullName} />;
  }
  // Everything else is the SAME canonical chart kind (smooth cumulative-stars
  // area / line chart) painted by one of the registered ECharts themes. With
  // 2+ series the area fill drops out automatically inside buildOption.
  return (
    <StarChart
      themeName={theme as PublicThemeName}
      series={series}
      scale={scale}
      height={380}
      ariaLabel={`${repoFullName} star history (${theme})`}
    />
  );
}

// ── POSTER ─ solid accent panel, white line, huge typographic peak overlay
function PosterArt({ geom, repoFullName }: { geom: ChartGeometry; repoFullName: string }) {
  const peakStars = formatStars(geom.peak?.stars ?? 0);
  return (
    <svg
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={`${repoFullName} star history (poster)`}
      style={{ display: "block", width: "100%", height: "auto" }}
    >
      <rect x="0" y="0" width={VB_W} height={VB_H} fill="#ff6b35" />
      <rect x="0" y="0" width={VB_W} height={VB_H} fill="url(#sh-grad-poster-grain)" />
      <defs>
        <linearGradient id="sh-grad-poster-grain" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#fff" stopOpacity="0.08" />
          <stop offset="100%" stopColor="#000" stopOpacity="0.15" />
        </linearGradient>
      </defs>
      <text
        x={PAD.left}
        y={PAD.top + 78}
        fontFamily="var(--font-display)"
        fontSize="98"
        fontWeight="700"
        fill="#0a0805"
        letterSpacing="-0.04em"
      >
        {peakStars}
      </text>
      <text
        x={PAD.left}
        y={PAD.top + 18}
        fontFamily="var(--font-mono)"
        fontSize="11"
        fill="#0a0805"
        opacity="0.7"
        letterSpacing="0.18em"
      >
        PEAK STARS
      </text>
      <path d={geom.linePath} fill="none" stroke="#ffffff" strokeWidth={4} strokeLinejoin="round" strokeLinecap="round" />
      {geom.lastDot ? (
        <circle cx={geom.lastDot.x.toFixed(2)} cy={geom.lastDot.y.toFixed(2)} r="7" fill="#ffffff" />
      ) : null}
      <text
        x={PAD.left}
        y={VB_H - 14}
        fontFamily="var(--font-mono)"
        fontSize="11"
        fill="#0a0805"
        opacity="0.7"
        letterSpacing="0.12em"
      >
        {repoFullName.toUpperCase()}
      </text>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Series bar — sits ABOVE the chart. Shows up to 4 colored chips (main repo
// first, then compare repos), each with a × to remove (compare only), plus
// an inline "+" form to add another (hidden when at MAX_COMPARE).
//
// Replaces the prior CompareRow that lived BELOW the chart and rendered
// each compare repo as its own mini-tile. Multi-line is now in the main
// chart, so the bar is purely a series picker.
// ---------------------------------------------------------------------------

// Brand-aligned series palette — index 0 = main, 1..3 = compare. Aligned
// with the aurora theme's palette so the chip color matches the line color
// when on the default theme. Other themes will paint their lines from their
// own palette, but the chips stay these brand colors so the picker stays
// legible on every backdrop.
const SERIES_CHIP_COLORS = [
  "var(--accent, #ff6b35)",
  "var(--cyan, #3ad6c5)",
  "var(--warning, #ffb547)",
  "var(--up, #22c55e)",
];

interface SeriesBarProps {
  mainRepo: string;
  compareNames: string[];
  compareSlots: Array<{
    name: string;
    repo: Repo | null;
    payload: StarActivityPayload | null;
    geom: ChartGeometry | null;
  }>;
  activeWindow: StarActivityWindow;
  activeScale: StarActivityScale;
  activeTheme: ChartTheme;
  buildHref: (overrides: Partial<{
    repo: string | null;
    window: StarActivityWindow;
    scale: StarActivityScale;
    theme: ChartTheme;
    cmp: string[];
  }>) => string;
}

function SeriesBar({
  mainRepo,
  compareNames,
  compareSlots,
  activeWindow,
  activeScale,
  activeTheme,
  buildHref,
}: SeriesBarProps) {
  if (!mainRepo) return null;
  const canAdd = compareSlots.length < MAX_COMPARE;
  const totalSlots = compareSlots.length + 1;
  return (
    <section className="sh-series-bar" aria-label="Repos on the chart">
      <span className="sh-series-bar-label">
        {"// series"}{" "}
        <b>
          {totalSlots}/{MAX_COMPARE + 1}
        </b>
      </span>
      {/* Main repo — no × (changing it requires the search box above). */}
      <span className="sh-series-chip is-main" title={mainRepo}>
        <span className="sh-series-pip" style={{ background: SERIES_CHIP_COLORS[0] }} aria-hidden="true" />
        <span className="sh-series-name">{mainRepo}</span>
        <span className="sh-series-role">MAIN</span>
      </span>
      {compareSlots.map((slot, i) => {
        const removed = compareNames.filter((_, j) => j !== i);
        const color = SERIES_CHIP_COLORS[i + 1] ?? SERIES_CHIP_COLORS[1];
        return (
          <span key={slot.name} className="sh-series-chip" title={slot.name}>
            <span className="sh-series-pip" style={{ background: color }} aria-hidden="true" />
            <span className="sh-series-name">{slot.name}</span>
            {slot.payload ? null : (
              <span className="sh-series-status" title="History backfilling">queued</span>
            )}
            <Link
              href={buildHref({ cmp: removed })}
              className="sh-series-x"
              aria-label={`Remove ${slot.name} from chart`}
              prefetch={false}
            >
              ×
            </Link>
          </span>
        );
      })}
      {canAdd ? (
        <form
          action="/tools/star-history"
          method="get"
          className="sh-series-add"
          aria-label="Add a repo to compare"
        >
          <input type="hidden" name="repo" value={mainRepo} />
          {compareNames.length > 0 ? (
            <input type="hidden" name="cmp" value={compareNames.join(",")} />
          ) : null}
          {activeWindow !== DEFAULT_WINDOW.id ? (
            <input type="hidden" name="window" value={activeWindow} />
          ) : null}
          {activeScale !== DEFAULT_SCALE.id ? (
            <input type="hidden" name="scale" value={activeScale} />
          ) : null}
          {activeTheme !== DEFAULT_THEME.id ? (
            <input type="hidden" name="theme" value={activeTheme} />
          ) : null}
          <span className="sh-series-add-icon" aria-hidden="true">+</span>
          <input
            type="search"
            name="_addCmp"
            list="sh-repo-suggest"
            placeholder="add repo to compare…"
            spellCheck={false}
            autoCapitalize="off"
            autoComplete="off"
            autoCorrect="off"
            className="sh-series-add-input"
            aria-label="Repo to add"
          />
          <button type="submit" className="sh-series-add-submit">
            ADD
          </button>
        </form>
      ) : (
        <span className="sh-series-full">max {MAX_COMPARE + 1} reached</span>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Onboarding state — replaces flat zeros when no payload
// ---------------------------------------------------------------------------

interface OnboardingProps {
  fullName: string;
  invalid: boolean;
  rawRequest: string | null;
}

function OnboardingState({ fullName, invalid, rawRequest }: OnboardingProps) {
  return (
    <div className="sh-onboard">
      <span className="glyph" aria-hidden="true">
        <Icon name="line-chart" size="lg" />
      </span>
      {invalid && rawRequest ? (
        <>
          <h4>Repo not in tracked set yet</h4>
          <p>
            &ldquo;{rawRequest}&rdquo; isn&rsquo;t in the trending pipeline. Pick one
            from the search dropdown above, or paste a github.com URL of a repo we already track.
          </p>
        </>
      ) : (
        <>
          <h4>History not backfilled yet</h4>
          <p>
            {fullName
              ? `${fullName} is a fresh entrant in the trending pipeline. The daily star-history appender bootstraps newcomers on its next 03:17 UTC run, then keeps them current. Search for an established repo above to see a live curve right now.`
              : "Search any repo above to load its cumulative star curve."}
          </p>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Repo avatar — used in hero
// ---------------------------------------------------------------------------

function RepoAvatar({ repo, size }: { repo: Repo | null; size: number }) {
  if (!repo?.ownerAvatarUrl) {
    return (
      <span
        style={{
          width: size,
          height: size,
          display: "inline-grid",
          placeItems: "center",
          background: "var(--surface-3)",
          color: "var(--fg-faint)",
          fontFamily: "var(--font-mono)",
          fontSize: 9,
          fontWeight: 600,
          borderRadius: 2,
        }}
        aria-hidden="true"
      >
        {repo?.owner?.slice(0, 2).toUpperCase() ?? "··"}
      </span>
    );
  }
  return (
    <Image
      src={repo.ownerAvatarUrl}
      alt={`${repo.owner} avatar`}
      width={size}
      height={size}
      unoptimized
      style={{
        borderRadius: 2,
        objectFit: "cover",
        display: "inline-block",
        verticalAlign: "middle",
      }}
    />
  );
}
