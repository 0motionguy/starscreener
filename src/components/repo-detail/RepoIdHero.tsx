// Consolidated top-of-page hero for the repo detail surface.
//
// Replaces the legacy `id-strip` + `repo-verdict` blocks with a single,
// mockup-aligned block:
//
//   1. EYEBROW ROW   REPO · RANK #N · X/6 FIRING · LANG
//   2. HEAD          [avatar] owner / name ↗      [WATCH] [COMPARE] [OPEN ON GITHUB]
//                    description
//                    [language] [topic chips]  ★ stars  ⑂ forks  contribs  · 23h ago
//   3. VERDICT BAND  [rank card] [cross-signal 0.X/6.0 + gauge] [prose] [30D delta]
//   4. CHANNEL CHIPS GitHub · HN · Reddit · Bluesky · Dev.to · X (6-up)
//   5. METRIC STRIP  STARS · FORKS · CONTRIBS · MOMENTUM · SURFACE  (5-up)
//
// All children are pre-existing components or the new ones in this folder.
// The narrative under VERDICT is data-driven — built from `repo.channelStatus`
// + `repo.mentions.perSource` so it stays honest as channels light up or
// quiet down. Tone is descriptive, not promotional.

import type { JSX } from "react";
import Link from "next/link";
import { BrandStar } from "@/components/shared/BrandStar";
import { FreshnessBadge } from "@/components/shared/FreshnessBadge";
import { ChannelChipRow } from "./ChannelChipRow";
import { RepoMetricStrip } from "./RepoMetricStrip";
import { RepoActionRow } from "./RepoActionRow";
import { TrackedExternalLink } from "@/components/analytics/TrackedExternalLink";
import { formatNumber, getRelativeTime } from "@/lib/utils";
import type { Repo } from "@/lib/types";

interface RepoIdHeroProps {
  repo: Repo;
  fetchedAt: string | null;
  surfaceCount: number;
  surfaceTotal: number;
}

interface NarrativePart {
  text: string;
  /** Optional emphasis class for tinted phrasing. */
  tone?: "positive" | "neutral" | "negative" | "muted";
}

const CHANNEL_TOTAL = 6;

function buildNarrative(repo: Repo): NarrativePart[] {
  const ps = repo.mentions?.perSource;
  const status = repo.channelStatus ?? null;
  const sd24 = repo.starsDelta24h ?? 0;
  const channelsFiring = repo.channelsFiring ?? 0;

  const parts: NarrativePart[] = [];

  // Open: a one-word disposition that maps to the firing count.
  if (channelsFiring >= 4) {
    parts.push({ text: "Hot across the board.", tone: "positive" });
  } else if (channelsFiring >= 2) {
    parts.push({ text: "Quietly building.", tone: "positive" });
  } else if (channelsFiring === 1) {
    parts.push({ text: "Single-channel signal so far." });
  } else if (sd24 > 0) {
    parts.push({ text: "Faint heat — early days." });
  } else {
    parts.push({ text: "Quiet across tracked channels." });
  }

  // GitHub momentum line — always lead here when we have a 24h delta.
  if (status?.github && sd24 > 0) {
    parts.push({
      text: ` Strong GitHub momentum (+${formatNumber(sd24)} stars · 24h)`,
      tone: "positive",
    });
  } else if (sd24 > 0) {
    parts.push({
      text: ` GitHub picked up +${formatNumber(sd24)} stars in 24h`,
    });
  }

  // HN, Reddit, Bluesky, dev.to — only call out the channels that are firing.
  const fired: string[] = [];
  if (status?.hn && (ps?.hackernews.count7d ?? 0) > 0) {
    fired.push(
      `a ${(ps?.hackernews.count7d ?? 0) >= 3 ? "loud" : "small but loyal"} HackerNews following (${ps?.hackernews.count7d} mentions / 7d)`,
    );
  }
  if (status?.reddit && (ps?.reddit.count7d ?? 0) > 0) {
    fired.push(`Reddit chatter (${ps?.reddit.count7d} threads / 7d)`);
  }
  if (status?.bluesky && (ps?.bluesky.count7d ?? 0) > 0) {
    fired.push(`Bluesky buzz (${ps?.bluesky.count7d} posts / 7d)`);
  }
  if (status?.devto && (ps?.devto.count7d ?? 0) > 0) {
    fired.push(`dev.to writeups (${ps?.devto.count7d} articles / 7d)`);
  }
  if (status?.twitter && (ps?.twitter.count24h ?? 0) > 0) {
    fired.push(`X posts (${ps?.twitter.count24h} / 24h)`);
  }
  if (fired.length > 0) {
    const joined =
      fired.length === 1
        ? fired[0]
        : `${fired.slice(0, -1).join(", ")} and ${fired[fired.length - 1]}`;
    parts.push({ text: ` and ${joined}.` });
  } else if (parts.length > 1) {
    parts.push({ text: "." });
  }

  // Quiet-channel callout — only when we have anything to compare against.
  if (channelsFiring > 0 && channelsFiring < CHANNEL_TOTAL) {
    const quiet: string[] = [];
    if (status && !status.reddit) quiet.push("Reddit");
    if (status && !status.bluesky) quiet.push("Bluesky");
    if (status && !status.devto) quiet.push("Dev.to");
    if (status && !status.twitter) quiet.push("X");
    if (quiet.length > 0) {
      const list =
        quiet.length === 1
          ? quiet[0]
          : `${quiet.slice(0, -1).join(", ")} and ${quiet[quiet.length - 1]}`;
      parts.push({
        text: ` ${list} ${quiet.length === 1 ? "is" : "are"} still cold`,
        tone: "muted",
      });
      parts.push({ text: " — typical for a niche project at this stage." });
    }
  }

  return parts;
}

