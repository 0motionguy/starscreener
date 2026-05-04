// Skills leaderboard table built on the shared TerminalFeedTable primitive.
//
// Column shape:
//   #  | Title (+ owner) | forks-7d | derivative-count | installs-Δ7d
//   last-commit | hotness | source-links
//
// Sort + filter is computed by the parent page; this component just
// renders. Reuses the operator-terminal aesthetic (mono uppercase
// headers, hairline dashed dividers, v2-row hover) from
// TerminalFeedTable. Cell helpers are prefixed `TerminalCellSkill*` to
// avoid colliding with sibling MCP/repo primitives.

import Link from "next/link";

import { TerminalFeedTable, type FeedColumn } from "@/components/feed/TerminalFeedTable";
import { EntityLogo } from "@/components/ui/EntityLogo";
import { SignalBadge } from "@/components/signal/SignalBadge";
import type { EcosystemLeaderboardItem } from "@/lib/ecosystem-leaderboards";

export type SkillSourceFilter = "all" | "skills.sh" | "github";

interface SkillsTerminalTableProps {
  items: EcosystemLeaderboardItem[];
  accent: string;
  /** Secondary filter — applied client-side to the already-sorted list. */
  sourceFilter?: SkillSourceFilter;
  emptyTitle?: string;
  emptySubtitle?: string;
}

export function SkillsTerminalTable({
  items,
  accent,
  sourceFilter = "all",
  emptyTitle,
  emptySubtitle,
}: SkillsTerminalTableProps) {
  const filtered = filterBySource(items, sourceFilter);
  return (
    <TerminalFeedTable<EcosystemLeaderboardItem>
      rows={filtered}
      columns={SKILL_COLUMNS}
      rowKey={(row) => row.id}
      accent={accent}
      caption="Trending skills leaderboard"
      emptyTitle={emptyTitle}
      emptySubtitle={emptySubtitle}
    />
  );
}

// ---------------------------------------------------------------------------
// Columns
// ---------------------------------------------------------------------------

const SKILL_COLUMNS: FeedColumn<EcosystemLeaderboardItem>[] = [
  {
    id: "rank",
    header: "#",
    width: "44px",
    align: "right",
    render: (row) => (
      <span
        className="font-mono tabular-nums"
        style={{ color: "var(--v3-ink-300)" }}
      >
        {row.rank}
      </span>
    ),
  },
  {
    id: "title",
    header: "Skill / Owner",
    render: (row) => <TerminalCellSkillTitle row={row} />,
  },
  {
    id: "forks-7d",
    header: "Forks 7d",
    width: "80px",
    align: "right",
    hideBelow: "md",
    render: (row) => <TerminalCellSkillNumber value={row.forkVelocity7d} signed />,
  },
  {
    id: "derivative-count",
    header: "Derivatives",
    width: "100px",
    align: "right",
    hideBelow: "md",
    render: (row) => <TerminalCellSkillDerivative row={row} />,
  },
  {
    id: "installs-delta",
    header: "Installs Δ7d",
    width: "104px",
    align: "right",
    hideBelow: "lg",
    render: (row) => <TerminalCellSkillNumber value={row.installsDelta7d} signed />,
  },
  {
    id: "last-commit",
    header: "Last Commit",
    width: "92px",
    align: "right",
    hideBelow: "lg",
    render: (row) => (
      <span
        className="font-mono tabular-nums"
        style={{ color: "var(--v3-ink-300)" }}
      >
        {fmtRelativeAge(row.lastPushedAt)}
      </span>
    ),
  },
  {
    id: "hotness",
    header: "Hotness",
    width: "88px",
    align: "right",
    render: (row) => <TerminalCellHotness rawScore={row.hotness} signalScore={row.signalScore} />,
  },
  {
    id: "source-links",
    header: "Source",
    width: "108px",
    hideBelow: "md",
    render: (row) => <TerminalCellSkillSource row={row} />,
  },
];

// ---------------------------------------------------------------------------
// Cells (prefixed to avoid collision with sibling primitives)
// ---------------------------------------------------------------------------

function TerminalCellSkillTitle({ row }: { row: EcosystemLeaderboardItem }) {
  const owner = row.linkedRepo ? row.linkedRepo.split("/")[0] : row.author;
  // E3: surface "Used by N repos" inline next to the title when we have a
  // derivativeRepoCount. Keeps cross-domain visibility without opening a new
  // detail page (post-MVP).
  const usedByLabel =
    row.derivativeRepoCount && row.derivativeRepoCount > 0
      ? `Used by ${row.derivativeRepoCount.toLocaleString("en-US")} repo${row.derivativeRepoCount === 1 ? "" : "s"}`
      : null;
  return (
    <div className="flex min-w-0 items-start gap-2">
      <EntityLogo
        src={row.logoUrl ?? null}
        name={row.linkedRepo ?? row.author ?? row.title}
        size={20}
        shape="square"
        alt=""
      />
      <div className="min-w-0">
        <a
          href={row.url}
          target="_blank"
          rel="noopener noreferrer"
          className="line-clamp-1 font-medium transition-colors hover:text-[color:var(--v3-acc)]"
          style={{ color: "var(--v3-ink-100)" }}
        >
          {row.title}
        </a>
        <div
          className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px]"
          style={{ color: "var(--v3-ink-400)" }}
        >
          {owner ? <span className="truncate">{owner}</span> : null}
          {usedByLabel ? (
            <span
              className="v2-mono inline-flex items-center px-1 py-0.5 uppercase tracking-[0.16em]"
              style={{
                border: "1px solid var(--v3-line-200)",
                color: "var(--v3-ink-300)",
                borderRadius: 2,
              }}
              title={
                row.derivativeSampledAt
                  ? `Sampled ${row.derivativeSampledAt}`
                  : undefined
              }
            >
              {usedByLabel}
            </span>
          ) : null}
          {row.verified ? <SignalBadge kind="verified" /> : null}
        </div>
      </div>
    </div>
  );
}

