// ToolsCardGrid — 3×2 share-worthy grid on /tools.
//
// SERVER component. Accepts already-loaded data slices from the parent
// (src/app/tools/page.tsx) so the cold path stays single-fetch. Each card
// renders an inline preview reflecting REAL data — three watchlist rows for
// repos the page already loaded, a sparkline drawn from `repo.sparklineData`,
// a 4-tier mini grid filled with top movers, etc.
//
// The card chrome (icon hover + share button) is a small client island
// (ToolHubCard) — but the preview SVGs / divs flow as JSX children so they
// stream with the page and never delay first paint.
//
// Tool registry order matches the operator's launch list:
//   01 Watchlist · 02 Compare · 03 Tier-list · 04 Star-history · 05 Top-10 · 06 PRO upsell.
// /tools/digest, /tools/revenue-estimate, /tools/treemap are NOT part of
// the launch grid — they live as routes but stay out of the hub surface.

import {
  Activity,
  BarChart3,
  Bookmark,
  Layers,
  Sparkles,
  Trophy,
} from "lucide-react";
import type { Repo } from "@/lib/types";
import type { Top10Item } from "@/lib/top10/types";

import { ToolHubCard } from "./ToolHubCard";

export interface ToolsCardGridProps {
  /** Top movers, used by Watchlist + Compare + Tier-list + Star-history. */
  movers: Repo[];
  /** Today's Top-10 repos bundle, used by the Top-10 preview. */
  top10: Top10Item[];
  /** Total tracked repos (foot meta on Watchlist). */
  trackedCount: number;
}

function fmtCompact(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(Math.round(n));
}

function fmtSignedDelta(n: number): string {
  if (!Number.isFinite(n) || n === 0) return "0";
  const sign = n > 0 ? "+" : "";
  return `${sign}${fmtCompact(n)}`;
}