export function RepoIdHero({
  repo,
  fetchedAt,
  surfaceCount,
  surfaceTotal,
}: RepoIdHeroProps): JSX.Element {
  const channelsFiring = repo.channelsFiring ?? 0;
  const crossSignal = repo.crossSignalScore ?? 0;
  const sd24 = repo.starsDelta24h ?? 0;
  const sd30 = repo.starsDelta30d ?? 0;
  const ageLabel = repo.lastCommitAt
    ? getRelativeTime(repo.lastCommitAt)
    : null;
  const narrative = buildNarrative(repo);

  // 30D percentage relative to (current - delta) so it's a true growth %
  // rather than a pct of total.
  const sd30Pct =
    sd30 !== 0 && repo.stars - sd30 > 0
      ? Math.round((sd30 / Math.max(1, repo.stars - sd30)) * 100)
      : null;

  return (
    <header className="rid-hero">
      <div className="rid-eyebrow">
        <span className="rid-eyebrow-tag">REPO</span>
        <span className="rid-sep">·</span>
        <span>
          RANK <b>#{repo.rank ?? "—"}</b>
        </span>
        <span className="rid-sep">·</span>
        <span className={channelsFiring >= 2 ? "rid-firing" : "rid-firing dim"}>
          {channelsFiring}/{CHANNEL_TOTAL} firing
        </span>
        {repo.language ? (
          <>
            <span className="rid-sep">·</span>
            <span>{repo.language}</span>
          </>
        ) : null}
      </div>

      <div className="rid-head">
        <div className="rid-id">
          <div className="rid-avatar" aria-hidden>
            {repo.name.slice(0, 1).toLowerCase()}
          </div>
          <div className="rid-id-meta">
            <h1 className="rid-h1">
              <span className="owner">{repo.owner} /</span> {repo.name}
              <TrackedExternalLink
                step="github_click"
                flow="discover-repo"
                trackProps={{ repo: repo.fullName, position: "header" }}
                href={repo.url || `https://github.com/${repo.fullName}`}
                className="rid-ext"
                aria-label={`Open ${repo.fullName} on GitHub`}
              >
                ↗
              </TrackedExternalLink>
            </h1>
            {repo.description ? (
              <p className="rid-desc">{repo.description}</p>
            ) : null}
            <div className="rid-row">
              {repo.language ? (
                <span className="rid-lang">{repo.language}</span>
              ) : null}
              {(repo.topics ?? []).slice(0, 5).map((topic) => (
                <span key={topic} className="rid-topic">
                  {topic}
                </span>
              ))}
              <span className="rid-stat">
                <BrandStar size={11} />
                <b>{formatNumber(repo.stars)}</b>
              </span>
              <span className="rid-stat">
                <span className="rid-stat-icon">⑂</span>
                {formatNumber(repo.forks)}
              </span>
              {repo.contributors ? (
                <span className="rid-stat">
                  <span className="rid-stat-icon">●</span>
                  {repo.contributors} contribs
                </span>
              ) : null}
              {ageLabel ? (
                <span className="rid-stat rid-stat-age">{ageLabel}</span>
              ) : null}
              {fetchedAt ? (
                <FreshnessBadge source="mcp" lastUpdatedAt={fetchedAt} />
              ) : null}
            </div>
          </div>
        </div>
        <div className="rid-actions">
          <RepoActionRow repo={repo} />
        </div>
      </div>

      <div className="rid-verdict">
        <div className="rv-rank">
          <span className="rv-label">Rank</span>
          <span className="rv-num">#{repo.rank ?? "—"}</span>
          <span className="rv-sub">{repo.language ?? "all repos"}</span>
        </div>
        <div className="rv-score">
          <span className="rv-label">Cross-signal</span>
          <span>
            <span className="rv-big">{crossSignal.toFixed(2)}</span>
            <span className="rv-max"> / {CHANNEL_TOTAL}.0</span>
          </span>
          <div className="rv-gauge" aria-hidden>
            {Array.from({ length: CHANNEL_TOTAL }).map((_, i) => (
              <i key={i} className={i < channelsFiring ? "on" : "dim"} />
            ))}
          </div>
          <span className="rv-meta">
            <b>{channelsFiring} / {CHANNEL_TOTAL}</b> channels firing · {sd24 >= 0 ? "+" : ""}
            {formatNumber(sd24)} 24h
          </span>
        </div>
        <p className="rv-text">
          {narrative.map((part, i) => (
            <span
              key={i}
              className={
                part.tone === "positive"
                  ? "rv-tone-pos"
                  : part.tone === "negative"
                    ? "rv-tone-neg"
                    : part.tone === "muted"
                      ? "rv-tone-mut"
                      : ""
              }
            >
              {part.text}
            </span>
          ))}
        </p>
        <div className="rv-spark">
          <span className="rv-label">Cross-signal · 30D</span>
          <span className={sd30 >= 0 ? "rv-pct" : "rv-pct dn"}>
            {sd30 >= 0 ? "+" : ""}
            {sd30Pct !== null
              ? `${sd30Pct}%`
              : `${formatNumber(sd30)}`}
          </span>
        </div>
      </div>

      <ChannelChipRow repo={repo} />

      <RepoMetricStrip
        repo={repo}
        surfaceCount={surfaceCount}
        surfaceTotal={surfaceTotal}
      />
      <FullChartLinkPlacement
        owner={repo.owner}
        name={repo.name}
        starActivityHref={`/repo/${repo.owner}/${repo.name}/star-activity`}
      />
      <style>{`
        .rid-hero { display: flex; flex-direction: column; gap: 12px; }
        .rid-eyebrow {
          display: flex;
          align-items: center;
          gap: 8px;
          font-family: var(--font-geist-mono, monospace);
          font-size: 10px;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: var(--v3-ink-300, rgba(255,255,255,0.7));
        }
        .rid-eyebrow-tag { color: var(--v3-acc, #ffcb05); font-weight: 700; }
        .rid-sep { color: var(--v3-ink-500, rgba(255,255,255,0.3)); }
        .rid-firing { color: var(--sig-green, #22c55e); }
        .rid-firing.dim { color: var(--v3-ink-400, rgba(255,255,255,0.55)); }
        .rid-head {
          display: flex;
          align-items: flex-start;
          gap: 16px;
          padding: 16px;
          border: 1px solid var(--v3-line-100, rgba(255,255,255,0.08));
          border-radius: 3px;
          background: var(--v3-bg-050, rgba(255,255,255,0.025));
        }
        @media (max-width: 720px) {
          .rid-head { flex-direction: column; align-items: stretch; }
        }
        .rid-id { display: flex; gap: 14px; flex: 1; min-width: 0; }
        .rid-avatar {
          width: 56px;
          height: 56px;
          flex-shrink: 0;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 1px solid var(--v3-line-200);
          border-radius: 4px;
          background: linear-gradient(135deg, #6366f1, #8b5cf6);
          color: #fff;
          font-family: var(--font-geist-mono, monospace);
          font-size: 24px;
          font-weight: 600;
        }
        .rid-id-meta { display: flex; flex-direction: column; gap: 6px; min-width: 0; flex: 1; }
        .rid-h1 {
          margin: 0;
          font-size: 26px;
          font-weight: 600;
          letter-spacing: -0.01em;
          color: var(--v3-ink-100, #fff);
        }
        .rid-h1 .owner { color: var(--v3-ink-400, rgba(255,255,255,0.55)); font-weight: 400; }
        .rid-ext {
          margin-left: 8px;
          color: var(--v3-acc, #ffcb05);
          text-decoration: none;
          font-size: 18px;
        }
        .rid-desc {
          margin: 0;
          font-size: 13px;
          line-height: 1.5;
          color: var(--v3-ink-200, rgba(255,255,255,0.8));
          max-width: 78ch;
        }
        .rid-row {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 6px;
          font-family: var(--font-geist-mono, monospace);
          font-size: 11px;
          color: var(--v3-ink-300, rgba(255,255,255,0.7));
        }
        .rid-lang {
          padding: 2px 8px;
          background: color-mix(in oklab, var(--v3-acc, #ffcb05) 18%, transparent);
          border: 1px solid var(--v3-acc, #ffcb05);
          color: var(--v3-acc, #ffcb05);
          border-radius: 2px;
          letter-spacing: 0.08em;
          text-transform: lowercase;
        }
        .rid-topic {
          padding: 2px 8px;
          background: var(--v3-bg-100, rgba(255,255,255,0.05));
          border: 1px solid var(--v3-line-200, rgba(255,255,255,0.16));
          border-radius: 2px;
          color: var(--v3-ink-300);
          letter-spacing: 0.06em;
          text-transform: lowercase;
        }
        .rid-stat {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          color: var(--v3-ink-300);
        }
        .rid-stat b { color: var(--v3-ink-100, #fff); }
        .rid-stat-icon { color: var(--v3-ink-400); }
        .rid-stat-age { color: var(--v3-ink-400); }
        .rid-actions { flex-shrink: 0; }
        @media (max-width: 720px) { .rid-actions { width: 100%; } }
        .rid-verdict {
          display: grid;
          grid-template-columns: minmax(120px, 0.8fr) minmax(180px, 1fr) minmax(0, 2.5fr) minmax(120px, 0.8fr);
          gap: 16px;
          padding: 16px;
          border: 1px solid var(--v3-line-100);
          border-radius: 3px;
          background: var(--v3-bg-050);
        }
        @media (max-width: 980px) {
          .rid-verdict { grid-template-columns: 1fr 1fr; }
          .rid-verdict .rv-text { grid-column: 1 / -1; }
        }
        .rv-rank, .rv-score, .rv-spark {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .rv-label {
          font-family: var(--font-geist-mono, monospace);
          font-size: 9px;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: var(--v3-ink-400);
        }
        .rv-num {
          font-family: var(--font-geist-mono, monospace);
          font-size: 32px;
          font-weight: 700;
          color: var(--v3-acc, #ffcb05);
          line-height: 1;
        }
        .rv-sub {
          font-family: var(--font-geist-mono, monospace);
          font-size: 10px;
          color: var(--v3-ink-400);
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }
        .rv-big {
          font-family: var(--font-geist-mono, monospace);
          font-size: 28px;
          font-weight: 700;
          color: var(--v3-ink-100, #fff);
        }
        .rv-max { font-size: 14px; color: var(--v3-ink-400); }
        .rv-gauge { display: flex; gap: 4px; margin-top: 2px; }
        .rv-gauge i {
          display: block;
          width: 100%;
          height: 4px;
          border-radius: 2px;
          background: var(--v3-line-200, rgba(255,255,255,0.16));
        }
        .rv-gauge i.on { background: var(--sig-green, #22c55e); }
        .rv-meta {
          font-family: var(--font-geist-mono, monospace);
          font-size: 10px;
          color: var(--v3-ink-400);
          letter-spacing: 0.04em;
        }
        .rv-text {
          margin: 0;
          font-size: 13px;
          line-height: 1.6;
          color: var(--v3-ink-200, rgba(255,255,255,0.8));
        }
        .rv-tone-pos { color: var(--sig-green, #22c55e); font-weight: 600; }
        .rv-tone-neg { color: var(--sig-red, #ef4444); font-weight: 600; }
        .rv-tone-mut { color: var(--v3-ink-400, rgba(255,255,255,0.55)); }
        .rv-pct {
          font-family: var(--font-geist-mono, monospace);
          font-size: 22px;
          font-weight: 700;
          color: var(--sig-green, #22c55e);
        }
        .rv-pct.dn { color: var(--sig-red, #ef4444); }
      `}</style>
    </header>
  );
}

/**
 * Tiny inline link placement — placed under the metric strip so the user
 * has an easy bridge to the dedicated chart at all times. The page may
 * also render `StarHistoryBlock` further down with its own `full chart →`
 * link; this is the redundant top-of-page entry point.
 */
function FullChartLinkPlacement({
  owner,
  name,
  starActivityHref,
}: {
  owner: string;
  name: string;
  starActivityHref: string;
}): JSX.Element {
  return (
    <div className="rid-hero-deeplink">
      <Link href={starActivityHref} className="rid-deeplink-btn">
        Star activity → {owner}/{name}
      </Link>
      <style>{`
        .rid-hero-deeplink {
          display: flex;
          justify-content: flex-end;
          padding: 0 4px;
        }
        .rid-deeplink-btn {
          font-family: var(--font-geist-mono, monospace);
          font-size: 10px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--v3-ink-400);
          text-decoration: none;
        }
        .rid-deeplink-btn:hover {
          color: var(--v3-acc, #ffcb05);
        }
      `}</style>
    </div>
  );
}

export default RepoIdHero;
