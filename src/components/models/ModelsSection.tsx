"use client";

// ModelsSection — the /?cat=models surface. OpenRouter model landscape:
// a headline stat strip + a split panel (LEFT: real weekly token volume by
// lab, the "AI usage by lab" chart; RIGHT: dense top-N free models rail) +
// a ranked table of the full catalogue.
//
// Adoption axis (OpenRouter weekly token totals + usage rank) — complement
// to the Artificial Analysis quality leaderboard on /?cat=llms.
//
// All data arrives as plain props from the server page (loaders at
// src/lib/openrouter.ts + src/lib/openrouter-usage.ts touch fs and can't
// run client-side). This component only renders.

import { useMemo, useState } from "react";

import { AuroraChart, type AuroraSeries } from "@/components/charts/AuroraChart";
import type { OpenrouterRow, OpenrouterStats } from "@/lib/openrouter";
import type { LeaderboardView, UsageChartData } from "@/lib/openrouter-usage";

// Each band is coloured by its AUTHOR — so anthropic models all read as one
// orange family, deepseek as one green family, etc. Within an author we vary
// lightness so siblings stay distinguishable. Mirrors the lab palette on
// --series-1..7 in public/shell.css.
const AUTHOR_HUE: Record<string, string> = {
  anthropic: "#ff6b35",   // orange — lava (accent)
  deepseek: "#22c55e",    // green
  google: "#3ad6c5",      // cyan
  openai: "#a78bfa",      // violet
  tencent: "#f472b6",     // pink
  xiaomi: "#ffb547",      // warning amber
  meta: "#4a86e8",        // azure
  "meta-llama": "#4a86e8",
  mistralai: "#ff8a3d",
  qwen: "#ff4d4d",        // red
  moonshotai: "#16a766",  // green-deep
  minimax: "#9d6bff",     // violet-deep
  "z-ai": "#0fa5e9",      // bright cyan
  "x-ai": "#facc15",      // yellow (was monochrome — too dim on dark)
  openrouter: "#ffd166",  // saffron
  stepfun: "#06b6d4",     // sky-cyan
  arcee: "#ef4444",       // red-bright
  "arcee-ai": "#ef4444",
  baidu: "#3b82f6",       // blue
  nvidia: "#76b900",      // NVIDIA green
  cohere: "#d946ef",      // fuchsia
  microsoft: "#0078d4",   // ms blue
  perplexity: "#1fa2c1",  // teal
  amazon: "#ff9900",      // aws orange
  poolside: "#14b8a6",    // teal-deep
  // Others = the long tail. Muted dark slate (operator decree 2026-05-30:
  // "reduce Others 2-3x smaller visible") — band still renders at its real
  // height so totals are honest, but the dark color visually recedes into
  // the chart background so the named top-20 bands above it dominate.
  others: "#2d3748",      // slate-800 (almost invisible on the dark canvas)
} as const;
const NEUTRAL = "#6b7785";

const TABLE_LIMIT = 100;
const FREE_RAIL_LIMIT = 7;

interface Props {
  rows: OpenrouterRow[];
  stats: OpenrouterStats;
  usage: UsageChartData;
  /** Top-20 latest-week leaderboard rows with WoW deltas + free flag. */
  leaderboard: LeaderboardView[];
  /** ISO from the catalogue payload (openrouter-models slug). */
  fetchedAt: string;
  /** ISO from the usage payload (openrouter-usage slug). */
  usageFetchedAt: string;
}

