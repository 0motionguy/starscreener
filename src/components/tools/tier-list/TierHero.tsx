// TierHero — eyebrow + title + freshness + scoreboard for /tools/tier-list.
// Server Component. Stays narrow so the page composition file reads top-down.

import Image from "next/image";
import Link from "next/link";

import { FreshnessPill } from "@/components/shell/FreshnessPill";
import { repoLogoUrl } from "@/lib/logos";

import type { TierLetter, TierListItem, TierRow } from "./TierListBoard";

interface TierHeroProps {
  repoCount: number;
  trackedCount: number;
  fetchedAt: string | null;
  rows: TierRow[];
  highlighted: HighlightedRepo | null;
}

export interface HighlightedRepo {
  item: TierListItem;
  tier: TierLetter;
  rank: number;
}

export function TierHero({
  repoCount,
  trackedCount,
  fetchedAt,
  rows,
  highlighted,
}: TierHeroProps) {
  const sCount = rows.find((r) => r.letter === "S")?.items.length ?? 0;
  const aCount = rows.find((r) => r.letter === "A")?.items.length ?? 0;

  return (
    <header className="tier-hero">
      <div className="tier-hero-eyebrow">
        <Link href="/tools" className="tier-hero-back">
          {"// TOOLS"}
        </Link>
        <span className="tier-hero-sep">·</span>
        <span className="tier-hero-eyebrow-num">02 / TIER LIST</span>
        <span className="tier-hero-fresh">
          <FreshnessPill source="repos" fetchedAt={fetchedAt} />
        </span>
      </div>

      <h1 className="tier-hero-title">
        Tier List
        <span className="tier-hero-title-accent">.</span>
      </h1>
      <p className="tier-hero-sub">
        Top {repoCount} tracked repos graded by 7-day star delta, 24h velocity,
        and cross-source mention pressure. S → D bands rebuild every 10 minutes.
      </p>

      <div className="tier-hero-stats">
        <StatCell label="REPOS RANKED" value={String(repoCount)} />
        <StatCell label="UNIVERSE" value={formatCompact(trackedCount)} suffix=" tracked" />
        <StatCell label="S TIER" value={String(sCount)} tone="accent" />
        <StatCell label="A TIER" value={String(aCount)} tone="cyan" />
      </div>

      {highlighted ? <HighlightCard highlighted={highlighted} /> : null}
    </header>
  );
}

function StatCell({
  label,
  value,
  suffix,
  tone,
}: {
  label: string;
  value: string;
  suffix?: string;
  tone?: "accent" | "cyan";
}) {
  return (
    <div className="tier-stat">
      <span className="tier-stat-label">{label}</span>
      <span
        className="tier-stat-value"
        style={
          tone === "accent"
            ? { color: "var(--accent)" }
            : tone === "cyan"
              ? { color: "var(--cyan)" }
              : undefined
        }
      >
        {value}
        {suffix ? <span className="tier-stat-suffix">{suffix}</span> : null}
      </span>
    </div>
  );
}

function HighlightCard({ highlighted }: { highlighted: HighlightedRepo }) {
  const { item, tier, rank } = highlighted;
  const logo = repoLogoUrl(item.fullName, 80);
  const deltaSign = item.starsDelta24h > 0 ? "+" : "";
  const delta7Sign = item.starsDelta7d > 0 ? "+" : "";
  return (
    <div className="tier-highlight" aria-label={`Highlighted: ${item.fullName}`}>
      <div className="tier-highlight-glow" aria-hidden="true" />
      <div className="tier-highlight-eyebrow">
        <span className="tier-highlight-eyebrow-tag">HIGHLIGHTED</span>
        <span className="tier-highlight-eyebrow-rank">
          {rank > 0 ? `rank #${rank}` : "off-list"}
        </span>
      </div>
      <div className="tier-highlight-row">
        {logo ? (
          <Image
            src={logo}
            alt=""
            width={64}
            height={64}
            className="tier-highlight-logo"
            unoptimized
          />
        ) : (
          <div className="tier-highlight-logo tier-highlight-logo--monogram">
            {item.name.charAt(0).toUpperCase() || "?"}
          </div>
        )}
        <div className="tier-highlight-meta">
          <Link
            href={`/repo/${encodeURIComponent(item.fullName)}`}
            className="tier-highlight-name"
            prefetch={false}
          >
            <span className="tier-highlight-owner">{item.owner}</span>
            <span className="tier-highlight-slash">/</span>
            <span className="tier-highlight-repo">{item.name}</span>
          </Link>
          <div className="tier-highlight-tags">
            {item.language ? (
              <span className="tier-highlight-tag">{item.language}</span>
            ) : null}
            {item.categoryId ? (
              <span className="tier-highlight-tag">{item.categoryId}</span>
            ) : null}
          </div>
        </div>
        <div
          className="tier-highlight-badge"
          style={{ background: tierBezelColor(tier) }}
        >
          <span className="tier-highlight-badge-letter">{tier}</span>
          <span className="tier-highlight-badge-label">tier</span>
        </div>
      </div>
      <div className="tier-highlight-breakdown">
        <Stat name="SCORE" value={formatScore(item.score)} highlight />
        <Stat
          name="7D STARS"
          value={`${delta7Sign}${formatCompact(item.starsDelta7d)}`}
          tone={item.starsDelta7d >= 0 ? "up" : "down"}
        />
        <Stat
          name="24H STARS"
          value={`${deltaSign}${formatCompact(item.starsDelta24h)}`}
          tone={item.starsDelta24h >= 0 ? "up" : "down"}
        />
        <Stat
          name="MENTIONS"
          value={formatCompact(item.crossSourceMentions)}
        />
      </div>
    </div>
  );
}

function Stat({
  name,
  value,
  tone,
  highlight,
}: {
  name: string;
  value: string;
  tone?: "up" | "down";
  highlight?: boolean;
}) {
  const color = highlight
    ? "var(--fg-bright)"
    : tone === "up"
      ? "var(--up)"
      : tone === "down"
        ? "var(--accent)"
        : "var(--fg)";
  return (
    <div className="tier-highlight-stat">
      <span className="tier-highlight-stat-name">{name}</span>
      <span className="tier-highlight-stat-value" style={{ color }}>
        {value}
      </span>
    </div>
  );
}

function tierBezelColor(tier: TierLetter): string {
  switch (tier) {
    case "S":
      return "var(--accent)";
    case "A":
      return "var(--cyan)";
    case "B":
      return "var(--up)";
    case "C":
      return "var(--surface-4)";
    case "D":
      return "var(--surface-3)";
  }
}

function formatScore(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return Math.round(n).toString();
}

function formatCompact(n: number): string {
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return Math.round(n).toString();
}
