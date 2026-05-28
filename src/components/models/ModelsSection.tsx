"use client";

// ModelsSection — the /?cat=models surface. OpenRouter model landscape:
// a headline stat strip + the "AI model explosion" growth chart (cumulative
// routable models over time, stacked by lab) + a ranked table of the
// catalogue. Adoption axis (OpenRouter weekly-usage rank) — complement to the
// Artificial Analysis quality leaderboard on /?cat=llms.
//
// All data arrives as plain props from the server page (the loader at
// src/lib/openrouter.ts touches fs and can't run client-side). This component
// only renders.

import { useMemo, useState } from "react";

import { AuroraChart, type AuroraSeries } from "@/components/charts/AuroraChart";
import type { GrowthSeries, OpenrouterRow, OpenrouterStats } from "@/lib/openrouter";

// Lab band colours — mirror the --series-1..7 design tokens (public/shell.css
// :root) plus a neutral 8th for the "other" band. Concrete hex because Recharts
// paints SVG gradient stops, which don't reliably resolve CSS custom props.
const LAB_PALETTE = [
  "#ff6b35", // --series-1 / accent
  "#22c55e", // --series-2 / up
  "#3ad6c5", // --series-3 / cyan
  "#ffb547", // --series-4 / warning
  "#ff4d4d", // --series-5 / down
  "#a78bfa", // --series-6 / violet
  "#f472b6", // --series-7 / pink
  "#6b7785", // neutral — "other"
] as const;

const TABLE_LIMIT = 100;

interface Props {
  rows: OpenrouterRow[];
  stats: OpenrouterStats;
  growth: GrowthSeries;
  fetchedAt: string;
}

export function ModelsSection({ rows, stats, growth, fetchedAt }: Props) {
  const series: AuroraSeries[] = useMemo(
    () =>
      growth.authors.map((a, i) => ({
        dataKey: a,
        name: prettyAuthor(a),
        color: LAB_PALETTE[i % LAB_PALETTE.length],
      })),
    [growth.authors],
  );

  const visible = rows.slice(0, TABLE_LIMIT);

  return (
    <>
      <div className="card models-hero">
        <div className="models-hero-head">
          <div className="grow">
            <div className="models-hero-title">The AI model landscape</div>
            <p className="models-hero-sub">
              Every model routable through OpenRouter — pricing, context window
              and the month it went live — joined with live weekly-usage rank.
              The adoption axis, beside the quality leaderboard on the LLMs tab.
            </p>
          </div>
          <FreshBadge iso={fetchedAt} />
        </div>

        <div className="models-stats">
          <Stat
            k="Routable models"
            v={stats.totalModels.toLocaleString()}
            sub={`across ${stats.labs} labs`}
          />
          <Stat
            k="Most used · 7d"
            v={stats.mostUsed ? stats.mostUsed.name : "—"}
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

        <div className="models-chart-wrap">
          <AuroraChart
            data={growth.data}
            series={series}
            xKey="month"
            variant="stacked"
            height={300}
            xFormatter={shortMonth}
            yFormatter={(n) => Math.round(n).toLocaleString()}
            tooltipFormatter={(n) => `${Math.round(n).toLocaleString()} models`}
            tooltipLabelFormatter={(m) => shortMonth(m)}
            ariaLabel="Cumulative routable models over time, by lab"
          />
          <div className="models-legend" aria-hidden="true">
            {series.map((s) => (
              <span key={s.dataKey} className="models-legend-item">
                <span
                  className="models-legend-dot"
                  style={{ background: s.color }}
                />
                {s.name}
              </span>
            ))}
          </div>
          <p className="models-attr">
            Cumulative count of models routable on{" "}
            <a href="https://openrouter.ai/models" target="_blank" rel="noopener">
              openrouter.ai
            </a>
            , by the month each went live. Usage = weekly rank order (OpenRouter
            does not publish per-model token volume).
          </p>
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
                return (
                  <tr
                    key={r.id}
                    className="stagger-row"
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
                      <span className="star-value">{fmtPrice(r.priceInPerM)}</span>
                    </td>
                    <td className="num" data-label="$ Out · 1M">
                      <span className="star-value">{fmtPrice(r.priceOutPerM)}</span>
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
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(n);
}

function fmtPrice(v: number | null): string {
  if (v === null) return "—";
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
  else if (r.priceInPerM !== null) bits.push(`${fmtPrice(r.priceInPerM)}/1M in`);
  return bits.join(" · ") || r.author;
}

function shortMonth(raw: string | number): string {
  if (typeof raw !== "string") return String(raw);
  const m = /^(\d{4})-(\d{2})$/.exec(raw);
  if (!m) return raw;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const idx = Math.max(0, Math.min(11, parseInt(m[2]!, 10) - 1));
  return `${months[idx]} '${m[1]!.slice(2)}`;
}