export function ModelsSection({
  rows,
  stats,
  usage,
  leaderboard,
  fetchedAt,
  usageFetchedAt,
}: Props) {
  const usageSeries: AuroraSeries[] = useMemo(() => {
    // Sibling models from the same author would collide on hue; vary lightness
    // by author-occurrence index so e.g. claude-sonnet/claude-opus read apart.
    const seenPerAuthor = new Map<string, number>();
    return usage.models.map((id) => {
      const m = usage.meta[id];
      const author = (m?.author ?? "others").toLowerCase();
      const base = AUTHOR_HUE[author] ?? NEUTRAL;
      const n = seenPerAuthor.get(author) ?? 0;
      seenPerAuthor.set(author, n + 1);
      return {
        dataKey: id,
        name: m ? `${prettyAuthor(author)} · ${m.label}` : id,
        color: shadeForOccurrence(base, n),
      };
    });
  }, [usage.models, usage.meta]);

  const freeRail = useMemo(() => pickFreeModels(rows), [rows]);
  const totalFree = freeRail.length;
  const visible = rows.slice(0, TABLE_LIMIT);
  const latestWeekTotal = useMemo(() => latestWeekSum(usage), [usage]);

  return (
    <>
      <div className="card models-hero models-hero-compact">
        <div className="models-stats">
          <Stat
            k="Routable models"
            v={stats.totalModels.toLocaleString()}
            sub={`across ${stats.labs} labs`}
          />
          <Stat
            k="Most used · 7d"
            v={stats.mostUsed ? stripAuthor(stats.mostUsed.name, stats.mostUsed.author) : "—"}
            sub={stats.mostUsed ? prettyAuthor(stats.mostUsed.author) : "no ranking"}
          />
          <Stat
            k="New · 90d"
            v={stats.newLast90d.toLocaleString()}
            sub="went live last quarter"
          />
          <Stat
            k="Free models"
            v={stats.freeModels.toLocaleString()}
            sub="$0 in / $0 out"
          />
          <Stat
            k="Max context"
            v={fmtTokens(stats.maxContext)}
            sub="tokens"
          />
          <Stat
            k="Cheapest ≥1M ctx"
            v={
              stats.cheapestBigContext
                ? fmtPrice(stats.cheapestBigContext.priceInPerM)
                : "—"
            }
            sub={stats.cheapestBigContext ? stats.cheapestBigContext.name : "—"}
          />
        </div>

        <div className="models-split">
          {/* LEFT — usage chart */}
          <div className="models-split-chart">
            <div className="models-split-head">
              <div>
                <div className="models-split-title">Top models · weekly usage</div>
                <div className="models-split-sub">
                  Weekly tokens routed through OpenRouter, stacked by model
                  {latestWeekTotal > 0 && (
                    <>
                      {" "}· latest week{" "}
                      <span className="num">{fmtTokens(latestWeekTotal)}</span>
                    </>
                  )}
                </div>
              </div>
              <FreshBadge iso={usageFetchedAt} />
            </div>

            <div className="models-chart-wrap">
              {usage.points.length > 0 ? (
                <div className="models-chart-row">
                  <div className="models-chart-main">
                    <AuroraChart
                      data={usage.points}
                      series={usageSeries}
                      xKey="week"
                      variant="stackedBars"
                      height={320}
                      xFormatter={shortWeek}
                      yFormatter={(n) => fmtTokens(n)}
                      tooltipFormatter={(n) => `${fmtTokens(n)} tokens`}
                      tooltipLabelFormatter={(w) => weekRange(w)}
                      ariaLabel="Weekly stacked usage — each bar is one week, segments are models"
                    />
                  </div>
                  {leaderboard.length > 0 && (
                    <aside
                      className="models-latest"
                      aria-label="LLM leaderboard — this week"
                    >
                      <div className="models-latest-head">
                        <span className="models-latest-week">This week</span>
                        <span className="models-latest-total">
                          Top {leaderboard.length}
                        </span>
                      </div>
                      <ul
                        className="models-latest-list"
                        role="list"
                        aria-label={`Top ${leaderboard.length} models — scroll for the full list`}
                      >
                        {leaderboard.map((r) => (
                          <li
                            key={r.slug}
                            className={`models-lb-row${r.isFree ? " is-free" : ""}`}
                          >
                            <span className="models-lb-rank">{r.rank}</span>
                            <div className="models-lb-text">
                              <div className="models-lb-name" title={r.slug}>
                                <span>{r.label}</span>
                                {r.isFree && (
                                  <span className="models-lb-free">free</span>
                                )}
                              </div>
                              <div className="models-lb-meta">
                                <span className="models-lb-tokens">
                                  {fmtTokens(r.totalTokens)}
                                </span>
                                {r.change !== null && (
                                  <span
                                    className={`models-lb-delta ${
                                      r.change > 0
                                        ? "up"
                                        : r.change < 0
                                          ? "down"
                                          : "flat"
                                    }`}
                                    title={`Week-over-week ${(r.change * 100).toFixed(1)}%`}
                                  >
                                    {r.change > 0 ? "↑" : r.change < 0 ? "↓" : "·"}
                                    {Math.abs(r.change * 100).toFixed(0)}%
                                  </span>
                                )}
                              </div>
                            </div>
                          </li>
                        ))}
                      </ul>
                      {leaderboard.length > 6 && (
                        <div className="models-latest-more">
                          ↕ scroll · {leaderboard.length} total
                        </div>
                      )}
                    </aside>
                  )}
                </div>
              ) : (
                <div className="models-empty">
                  Usage time-series not loaded yet. Add{" "}
                  <code>OPENROUTER_API_KEY</code> to the worker env to enable
                  the official daily dataset.
                </div>
              )}
            </div>
          </div>

          {/* RIGHT — free models rail */}
          <div className="models-split-side">
            <div className="models-split-head">
              <div>
                <div className="models-split-title">Top free models</div>
                <div className="models-split-sub">
                  $0 in / $0 out · ranked by weekly usage ·{" "}
                  <span className="num">{totalFree}</span> total
                </div>
              </div>
            </div>

            <ul className="free-rail" role="list">
              {freeRail.length === 0 ? (
                <li className="free-rail-empty">No free models available.</li>
              ) : (
                freeRail.map((m, i) => (
                  <li key={m.id} className="free-rail-item">
                    <span className={`rank ${i < 3 ? `top top-${i + 1}` : ""}`}>
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <ModelAvatar author={m.author} />
                    <div className="free-rail-text">
                      <span className="free-rail-name">
                        <span className="free-rail-owner">{m.author}/</span>
                        {stripAuthor(m.name, m.author)}
                      </span>
                      <span className="free-rail-meta">
                        {fmtTokens(m.contextLength)} ctx · {fmtModality(m)}
                        {m.usageRank !== null && (
                          <>
                            {" · "}
                            <span className="muted">global #{m.usageRank}</span>
                          </>
                        )}
                      </span>
                    </div>
                  </li>
                ))
              )}
            </ul>
            {totalFree > FREE_RAIL_LIMIT && (
              <p className="models-attr">
                Showing all{" "}
                <span className="num">{totalFree}</span> free models — scroll
                the list to see the rest.
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="card trending-table-card">
        <div className="card-head">
          <h2 className="card-title">
            <b>Live · {rows.length.toLocaleString()} models</b> · ranked by weekly
            usage
          </h2>
          <span className="grow" />
          <FreshBadge iso={fetchedAt} />
        </div>

        <table className="tdata">
          <thead>
            <tr>
              <th className="col-rank">#</th>
              <th>Model</th>
              <th className="num">Context</th>
              <th className="num">$ In · 1M</th>
              <th className="num">$ Out · 1M</th>
              <th>Modality</th>
              <th className="num">Usage</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td colSpan={7} className="table-message">
                  No models available.
                </td>
              </tr>
            ) : (
              visible.map((r, i) => {
                const rankClass =
                  i === 0
                    ? "rank top top-1"
                    : i === 1
                      ? "rank top top-2"
                      : i === 2
                        ? "rank top top-3"
                        : "rank";
                const isFree =
                  r.priceInPerM === 0 && r.priceOutPerM === 0;
                return (
                  <tr
                    key={r.id}
                    className={`stagger-row${isFree ? " model-row-free" : ""}`}
                    style={{ animationDelay: `${Math.min(i * 0.03, 0.25)}s` }}
                  >
                    <td data-label="Rank">
                      <span className={rankClass}>
                        {String(i + 1).padStart(2, "0")}
                      </span>
                    </td>
                    <td data-label="Model">
                      <div className="repo-id">
                        <ModelAvatar author={r.author} />
                        <div className="repo-text">
                          <span className="repo-name">
                            <span className="repo-owner">{r.author}/</span>
                            {stripAuthor(r.name, r.author)}
                          </span>
                          <div className="repo-desc">{fmtCtxBlurb(r)}</div>
                        </div>
                      </div>
                    </td>
                    <td className="num" data-label="Context">
                      <span className="star-value">{fmtTokens(r.contextLength)}</span>
                    </td>
                    <td className="num" data-label="$ In · 1M">
                      <span className={`star-value${isFree ? " price-free" : ""}`}>
                        {fmtPrice(r.priceInPerM)}
                      </span>
                    </td>
                    <td className="num" data-label="$ Out · 1M">
                      <span className={`star-value${isFree ? " price-free" : ""}`}>
                        {fmtPrice(r.priceOutPerM)}
                      </span>
                    </td>
                    <td data-label="Modality">
                      <span className="modality-chip">{fmtModality(r)}</span>
                    </td>
                    <td className="num" data-label="Usage">
                      <span className="star-value">
                        {r.usageRank ? `#${r.usageRank}` : "—"}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>

        <div className="table-foot">
          <div className="muted">
            Showing <span className="num">{visible.length}</span> of{" "}
            <span className="num">{rows.length}</span> · source{" "}
            <a href="https://openrouter.ai/models" target="_blank" rel="noopener">
              openrouter.ai
            </a>
          </div>
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

function pickFreeModels(rows: OpenrouterRow[]): OpenrouterRow[] {
  // Strictly free both ways — anything with a non-zero or unknown price gets
  // dropped. Sort by usage rank (most-used first), unranked tied alphabetic
  // (deterministic per the registry-sort tiebreaker rule).
  return rows
    .filter((r) => r.priceInPerM === 0 && r.priceOutPerM === 0)
    .sort((a, b) => {
      const ar = a.usageRank ?? Number.POSITIVE_INFINITY;
      const br = b.usageRank ?? Number.POSITIVE_INFINITY;
      if (ar !== br) return ar - br;
      return a.id.toLowerCase().localeCompare(b.id.toLowerCase());
    });
}

function latestWeekSum(usage: UsageChartData): number {
  if (usage.points.length === 0) return 0;
  const last = usage.points[usage.points.length - 1]!;
  let total = 0;
  for (const m of usage.models) {
    const v = last[m];
    if (typeof v === "number") total += v;
  }
  return total;
}

// Shade adjustment so sibling models from the same author render distinctly
// without leaving the brand-hue family. n=0 keeps the base; n>0 walks through
// lighter then darker tints alternately.
function shadeForOccurrence(hex: string, n: number): string {
  if (n === 0) return hex;
  const { r, g, b } = parseHex(hex);
  // Symmetric walk: +12% lighter, -12% darker, +24%, -24%, …
  const stepPct = 0.12 * Math.ceil(n / 2);
  const sign = n % 2 === 1 ? 1 : -1;
  const k = 1 + sign * stepPct;
  const cl = (v: number) => Math.max(0, Math.min(255, Math.round(v * k)));
  return `#${[cl(r), cl(g), cl(b)]
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("")}`;
}

function parseHex(hex: string): { r: number; g: number; b: number } {
  const s = hex.startsWith("#") ? hex.slice(1) : hex;
  const v = s.length === 3 ? s.split("").map((c) => c + c).join("") : s;
  return {
    r: parseInt(v.slice(0, 2), 16),
    g: parseInt(v.slice(2, 4), 16),
    b: parseInt(v.slice(4, 6), 16),
  };
}

// Honest freshness chrome — the live (green) pip only shows when the payload
// is genuinely recent; stale data drops the pip and just states the age. Never
// claim "live" when it isn't (see feedback_freshness_chrome_must_be_honest).
function FreshBadge({ iso }: { iso: string }) {
  const ageMs = Date.parse(iso);
  const age = Number.isFinite(ageMs) ? Date.now() - ageMs : Number.POSITIVE_INFINITY;
  const live = age < 12 * 3_600_000; // worker cadence is 6h; 12h = healthy
  return (
    <span className={`fresh${live ? " fresh-live" : ""}`}>
      {live && <span className="pip" aria-hidden="true" />} OpenRouter ·{" "}
      {fmtAge(age)}
    </span>
  );
}

function fmtAge(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const min = Math.round(ms / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const h = Math.round(min / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

function Stat({ k, v, sub }: { k: string; v: string; sub: string }) {
  return (
    <div className="models-stat">
      <span className="models-stat-k">{k}</span>
      <span className="models-stat-v">{v}</span>
      <span className="models-stat-sub">{sub}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Author avatar — official GitHub-org mark, monogram fallback. Keyed by the
// OpenRouter author slug (id prefix), which differs from the AA creatorSlug
// map, so this is a small dedicated lookup for the common OpenRouter labs.
// ---------------------------------------------------------------------------

const AUTHOR_GITHUB_ORG: Record<string, string> = {
  anthropic: "anthropics",
  openai: "openai",
  google: "google-deepmind",
  "google-vertex": "google-deepmind",
  deepseek: "deepseek-ai",
  qwen: "QwenLM",
  "x-ai": "xai-org",
  "meta-llama": "meta-llama",
  meta: "meta-llama",
  mistralai: "mistralai",
  nvidia: "NVIDIA",
  moonshotai: "MoonshotAI",
  tencent: "Tencent",
  minimax: "MiniMax-AI",
  microsoft: "microsoft",
  cohere: "cohere-ai",
  perplexity: "perplexityai",
  nousresearch: "NousResearch",
  amazon: "aws",
  ai21: "AI21Labs",
  baidu: "baidu",
  "z-ai": "zai-org",
  inclusionai: "inclusionAI",
  liquid: "Liquid4All",
  bytedance: "bytedance",
  xiaomi: "XiaomiMiMo",
  stepfun: "stepfun-ai",
  inflection: "inflection-ai",
};

function ModelAvatar({ author }: { author: string }) {
  const org = AUTHOR_GITHUB_ORG[author.toLowerCase()];
  const [errored, setErrored] = useState(false);
  if (org && !errored) {
    return (
      <span className="repo-avatar" aria-label={author}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`https://github.com/${org}.png?size=64`}
          alt={author}
          loading="lazy"
          decoding="async"
          onError={() => setErrored(true)}
        />
      </span>
    );
  }
  const initials = (author.replace(/[^a-z0-9]/gi, "").slice(0, 2) || "??").toUpperCase();
  return (
    <span className="repo-avatar repo-avatar-mono" aria-label={author}>
      <span aria-hidden="true">{initials}</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

function prettyAuthor(slug: string): string {
  const map: Record<string, string> = {
    anthropic: "Anthropic",
    openai: "OpenAI",
    google: "Google",
    deepseek: "DeepSeek",
    qwen: "Qwen",
    "x-ai": "xAI",
    "meta-llama": "Meta",
    meta: "Meta",
    mistralai: "Mistral",
    nvidia: "NVIDIA",
    moonshotai: "Moonshot",
    tencent: "Tencent",
    minimax: "MiniMax",
    microsoft: "Microsoft",
    cohere: "Cohere",
    perplexity: "Perplexity",
    "z-ai": "Z.AI",
    xiaomi: "Xiaomi",
    openrouter: "OpenRouter",
    others: "Other",
    other: "Other",
  };
  if (map[slug]) return map[slug];
  return slug.charAt(0).toUpperCase() + slug.slice(1);
}

function stripAuthor(name: string, author: string): string {
  // Catalogue names are often "Anthropic: Claude Opus 4.7" — drop the lab
  // prefix since the owner pill already shows it.
  const colon = name.indexOf(": ");
  if (colon > 0 && colon < 24) return name.slice(colon + 2);
  const pretty = prettyAuthor(author);
  if (name.toLowerCase().startsWith(pretty.toLowerCase() + " ")) {
    return name.slice(pretty.length + 1);
  }
  return name;
}

function fmtTokens(n: number): string {
  if (!n || n <= 0) return "—";
  if (n >= 1_000_000_000_000) return `${(n / 1_000_000_000_000).toFixed(1).replace(/\.0$/, "")}T`;
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1).replace(/\.0$/, "")}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(Math.round(n));
}

function fmtPrice(v: number | null): string {
  if (v === null || v < 0) return "—";
  if (v === 0) return "Free";
  if (v < 0.1) return `$${v.toFixed(3)}`;
  if (v < 1) return `$${v.toFixed(2)}`;
  if (v < 100) return `$${v.toFixed(2)}`;
  return `$${Math.round(v)}`;
}

function fmtModality(r: OpenrouterRow): string {
  const ins = r.inputModalities;
  if (ins.includes("image") && ins.includes("audio")) return "multimodal";
  if (ins.includes("image")) return "text + image";
  if (ins.includes("audio")) return "text + audio";
  if (r.modality && r.modality !== "text->text") return r.modality.replace("->", " → ");
  return "text";
}

function fmtCtxBlurb(r: OpenrouterRow): string {
  const bits: string[] = [];
  if (r.contextLength > 0) bits.push(`${fmtTokens(r.contextLength)} ctx`);
  if (r.priceInPerM === 0 && r.priceOutPerM === 0) bits.push("free");
  else if (r.priceInPerM !== null && r.priceInPerM >= 0)
    bits.push(`${fmtPrice(r.priceInPerM)}/1M in`);
  return bits.join(" · ") || r.author;
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function shortWeek(raw: string | number): string {
  if (typeof raw !== "string") return String(raw);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!m) return raw;
  const year = m[1]!.slice(2);
  const idx = Math.max(0, Math.min(11, parseInt(m[2]!, 10) - 1));
  return `${MONTHS[idx]} ${parseInt(m[3]!, 10)} '${year}`;
}

function weekRange(raw: string | number): string {
  if (typeof raw !== "string") return String(raw);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!m) return raw;
  const start = new Date(`${raw}T00:00:00Z`);
  const end = new Date(start.getTime() + 6 * 86_400_000);
  const fmt = (d: Date) =>
    `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
  return `Week of ${fmt(start)} → ${fmt(end)}, ${start.getUTCFullYear()}`;
}
