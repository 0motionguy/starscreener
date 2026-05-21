// CompareTable — the head-to-head matrix for /tools/compare. Server
// Component. Renders one column per selected repo + N empty "ADD REPO"
// slots up to MAX_REPOS, with 10 metric rows below the repo-header row.
//
// All cell formatting lives here so the page composition file stays a
// thin orchestrator. The parent passes already-resolved Repo shapes plus
// the per-repo tier letter computed against the same scoring used by
// /tools/tier-list (top-50 cumulative slicing).

import Image from "next/image";
import Link from "next/link";

import { ArrowRight, Star } from "@/lib/icons";
import { repoLogoUrl } from "@/lib/logos";
import type { Repo } from "@/lib/types";

import { CompareCellSpark } from "./CompareCellSpark";

export type TierLetter = "S" | "A" | "B" | "C" | "D";

export interface CompareEntry {
  repo: Repo;
  tier: TierLetter | null;
  mentions7d: number;
  /** 30d delta backed by either real delta_30d or a 4.3× estimate from 7d. */
  delta30d: number;
  delta30dEstimated: boolean;
}

// Per-column accent palette — keys each repo to a stable color across the
// repo-header cell, the stars value, and the column border so the matrix
// reads as a real head-to-head instead of six identical neutral columns.
const REPO_ACCENTS = [
  "var(--accent)",
  "var(--cyan)",
  "var(--up)",
  "var(--violet)",
  "var(--warning)",
  "var(--info)",
] as const;

function accentForIndex(i: number): string {
  return REPO_ACCENTS[i % REPO_ACCENTS.length];
}

interface Props {
  entries: CompareEntry[];
  maxRepos: number;
  /** owner/name list currently in ?repos=... — used to build remove-links. */
  selectedFullNames: string[];
}

const METRIC_ROWS: Array<{
  key: string;
  label: string;
  sublabel?: string;
}> = [
  { key: "stars", label: "Stars (total)", sublabel: "GitHub lifetime" },
  { key: "d24", label: "24h Δ", sublabel: "stars · last day" },
  { key: "d7", label: "7d Δ", sublabel: "stars · rolling week" },
  { key: "d30", label: "30d Δ", sublabel: "stars · rolling month" },
  { key: "mentions", label: "Mentions (7d)", sublabel: "cross-source rollup" },
  { key: "category", label: "Category", sublabel: "auto-classified" },
  { key: "lang", label: "Top language" },
  { key: "first", label: "First observed", sublabel: "GitHub repo created" },
  { key: "lastCommit", label: "Last commit", sublabel: "default-branch push" },
  { key: "tier", label: "Tier", sublabel: "S → D · live read" },
];