function TerminalCellSkillNumber({
  value,
  signed = false,
}: {
  value: number | undefined | null;
  signed?: boolean;
}) {
  if (value === undefined || value === null || !Number.isFinite(value)) {
    return <span style={{ color: "var(--v3-ink-500)" }}>—</span>;
  }
  const formatted = formatCompactNumber(Math.abs(value));
  const sign = signed ? (value > 0 ? "+" : value < 0 ? "−" : "") : "";
  const color =
    signed && value > 0
      ? "var(--v3-sig-green)"
      : signed && value < 0
        ? "var(--v3-sig-red, #ff6b6b)"
        : "var(--v3-ink-200)";
  return (
    <span className="font-mono tabular-nums" style={{ color }}>
      {sign}
      {formatted}
    </span>
  );
}

function TerminalCellSkillDerivative({ row }: { row: EcosystemLeaderboardItem }) {
  if (row.derivativeRepoCount === undefined || row.derivativeRepoCount === null) {
    return <span style={{ color: "var(--v3-ink-500)" }}>—</span>;
  }
  // E3: tooltip surfaces sample sources (registry the count was derived from)
  // when present. Today's payload carries roster keys ("trending-skill",
  // "trending-skill-sh") rather than per-repo names — the upstream fetcher
  // doesn't enumerate sample repos. We surface what's there and call the gap
  // out via the title attribute prefix.
  const sources = row.derivativeSources?.slice(0, 3) ?? [];
  const tooltip = [
    `${row.derivativeRepoCount.toLocaleString("en-US")} derivative${row.derivativeRepoCount === 1 ? "" : "s"}`,
    row.derivativeSampledAt ? `sampled ${row.derivativeSampledAt}` : null,
    sources.length > 0 ? `via ${sources.join(", ")}` : null,
  ]
    .filter((s): s is string => Boolean(s))
    .join(" · ");
  return (
    <span
      className="font-mono tabular-nums"
      style={{ color: "var(--v3-ink-100)" }}
      title={tooltip}
    >
      {formatCompactNumber(row.derivativeRepoCount)}
    </span>
  );
}

/**
 * Hotness = pre-cross-domain rawScore from the skill scorer (0..100). Falls
 * back to the cross-domain momentum (signalScore) when the rawScore wasn't
 * captured (older records before the hotness plumbing landed).
 */
export function TerminalCellHotness({
  rawScore,
  signalScore,
}: {
  rawScore: number | undefined | null;
  signalScore: number | undefined | null;
}) {
  const value = rawScore ?? signalScore;
  if (value === undefined || value === null || !Number.isFinite(value)) {
    return <span style={{ color: "var(--v3-ink-500)" }}>—</span>;
  }
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className="flex items-center justify-end gap-2">
      <span
        aria-hidden
        className="inline-block"
        style={{
          width: 28,
          height: 4,
          background: "var(--v3-bg-100)",
          borderRadius: 1,
          overflow: "hidden",
        }}
      >
        <span
          className="block"
          style={{
            width: `${pct}%`,
            height: "100%",
            background: "rgba(167, 139, 250, 0.85)",
          }}
        />
      </span>
      <span
        className="font-mono font-semibold tabular-nums"
        style={{ color: "var(--v3-ink-000)" }}
      >
        {Math.round(pct)}
      </span>
    </div>
  );
}

function TerminalCellSkillSource({ row }: { row: EcosystemLeaderboardItem }) {
  // We render up to 2 source links: (1) the upstream URL (skills.sh entry or
  // GitHub topic page) and (2) the linked repo when distinct.
  const repoUrl = row.linkedRepo ? `/repo/${row.linkedRepo}` : null;
  const upstreamLabel = row.sourceLabel === "skills.sh" ? "SKLSH" : "GH";
  return (
    <div className="flex items-center gap-1.5">
      <a
        href={row.url}
        target="_blank"
        rel="noopener noreferrer"
        className="v2-mono inline-flex items-center px-1.5 py-0.5 text-[10px] uppercase tracking-[0.16em] hover:underline"
        style={{
          border: "1px solid var(--v3-line-200)",
          color: "var(--v3-ink-200)",
          borderRadius: 2,
        }}
      >
        {upstreamLabel}
      </a>
      {repoUrl ? (
        <Link
          href={repoUrl}
          className="v2-mono inline-flex items-center px-1.5 py-0.5 text-[10px] uppercase tracking-[0.16em] hover:underline"
          style={{
            border: "1px solid var(--v3-line-200)",
            color: "var(--v3-sig-green)",
            borderRadius: 2,
          }}
          title={row.linkedRepo ?? undefined}
        >
          REPO
        </Link>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function filterBySource(
  items: EcosystemLeaderboardItem[],
  filter: SkillSourceFilter,
): EcosystemLeaderboardItem[] {
  if (filter === "all") return items;
  if (filter === "skills.sh") return items.filter((it) => it.sourceLabel === "skills.sh");
  if (filter === "github") return items.filter((it) => it.sourceLabel === "GitHub topics");
  return items;
}

function formatCompactNumber(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (Math.abs(n) >= 10_000) {
    return Intl.NumberFormat("en-US", {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(n);
  }
  return Math.round(n).toLocaleString("en-US");
}

function fmtRelativeAge(iso: string | null | undefined): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "—";
  const diff = Date.now() - t;
  if (diff < 60_000) return "now";
  const m = Math.floor(diff / 60_000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo`;
  return `${Math.floor(mo / 12)}y`;
}

export default SkillsTerminalTable;