export function ToolsCardGrid({ movers, top10, trackedCount }: ToolsCardGridProps) {
  // Sort by 7d delta — same heuristic as the OG card resolvers in
  // /api/og/tools/[slug] so the hub preview + share image stay aligned.
  const sortedByDelta = [...movers]
    .filter((r) => r.fullName.includes("/"))
    .sort((a, b) => (b.starsDelta7d ?? 0) - (a.starsDelta7d ?? 0));

  const watchlistRepos = sortedByDelta.slice(0, 3);
  const compareRepos = sortedByDelta.slice(0, 2);
  const tierRepos = sortedByDelta.slice(0, 8); // 4 tiers × 2 chips
  const starHistoryRepo = sortedByDelta[0] ?? null;
  const top10Slice = top10.slice(0, 3);

  return (
    <div className="hub-grid">
      {/* 01 — Watchlist */}
      <ToolHubCard
        number="01"
        slug="watchlist"
        icon={<Bookmark size={22} color="var(--accent)" strokeWidth={2} />}
        title="Watchlist"
        tagline="Pin your repos. Track 24h deltas. Screenshot the lineup."
        shareText="Just built my OSS watchlist on trendingrepo.com — these are the repos I'm tracking this week."
        hashtags={["opensource", "github"]}
        metaLabel={<>Live · <b>{fmtCompact(trackedCount)}</b> tracked</>}
      >
        <WatchlistPreview repos={watchlistRepos} />
      </ToolHubCard>

      {/* 02 — Compare */}
      <ToolHubCard
        number="02"
        slug="compare"
        icon={<Layers size={22} color="var(--accent)" strokeWidth={2} />}
        title="Compare"
        tagline="Pit two repos head-to-head across 10 metrics. Share the verdict."
        shareText="Head-to-head: who's pulling ahead on stars, forks, and community velocity? See the matrix."
        hashtags={["opensource"]}
        metaLabel={<>2-up matrix</>}
      >
        <ComparePreview repos={compareRepos} />
      </ToolHubCard>

      {/* 03 — Tier-list */}
      <ToolHubCard
        number="03"
        slug="tier-list"
        icon={<BarChart3 size={22} color="var(--accent)" strokeWidth={2} />}
        title="Tier List"
        tagline="S / A / B / C / D — your take on the trend desk. Drag, share, debate."
        shareText="My S-tier picks for the OSS trend desk this week. Disagree in replies."
        hashtags={["opensource", "github"]}
        metaLabel={<>S · A · B · C · D</>}
      >
        <TierListPreview repos={tierRepos} />
      </ToolHubCard>

      {/* 04 — Star-history */}
      <ToolHubCard
        number="04"
        slug="star-history"
        icon={<Activity size={22} color="var(--accent)" strokeWidth={2} />}
        title="Star History"
        tagline="30-day cumulative curves. Plot up to 6 repos. Annotate the breakout."
        shareText="Star history says it all — look at this curve."
        hashtags={["opensource"]}
        metaLabel={<>30-day curve</>}
      >
        <StarHistoryPreview repo={starHistoryRepo} />
      </ToolHubCard>

      {/* 05 — Top-10 */}
      <ToolHubCard
        number="05"
        slug="top-10"
        icon={<Trophy size={22} color="var(--accent)" strokeWidth={2} />}
        title="Top 10 — Daily"
        tagline="Frozen daily snapshot of the desk's loudest movers. Made to be screenshot."
        shareText="Today's Top-10 movers on the OSS trend desk."
        hashtags={["opensource", "github"]}
        metaLabel={<>Frozen · today</>}
      >
        <Top10Preview items={top10Slice} />
      </ToolHubCard>

      {/* 06 — PRO upsell (placeholder for sixth tool slot) */}
      <ToolHubCard
        number="06"
        slug="pro"
        icon={<Sparkles size={22} color="var(--accent)" strokeWidth={2} />}
        title="More tools - PRO"
        tagline="6-way compare. 5-yr history. RSS / webhooks. CSV + API access."
        shareText="Upgrading to trendingrepo PRO for the deep tools."
        hashtags={[]}
        routeLabel="/pricing"
        metaLabel={<>From $19/mo</>}
      >
        <ProUpsellPreview />
      </ToolHubCard>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Preview components — all server-rendered, no client deps. Keep markup
// dense so the card stays screenshot-ready at the natural card size.
// ---------------------------------------------------------------------------

function WatchlistPreview({ repos }: { repos: Repo[] }) {
  if (repos.length === 0) {
    return <PreviewEmpty>Pin tracked repos to populate</PreviewEmpty>;
  }
  return (
    <ul className="pv-watchlist">
      {repos.map((r) => (
        <li key={r.id} className="pv-watchlist-row">
          <span className="pv-pin" aria-hidden="true">·</span>
          <span className="pv-repo">{r.fullName}</span>
          <span className="pv-stars">{fmtCompact(r.stars)}</span>
          <span
            className={
              "pv-delta " +
              ((r.starsDelta7d ?? 0) >= 0 ? "pv-delta--up" : "pv-delta--down")
            }
          >
            {fmtSignedDelta(r.starsDelta7d ?? 0)}
          </span>
        </li>
      ))}
    </ul>
  );
}

function ComparePreview({ repos }: { repos: Repo[] }) {
  if (repos.length < 2) {
    return <PreviewEmpty>Pick two repos to compare</PreviewEmpty>;
  }
  const [a, b] = repos;
  return (
    <div className="pv-compare-grid">
      <CompareCol label="A" repo={a} />
      <div className="pv-compare-divider" aria-hidden="true" />
      <CompareCol label="B" repo={b} />
    </div>
  );
}

function CompareCol({ label, repo }: { label: string; repo: Repo }) {
  return (
    <div className="pv-compare-col">
      <span className="pv-compare-tag">{label}</span>
      <span className="pv-compare-name">{repo.fullName}</span>
      <span className="pv-compare-stat">
        <span className="pv-compare-num">{fmtCompact(repo.stars)}</span>
        <span className="pv-compare-lbl">stars</span>
      </span>
      <span className="pv-compare-delta">
        {fmtSignedDelta(repo.starsDelta7d ?? 0)} · 7d
      </span>
    </div>
  );
}

function TierListPreview({ repos }: { repos: Repo[] }) {
  if (repos.length === 0) {
    return <PreviewEmpty>Ranking the trend desk…</PreviewEmpty>;
  }
  const tiers = [
    { label: "S", color: "var(--accent)", slice: repos.slice(0, 2) },
    { label: "A", color: "var(--cyan)", slice: repos.slice(2, 4) },
    { label: "B", color: "var(--up)", slice: repos.slice(4, 6) },
    { label: "C", color: "var(--fg-muted)", slice: repos.slice(6, 8) },
  ];
  return (
    <div className="pv-tier-grid">
      {tiers.map((tier) => (
        <div className="pv-tier-row" key={tier.label}>
          <span
            className="pv-tier-tag"
            style={{ background: tier.color }}
          >
            {tier.label}
          </span>
          <div className="pv-tier-chips">
            {tier.slice.length === 0 ? (
              <span className="pv-tier-chip pv-tier-chip--placeholder">—</span>
            ) : (
              tier.slice.map((r) => (
                <span className="pv-tier-chip" key={r.id}>
                  {r.name}
                </span>
              ))
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function StarHistoryPreview({ repo }: { repo: Repo | null }) {
  if (!repo) {
    return <PreviewEmpty>History backfilling…</PreviewEmpty>;
  }
  const series = (repo.sparklineData ?? []).slice(-30);
  if (series.length < 2) {
    return <PreviewEmpty>Series not yet seeded for {repo.fullName}</PreviewEmpty>;
  }
  const cumulative: number[] = [];
  let acc = 0;
  for (const v of series) {
    acc += v;
    cumulative.push(acc);
  }
  const w = 220;
  const h = 60;
  const min = Math.min(...cumulative);
  const max = Math.max(...cumulative);
  const range = max - min || 1;
  const points = cumulative
    .map((v, i) => {
      const x = (i / (cumulative.length - 1)) * w;
      const y = h - ((v - min) / range) * h;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const last = cumulative[cumulative.length - 1] ?? 0;
  return (
    <div className="pv-stars-wrap">
      <div className="pv-stars-meta">
        <span className="pv-stars-name">{repo.fullName}</span>
        <span className="pv-stars-num">+{fmtCompact(last)}</span>
      </div>
      <svg
        className="pv-stars-svg"
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <polyline points={points} />
      </svg>
    </div>
  );
}

function Top10Preview({ items }: { items: Top10Item[] }) {
  if (items.length === 0) {
    return <PreviewEmpty>Snapshot freezing at 23:55 UTC…</PreviewEmpty>;
  }
  return (
    <ol className="pv-top10">
      {items.map((item) => {
        const display = item.owner ? `${item.owner}/${item.title}` : item.title;
        const trailing =
          item.deltaPct !== undefined
            ? `${item.deltaPct >= 0 ? "+" : ""}${item.deltaPct.toFixed(0)}%`
            : item.score.toFixed(2);
        return (
          <li className="pv-top10-row" key={item.slug}>
            <span className="pv-top10-rank">
              {String(item.rank).padStart(2, "0")}
            </span>
            <span className="pv-top10-name">{display}</span>
            <span className="pv-top10-delta">{trailing}</span>
          </li>
        );
      })}
    </ol>
  );
}

function ProUpsellPreview() {
  const features = [
    "6-way compare",
    "5-yr star history",
    "RSS · Slack · Webhooks",
    "CSV + API access",
  ];
  return (
    <ul className="pv-pro">
      {features.map((f) => (
        <li key={f} className="pv-pro-row">
          <span className="pv-pro-mark" aria-hidden="true">+</span>
          <span className="pv-pro-text">{f}</span>
        </li>
      ))}
    </ul>
  );
}

function PreviewEmpty({ children }: { children: React.ReactNode }) {
  return <div className="pv-empty">{children}</div>;
}