export function CompareTable({ entries, maxRepos, selectedFullNames }: Props) {
  // Build empty-slot count so the matrix always has `maxRepos` columns.
  const emptyCount = Math.max(0, maxRepos - entries.length);

  // Pre-compute per-row max-abs for the bar variants so each cell is
  // normalized against its peer cells in the same row.
  const maxAbs24h = Math.max(1, ...entries.map((e) => Math.abs(e.repo.starsDelta24h ?? 0)));
  const maxAbs7d = Math.max(1, ...entries.map((e) => Math.abs(e.repo.starsDelta7d ?? 0)));
  const maxAbs30d = Math.max(1, ...entries.map((e) => Math.abs(e.delta30d ?? 0)));
  const maxMentions = Math.max(1, ...entries.map((e) => e.mentions7d));

  return (
    <div className="cmp-table-wrap">
      <table className="cmp-table">
        <colgroup>
          <col style={{ width: 220 }} />
          {entries.map((e) => (
            <col key={`c-${e.repo.fullName}`} />
          ))}
          {Array.from({ length: emptyCount }).map((_, i) => (
            <col key={`ce-${i}`} />
          ))}
        </colgroup>

        <thead>
          <tr>
            <th className="cmp-th cmp-th-corner" scope="col">
              <span className="cmp-th-corner-label">{"// METRICS"}</span>
              <span className="cmp-th-corner-sub">
                {entries.length} {entries.length === 1 ? "repo" : "repos"} ·{" "}
                {maxRepos - entries.length} open
              </span>
            </th>
            {entries.map((entry, idx) => (
              <RepoHeaderCell
                key={entry.repo.fullName}
                entry={entry}
                selectedFullNames={selectedFullNames}
                accent={accentForIndex(idx)}
                columnIndex={idx}
              />
            ))}
            {Array.from({ length: emptyCount }).map((_, i) => (
              <EmptySlotCell key={`empty-${i}`} index={entries.length + i + 1} />
            ))}
          </tr>
        </thead>

        <tbody>
          {METRIC_ROWS.map((row) => (
            <tr key={row.key}>
              <th scope="row" className="cmp-row-label">
                <span className="cmp-row-label-main">{row.label}</span>
                {row.sublabel ? (
                  <span className="cmp-row-label-sub">{row.sublabel}</span>
                ) : null}
              </th>
              {entries.map((entry) => (
                <td key={`${row.key}-${entry.repo.fullName}`} className="cmp-cell">
                  {renderCell(row.key, entry, {
                    maxAbs24h,
                    maxAbs7d,
                    maxAbs30d,
                    maxMentions,
                  })}
                </td>
              ))}
              {Array.from({ length: emptyCount }).map((_, i) => (
                <td key={`${row.key}-empty-${i}`} className="cmp-cell cmp-cell-empty">
                  <span className="cmp-cell-empty-dash">—</span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface RowMaxes {
  maxAbs24h: number;
  maxAbs7d: number;
  maxAbs30d: number;
  maxMentions: number;
}

function renderCell(key: string, entry: CompareEntry, m: RowMaxes) {
  const r = entry.repo;
  switch (key) {
    case "stars":
      return <ValueOnly value={formatCompact(r.stars)} sub={formatExact(r.stars)} />;
    case "d24":
      return (
        <DeltaCell
          value={r.starsDelta24h}
          missing={r.starsDelta24hMissing === true}
          rowMax={m.maxAbs24h}
        />
      );
    case "d7":
      return (
        <DeltaCell
          value={r.starsDelta7d}
          missing={r.starsDelta7dMissing === true}
          rowMax={m.maxAbs7d}
        />
      );
    case "d30":
      return (
        <DeltaCell
          value={entry.delta30d}
          missing={r.starsDelta30dMissing === true && r.starsDelta7dMissing === true}
          rowMax={m.maxAbs30d}
          estimated={entry.delta30dEstimated}
        />
      );
    case "mentions":
      return (
        <MentionsCell value={entry.mentions7d} rowMax={m.maxMentions} />
      );
    case "category":
      return <PlainCell value={prettyCategory(r.categoryId)} />;
    case "lang":
      return <PlainCell value={r.language ?? "—"} mono />;
    case "first":
      return (
        <PlainCell
          value={formatYmd(r.createdAt)}
          sub={formatRelative(r.createdAt)}
        />
      );
    case "lastCommit":
      return (
        <PlainCell
          value={r.lastCommitAt ? formatYmd(r.lastCommitAt) : "—"}
          sub={r.lastCommitAt ? formatRelative(r.lastCommitAt) : undefined}
        />
      );
    case "tier":
      return <TierCellLayout tier={entry.tier} />;
    default:
      return <span className="cmp-cell-empty-dash">—</span>;
  }
}

function RepoHeaderCell({
  entry,
  selectedFullNames,
  accent,
  columnIndex,
}: {
  entry: CompareEntry;
  selectedFullNames: string[];
  accent: string;
  columnIndex: number;
}) {
  const { repo } = entry;
  const logo = repoLogoUrl(repo.fullName, 64);
  const remaining = selectedFullNames.filter(
    (fn) => fn.toLowerCase() !== repo.fullName.toLowerCase(),
  );
  const removeHref =
    remaining.length === 0
      ? "/tools/compare"
      : `/tools/compare?repos=${remaining.map(encodeURIComponent).join(",")}`;
  return (
    <th
      className="cmp-th cmp-th-repo cmp-th-repo--keyed"
      scope="col"
      data-col-index={columnIndex}
      style={{
        borderTop: `2px solid ${accent}`,
      }}
    >
      <div className="cmp-th-repo-row">
        {logo ? (
          <Image
            src={logo}
            alt=""
            width={36}
            height={36}
            unoptimized
            className="cmp-th-repo-logo"
            style={{ outline: `1px solid ${accent}`, outlineOffset: 1 }}
          />
        ) : (
          <span
            className="cmp-th-repo-logo cmp-th-repo-logo--monogram"
            style={{ outline: `1px solid ${accent}`, outlineOffset: 1, color: accent }}
          >
            {repo.name.charAt(0).toUpperCase() || "?"}
          </span>
        )}
        <div className="cmp-th-repo-meta">
          <Link
            href={`/repo/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}`}
            className="cmp-th-repo-name"
            prefetch={false}
          >
            <span className="cmp-th-repo-owner">{repo.owner}</span>
            <span className="cmp-th-repo-slash">/</span>
            <span className="cmp-th-repo-repo" style={{ color: accent }}>{repo.name}</span>
          </Link>
          <div className="cmp-th-repo-tags">
            <span className="cmp-th-repo-stars" style={{ color: accent }}>
              {formatCompact(repo.stars)}
              <Star size={12} aria-hidden="true" style={{ marginLeft: 4, verticalAlign: "-1px" }} />
            </span>
            {repo.categoryId ? (
              <span className="cmp-th-repo-tag">{prettyCategory(repo.categoryId)}</span>
            ) : null}
          </div>
        </div>
      </div>
      <div className="cmp-th-repo-foot">
        <Link
          href={removeHref}
          className="cmp-th-repo-remove"
          prefetch={false}
          aria-label={`Remove ${repo.fullName} from comparison`}
        >
          remove
        </Link>
      </div>
    </th>
  );
}

function EmptySlotCell({ index }: { index: number }) {
  return (
    <th className="cmp-th cmp-th-empty" scope="col">
      <div className="cmp-th-empty-body">
        <div className="cmp-th-empty-index">SLOT {String(index).padStart(2, "0")}</div>
        <div className="cmp-th-empty-cta">
          <span className="cmp-th-empty-plus">+</span>
          <span>ADD REPO</span>
        </div>
        <Link
          href="/"
          prefetch={false}
          className="cmp-th-empty-help"
        >
          browse trending
          <ArrowRight size={12} aria-hidden="true" style={{ marginLeft: 4, verticalAlign: "-1px" }} />
        </Link>
        <div className="cmp-th-empty-hint">
          edit <code>?repos=</code> in the URL
        </div>
      </div>
    </th>
  );
}

// ---------------------------------------------------------------------------
// Cell sub-components.
// ---------------------------------------------------------------------------

function ValueOnly({ value, sub }: { value: string; sub?: string }) {
  return (
    <div className="cmp-cell-body">
      <span className="cmp-cell-value">{value}</span>
      {sub ? <span className="cmp-cell-sub">{sub}</span> : null}
    </div>
  );
}

function PlainCell({
  value,
  sub,
  mono,
}: {
  value: string;
  sub?: string;
  mono?: boolean;
}) {
  return (
    <div className="cmp-cell-body">
      <span
        className={`cmp-cell-value ${mono ? "cmp-cell-value-mono" : ""}`.trim()}
        style={
          value === "—" ? { color: "var(--fg-faint)", fontWeight: 400 } : undefined
        }
      >
        {value}
      </span>
      {sub ? <span className="cmp-cell-sub">{sub}</span> : null}
    </div>
  );
}

function DeltaCell({
  value,
  missing,
  rowMax,
  estimated,
}: {
  value: number;
  missing: boolean;
  rowMax: number;
  estimated?: boolean;
}) {
  if (missing) {
    return (
      <div className="cmp-cell-body">
        <span className="cmp-cell-value" style={{ color: "var(--fg-faint)" }}>
          —
        </span>
        <span className="cmp-cell-sub">signal pending</span>
      </div>
    );
  }
  const sign = value > 0 ? "+" : value < 0 ? "" : "±";
  const tone =
    value > 0 ? "var(--up)" : value < 0 ? "var(--accent)" : "var(--fg-muted)";
  return (
    <div className="cmp-cell-body">
      <span className="cmp-cell-value" style={{ color: tone }}>
        {sign}
        {formatCompact(value)}
        {estimated ? (
          <span className="cmp-cell-est" title="estimate · 7d × 4.3">
            {" "}
            est
          </span>
        ) : null}
      </span>
      <CompareCellSpark variant="delta" value={value} max={rowMax} />
    </div>
  );
}

function MentionsCell({ value, rowMax }: { value: number; rowMax: number }) {
  return (
    <div className="cmp-cell-body">
      <span className="cmp-cell-value">{formatCompact(value)}</span>
      <CompareCellSpark variant="mentions" value={value} max={rowMax} />
    </div>
  );
}

function TierCellLayout({ tier }: { tier: TierLetter | null }) {
  return (
    <div className="cmp-cell-body">
      <CompareCellSpark variant="tier" tier={tier} />
      <span className="cmp-cell-sub">
        {tier ? `${tier} tier` : "off-list"}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Formatting helpers.
// ---------------------------------------------------------------------------

function formatCompact(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 10_000) return `${Math.round(n / 1_000)}k`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return Math.round(n).toLocaleString();
}

function formatExact(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return `${Math.round(n).toLocaleString()} stars`;
}

function formatYmd(iso: string | null | undefined): string {
  if (!iso) return "—";
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return "—";
  const d = new Date(ts);
  return d.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function formatRelative(iso: string | null | undefined): string | undefined {
  if (!iso) return undefined;
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return undefined;
  const diffMs = Date.now() - ts;
  if (diffMs < 0) return "in the future";
  const days = Math.floor(diffMs / 86_400_000);
  if (days < 1) return "today";
  if (days < 7) return `${days}d ago`;
  if (days < 60) return `${Math.floor(days / 7)}w ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

function prettyCategory(id: string | null | undefined): string {
  if (!id) return "—";
  const cleaned = id.replace(/[-_]+/g, " ").trim();
  if (!cleaned) return "—";
  return cleaned.replace(/\b\w/g, (c) => c.toUpperCase());
}
