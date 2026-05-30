// BreakoutVelocityLadder — table of real movers ranked by 24h velocity %.
//
// Real data only. No mock fields, no synthesized sparklines, no fabricated
// mention counts. If repo.sparklineData is empty, the spark cell renders a
// muted "no data" mark instead of inventing a curve.
//
// Renders:
//   - header strip with filter tabs (ALL / HOT / WARM / EARLY / PAPER)
//   - table of LadderItem rows
//
// Each row pulls fields from Repo via the parent page:
//   - rank (computed)
//   - repo.ownerAvatarUrl (real GitHub avatar)
//   - repo.owner + repo.name (real)
//   - repo.language (real)
//   - repo.description (real)
//   - velocityPct (computed: starsDelta24h / stars × 100)
//   - velocityTier (derived)
//   - consensusTier (derived from active source count + arxiv link)
//   - activeSources (real, derived from mentions.perSource + channelStatus)
//   - mentions.total24h (real)
//   - starsDelta24h (real)
//   - repo.sparklineData (real, from OSSInsights growth data)

import Image from "next/image";
import Link from "next/link";

import { SourceLogo, type SourceName } from "@/components/icon/Icon";
import { RepoSparkline } from "@/components/trending/RepoSparkline";
import type { Repo, SocialPlatform } from "@/lib/types";

import type { ConsensusTier } from "./BreakoutConsensusStrip";

export type VelocityTier = "explosive" | "hot" | "warm" | "early";
export type LadderFilter = "all" | "hot" | "warm" | "early" | "paper";

export interface LadderItem {
  rank: number;
  repo: Repo;
  velocityPct: number;
  velocityTier: VelocityTier;
  consensusTier: ConsensusTier;
  activeSources: SocialPlatform[];
  mentions24h: number;
  starsDelta24h: number;
}

interface BreakoutVelocityLadderProps {
  items: LadderItem[];
  tierCounts: Record<LadderFilter, number>;
  activeFilter: LadderFilter;
  windowLabel: string;
}

const VELOCITY_TIER_LABEL: Record<VelocityTier, string> = {
  explosive: "EXPLOSIVE",
  hot: "HOT",
  warm: "WARM",
  early: "EARLY",
};

// SocialPlatform key → shell.css .spip.<short> class. Matches the convention
// in MentionSourcePips so the per-brand background tints work.
const SOURCE_PIP_CLASS: Partial<Record<SocialPlatform, string>> = {
  github: "github",
  hackernews: "hn",
  twitter: "x",
  reddit: "reddit",
  bluesky: "bsky",
  devto: "devto",
  huggingface: "hf",
  arxiv: "arxiv",
  npm: "npm",
  lobsters: "lobsters",
};

const SOURCE_LOGO: Partial<Record<SocialPlatform, SourceName>> = {
  github: "github",
  hackernews: "hackernews",
  twitter: "x-twitter",
  reddit: "reddit",
  bluesky: "bluesky",
  devto: "devto",
  huggingface: "huggingface",
  arxiv: "arxiv",
  npm: "npm",
};

// Language → CSS var token for the leading colored dot in the lang pill.
// Maps to existing tokens only — no inline hex (DESIGN-SYSTEM.md §12).
const LANG_DOT: Record<string, string> = {
  TypeScript: "var(--info)",
  JavaScript: "var(--warning)",
  Python: "var(--info)",
  Go: "var(--cyan)",
  Rust: "var(--accent)",
  Ruby: "var(--down)",
  Java: "var(--warning)",
  "C++": "var(--pink)",
  C: "var(--fg-subtle)",
  "C#": "var(--violet)",
  Swift: "var(--accent)",
  Kotlin: "var(--violet)",
  PHP: "var(--violet)",
  Shell: "var(--up)",
  HTML: "var(--accent)",
  CSS: "var(--info)",
  Lua: "var(--info)",
};

function langDotColor(language: string | null | undefined): string {
  if (!language) return "var(--fg-subtle)";
  return LANG_DOT[language] ?? "var(--fg-subtle)";
}

function formatStars(value: number): string {
  if (value >= 1000) {
    const k = value / 1000;
    return `${k >= 10 ? k.toFixed(0) : k.toFixed(1)}k`;
  }
  return value.toLocaleString();
}

