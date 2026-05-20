// TierListBoard — Server Component. Renders S/A/B/C/D rows of repo tiles
// computed from the derived-repos corpus. Pure presentational: all scoring +
// classification lives in the parent page.tsx so this file stays a server
// component without `'use client'` overhead.
//
// Each tile shows owner avatar (next/image), repo full name, the computed
// tier score, and a 24h Δ pill. A `highlightedFullName` prop draws a brand
// outline around the seeded repo so the deep-link from RepoHeroCard reads
// at a glance.

import Image from "next/image";
import Link from "next/link";

import { repoLogoUrl } from "@/lib/logos";

export type TierLetter = "S" | "A" | "B" | "C" | "D";

export interface TierListItem {
  fullName: string;
  name: string;
  owner: string;
  score: number;
  starsDelta7d: number;
  starsDelta24h: number;
  crossSourceMentions: number;
  categoryId: string;
  language: string | null;
}

export interface TierRow {
  letter: TierLetter;
  label: string;
  description: string;
  items: TierListItem[];
}

interface TierListBoardProps {
  rows: TierRow[];
  highlightedFullName: string | null;
}

// Tier color map. S = brand orange, descending intensity to muted grey.
const TIER_TONE: Record<TierLetter, { bg: string; fg: string; border: string }> = {
  S: {
    bg: "var(--accent)",
    fg: "#0a0a0a",
    border: "var(--accent)",
  },
  A: {
    bg: "var(--cyan)",
    fg: "#062421",
    border: "var(--cyan)",
  },
  B: {
    bg: "var(--up)",
    fg: "#04140a",
    border: "var(--up)",
  },
  C: {
    bg: "var(--surface-4)",
    fg: "var(--fg-bright)",
    border: "var(--surface-4)",
  },
  D: {
    bg: "var(--surface-3)",
    fg: "var(--fg-muted)",
    border: "var(--border-subtle)",
  },
};

export function TierListBoard({ rows, highlightedFullName }: TierListBoardProps) {
  return (
    <div className="tier-list-board" role="list">
      {rows.map((row) => (
        <TierRowView
          key={row.letter}
          row={row}
          highlightedFullName={highlightedFullName}
        />
      ))}
    </div>
  );
}

function TierRowView({
  row,
  highlightedFullName,
}: {
  row: TierRow;
  highlightedFullName: string | null;
}) {
  const tone = TIER_TONE[row.letter];
  const empty = row.items.length === 0;
  return (
    <div className="tier-row" role="listitem">
      <div
        className="tier-bezel"
        style={{
          background: tone.bg,
          color: tone.fg,
          borderColor: tone.border,
        }}
        aria-label={`${row.label} tier`}
      >
        <span className="tier-letter">{row.letter}</span>
        <span className="tier-count">{row.items.length}</span>
      </div>
      <div className="tier-body">
        <div className="tier-head">
          <span className="tier-label">{row.label}</span>
          <span className="tier-desc">{row.description}</span>
        </div>
        {empty ? (
          <div className="tier-empty">No repos in this tier</div>
        ) : (
          <div className="tier-tiles">
            {row.items.map((item) => (
              <TierTile
                key={item.fullName}
                item={item}
                highlighted={item.fullName === highlightedFullName}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TierTile({
  item,
  highlighted,
}: {
  item: TierListItem;
  highlighted: boolean;
}) {
  const logo = repoLogoUrl(item.fullName, 64);
  const deltaSign = item.starsDelta24h > 0 ? "+" : "";
  const deltaTone =
    item.starsDelta24h > 0 ? "up" : item.starsDelta24h < 0 ? "down" : "flat";
  return (
    <Link
      className={`tier-tile${highlighted ? " tier-tile--highlight" : ""}`}
      href={`/repo/${encodeURIComponent(item.fullName)}`}
      title={`${item.fullName} — score ${formatScore(item.score)}`}
      prefetch={false}
    >
      <div className="tier-tile-head">
        {logo ? (
          <Image
            src={logo}
            alt=""
            width={36}
            height={36}
            className="tier-tile-logo"
            unoptimized
          />
        ) : (
          <div className="tier-tile-logo tier-tile-logo--monogram">
            {item.name.charAt(0).toUpperCase() || "?"}
          </div>
        )}
        <div className="tier-tile-id">
          <span className="tier-tile-owner">{item.owner}</span>
          <span className="tier-tile-name">{item.name}</span>
        </div>
      </div>
      <div className="tier-tile-stats">
        <span className="tier-tile-score">{formatScore(item.score)}</span>
        <span className={`tier-tile-delta tier-tile-delta--${deltaTone}`}>
          {deltaSign}
          {formatCompact(item.starsDelta24h)}
        </span>
      </div>
    </Link>
  );
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