function formatPct(pct: number): string {
  if (!Number.isFinite(pct) || pct <= 0) return "+0%";
  return `+${pct.toFixed(0)}%`;
}

function formatDelta(delta: number): string {
  if (delta <= 0) return "·";
  if (delta >= 1000) {
    const k = delta / 1000;
    return `+${k >= 10 ? k.toFixed(0) : k.toFixed(1)}k`;
  }
  return `+${delta.toLocaleString()}`;
}

function velocityBarPct(pct: number): string {
  if (!Number.isFinite(pct) || pct <= 0) return "4%";
  // Map 0..30% velocity onto 4..96% bar width for visual range.
  const clamped = Math.max(4, Math.min(96, (pct / 30) * 96));
  return `${clamped.toFixed(0)}%`;
}

function consensusActiveDots(tier: ConsensusTier, sourceCount: number): number {
  if (tier === "paper") return 1;
  return Math.min(5, Math.max(1, sourceCount));
}

function sparkDirection(points: number[] | undefined): "up" | "down" | "muted" {
  if (!points || points.length < 2) return "muted";
  const first = points[0];
  const last = points[points.length - 1];
  if (last > first) return "up";
  if (last < first) return "down";
  return "muted";
}

export function BreakoutVelocityLadder({
  items,
  tierCounts,
  activeFilter,
  windowLabel,
}: BreakoutVelocityLadderProps) {
  const filters: { id: LadderFilter; label: string; range: string }[] = [
    { id: "all", label: "ALL", range: "" },
    { id: "hot", label: "HOT", range: "≥10%" },
    { id: "warm", label: "WARM", range: "3-10%" },
    { id: "early", label: "EARLY", range: "<3%" },
    { id: "paper", label: "PAPER", range: "" },
  ];

  return (
    <section className="bk-ladder" aria-label="Velocity ladder">
      <header className="bk-ladder-head">
        <div className="bk-ladder-eyebrow">
          <span className="bk-ladder-slashes">{"//"}</span>
          <span className="bk-ladder-title">VELOCITY LADDER &middot; {windowLabel}</span>
          <span className="bk-ladder-sub">
            ranked by mention-velocity % above baseline
          </span>
        </div>
        <nav className="bk-ladder-filters" aria-label="Filter by tier">
          {filters.map((filter) => {
            const count = tierCounts[filter.id] ?? 0;
            const isActive = filter.id === activeFilter;
            return (
              <Link
                key={filter.id}
                href={{ query: filter.id === "all" ? {} : { filter: filter.id } }}
                className={`bk-ladder-filter${isActive ? " on" : ""}`}
                prefetch={false}
              >
                <span className="bk-ladder-filter-label">{filter.label}</span>
                {filter.range && (
                  <span className="bk-ladder-filter-range">{filter.range}</span>
                )}
                <span className="bk-ladder-filter-count">{count}</span>
              </Link>
            );
          })}
        </nav>
      </header>

      <div className="bk-ladder-table" role="table" aria-rowcount={items.length + 1}>
        <div className="bk-ladder-row bk-ladder-row--head" role="row">
          <span className="bk-col-rank" role="columnheader">#</span>
          <span className="bk-col-repo" role="columnheader">Repo</span>
          <span className="bk-col-vel" role="columnheader">{windowLabel} Velocity</span>
          <span className="bk-col-pct" role="columnheader">%&Delta;</span>
          <span className="bk-col-consensus" role="columnheader">Consensus</span>
          <span className="bk-col-sources" role="columnheader">Sources</span>
          <span className="bk-col-mentions" role="columnheader">Mentions &middot; {windowLabel}</span>
          <span className="bk-col-stars" role="columnheader">&#9733; {windowLabel}</span>
        </div>

        {items.length === 0 ? (
          <div className="bk-ladder-empty">
            No repos match this filter right now &mdash; the live pipeline
            hasn&apos;t surfaced anything in this band yet.
          </div>
        ) : (
          items.map((item) => {
            const owner = item.repo.owner;
            const name = item.repo.name;
            const detailHref = owner && name ? `/repo/${owner}/${name}` : item.repo.url;
            const sparkPts = item.repo.sparklineData ?? [];
            const sparkDir = sparkDirection(sparkPts);
            const consensusOn = consensusActiveDots(item.consensusTier, item.activeSources.length);
            const visibleSources = item.activeSources.slice(0, 5);
            const overflowSources = item.activeSources.length - visibleSources.length;

            return (
              <Link
                key={`${item.repo.fullName}-${item.rank}`}
                href={detailHref}
                prefetch={false}
                className={`bk-ladder-row bk-row-link bk-row--${item.velocityTier}`}
                role="row"
              >
                <span className="bk-col-rank bk-row-rank" role="cell">
                  {String(item.rank).padStart(2, "0")}
                </span>

                <span className="bk-col-repo bk-row-repo" role="cell">
                  <span className="bk-row-avatar" aria-hidden="true">
                    {item.repo.ownerAvatarUrl ? (
                      <Image
                        src={item.repo.ownerAvatarUrl}
                        alt=""
                        width={28}
                        height={28}
                        unoptimized
                        className="bk-row-avatar-img"
                      />
                    ) : (
                      <span className="bk-row-avatar-fallback">
                        {(owner || item.repo.fullName)[0]?.toUpperCase()}
                      </span>
                    )}
                  </span>
                  <span className="bk-row-repo-text">
                    <span className="bk-row-repo-line">
                      <span className="bk-row-owner">{owner}</span>
                      <span className="bk-row-slash">/</span>
                      <span className="bk-row-name">{name}</span>
                      {item.repo.language && (
                        <span className="bk-row-lang">
                          <span
                            className="bk-row-lang-dot"
                            aria-hidden="true"
                            style={{ background: langDotColor(item.repo.language) }}
                          />
                          {item.repo.language}
                        </span>
                      )}
                    </span>
                    {item.repo.description && (
                      <span className="bk-row-desc">{item.repo.description}</span>
                    )}
                  </span>
                </span>

                <span className={`bk-col-vel bk-row-velbar bk-row-velbar--${item.velocityTier}`} role="cell">
                  <span
                    className="bk-row-velbar-fill"
                    style={{ width: velocityBarPct(item.velocityPct) }}
                  />
                  <span className="bk-row-velbar-badge">
                    {VELOCITY_TIER_LABEL[item.velocityTier]}
                  </span>
                </span>

                <span className={`bk-col-pct bk-row-pct bk-row-pct--${item.velocityTier}`} role="cell">
                  {formatPct(item.velocityPct)}
                </span>

                <span
                  className={`bk-col-consensus bk-row-consensus bk-row-consensus--${item.consensusTier}`}
                  role="cell"
                  aria-label={`${item.consensusTier} consensus, ${consensusOn} active sources`}
                >
                  {Array.from({ length: 5 }).map((_, i) => (
                    <span
                      key={i}
                      className={`bk-row-cdot${i < consensusOn ? " on" : ""}`}
                    />
                  ))}
                </span>

                <span className="bk-col-sources bk-row-sources" role="cell">
                  {visibleSources.map((src) => {
                    const logo = SOURCE_LOGO[src];
                    const pipClass = SOURCE_PIP_CLASS[src] ?? src;
                    return (
                      <span key={src} className={`spip ${pipClass}`} title={src}>
                        {logo ? (
                          <SourceLogo source={logo} size="sm" alt="" />
                        ) : (
                          <span className="spip-letter">{src[0]?.toUpperCase()}</span>
                        )}
                      </span>
                    );
                  })}
                  {overflowSources > 0 && (
                    <span className="spip-more" title={`${overflowSources} more`}>
                      +{overflowSources}
                    </span>
                  )}
                </span>

                <span className={`bk-col-mentions bk-row-mentions bk-row-mentions--${item.velocityTier}`} role="cell">
                  {sparkPts.length > 1 ? (
                    <RepoSparkline data={sparkPts} variant={sparkDir} />
                  ) : (
                    <span className="bk-row-mentions-empty">&middot;</span>
                  )}
                </span>

                <span className="bk-col-stars bk-row-stars" role="cell">
                  {formatDelta(item.starsDelta24h)}
                </span>
              </Link>
            );
          })
        )}
      </div>
    </section>
  );
}
