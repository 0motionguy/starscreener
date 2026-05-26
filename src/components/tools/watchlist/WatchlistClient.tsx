"use client";

// WatchlistClient — terminal-density watchlist board for /tools/watchlist.
//
// Renders the pinned repos as a `.tdata` table (Bloomberg-density convention
// from docs/DESIGN-SYSTEM.md §7.3): pin/select column, rank, repo identity,
// stars (+24h Δ), velocity badge, mention cell, freshness pip, row actions.
//
// Three surfaces in one client island:
//   1. Empty-state card with multi-line paste textarea (auto-parses
//      `owner/repo` lines on blur — common founder workflow: paste a list of
//      tabs from GitHub explore + hit blur).
//   2. The `.tdata` table itself with row-level select + bulk delete + bulk
//      CSV export.
//   3. Sticky footer that appears when ≥1 row is selected.
//
// All chrome reads from shell.css tokens; the only inline `<style>` block
// adds tool-scoped class rules under `.wl-board-v2`.
//
// Pre-hydration: the persisted store rehydrates from localStorage AFTER
// first paint, so we gate `mounted` to avoid the "0 pinned" flash.

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";

import { Icon } from "@/lib/icons";
import { MentionCell } from "@/components/trending/MentionSourcePips";
import { classifyFreshness } from "@/lib/news/freshness";
import { useWatchlistStore } from "@/lib/store";
import type { Repo, WatchlistItem } from "@/lib/types";
import { slugToId } from "@/lib/utils";

interface WatchlistClientProps {
  /** Server-provided lookup of every tracked repo, keyed by `slugToId(fullName)`. */
  reposById: Record<string, Repo>;
  /** ISO timestamp of the last trending refresh — drives the freshness pip. */
  fetchedAt: string | null;
}

interface JoinedRow {
  item: WatchlistItem;
  repo: Repo | null;
  fullName: string;
  owner: string;
  name: string;
}

// ─── Formatting helpers ───────────────────────────────────────────────────

function formatStars(n: number | null | undefined): string {
  if (!Number.isFinite(n ?? NaN) || n === null || n === undefined) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${Math.round(n / 1_000)}K`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return Math.round(n).toLocaleString();
}

function formatSignedDelta(n: number | null | undefined): string {
  if (!Number.isFinite(n ?? NaN) || n === null || n === undefined) return "—";
  const abs = Math.abs(n);
  const compact =
    abs >= 1_000 ? `${(abs / 1_000).toFixed(1)}K` : Math.round(abs).toLocaleString();
  if (n > 0) return `+${compact}`;
  if (n < 0) return `-${compact}`;
  return "0";
}

function deltaClass(n: number | null | undefined): "up" | "dn" | "fl" {
  if (!Number.isFinite(n ?? NaN) || n === null || n === undefined) return "fl";
  if (n > 0) return "up";
  if (n < 0) return "dn";
  return "fl";
}

function velocityForRepo(
  repo: Repo | null,
): { label: string; tone: "explosive" | "hot" | "steady" | "cool" } {
  if (!repo) return { label: "RESOLVING", tone: "cool" };
  if (repo.movementStatus === "breakout") return { label: "BREAKOUT", tone: "explosive" };
  if (repo.movementStatus === "hot") return { label: "HOT", tone: "hot" };
  if (repo.movementStatus === "quiet_killer") return { label: "QUIET", tone: "steady" };
  const d24 = repo.starsDelta24h ?? 0;
  if (d24 >= 200) return { label: "HOT", tone: "hot" };
  if (d24 >= 50) return { label: "STEADY", tone: "steady" };
  return { label: "COOL", tone: "cool" };
}

function resolveRepo(
  item: WatchlistItem,
  reposById: Record<string, Repo>,
): Repo | null {
  const direct = reposById[item.repoId] ?? null;
  if (direct) return direct;
  if (item.fullName) {
    const altId = slugToId(item.fullName);
    return reposById[altId] ?? null;
  }
  return null;
}

function splitFullName(item: WatchlistItem, repo: Repo | null): {
  fullName: string;
  owner: string;
  name: string;
} {
  if (repo) {
    return { fullName: repo.fullName, owner: repo.owner, name: repo.name };
  }
  const fallback = item.fullName ?? item.repoId;
  if (fallback.includes("/")) {
    const [owner = "", name = ""] = fallback.split("/");
    return { fullName: fallback, owner, name };
  }
  return { fullName: fallback, owner: "", name: fallback };
}

// ─── Paste parser ─────────────────────────────────────────────────────────
// Accepts any of:
//   owner/repo
//   github.com/owner/repo
//   https://github.com/owner/repo
//   https://github.com/owner/repo.git
//   leading/trailing whitespace, blank lines, comment lines (#)

function parsePasteBlock(raw: string): string[] {
  if (!raw) return [];
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"))
    .map((line) =>
      line
        .replace(/^https?:\/\/(www\.)?github\.com\//i, "")
        .replace(/^github\.com\//i, "")
        .replace(/\.git$/i, "")
        .replace(/\/$/, ""),
    )
    .filter((line) => /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/.test(line))
    .map((line) => {
      const [owner = "", name = ""] = line.split("/", 2);
      return `${owner}/${name}`;
    });
}

function buildCsv(rows: JoinedRow[]): string {
  const header = "fullName,stars,starsDelta24h,starsDelta7d,language,addedAt";
  const lines = rows.map((row) => {
    const r = row.repo;
    const stars = r?.stars ?? "";
    const d24 = r?.starsDelta24h ?? "";
    const d7 = r?.starsDelta7d ?? "";
    const lang = r?.language ?? "";
    return [
      row.fullName,
      stars,
      d24,
      d7,
      lang,
      row.item.addedAt,
    ].join(",");
  });
  return [header, ...lines].join("\n");
}

// ─── Component ────────────────────────────────────────────────────────────

export function WatchlistClient({
  reposById,
  fetchedAt,
}: WatchlistClientProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const repos = useWatchlistStore((s) => s.repos);
  const removeRepo = useWatchlistStore((s) => s.removeRepo);
  const addRepo = useWatchlistStore((s) => s.addRepo);

  // Single-line add input (top of board).
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [draft, setDraft] = useState("");
  const [addError, setAddError] = useState<string | null>(null);

  // Paste textarea (in empty state).
  const pasteRef = useRef<HTMLTextAreaElement | null>(null);
  const [pasteCount, setPasteCount] = useState(0);

  // Bulk selection state — tracks selected repoIds as a Set.
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Mirror count into the hero pill so server-rendered "—" gets replaced.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const node = document.querySelector("[data-watchlist-count]");
    if (!node) return;
    node.textContent = mounted ? String(repos.length) : "—";
  }, [mounted, repos.length]);

  const rows: JoinedRow[] = useMemo(() => {
    return repos.map((item) => {
      const repo = resolveRepo(item, reposById);
      const ident = splitFullName(item, repo);
      return { item, repo, ...ident };
    });
  }, [repos, reposById]);

  // Drop stale selections when rows change underneath.
  useEffect(() => {
    if (selected.size === 0) return;
    const live = new Set(rows.map((r) => r.item.repoId));
    let dropped = false;
    const next = new Set<string>();
    for (const id of selected) {
      if (live.has(id)) next.add(id);
      else dropped = true;
    }
    if (dropped) setSelected(next);
  }, [rows, selected]);

  const allSelected = rows.length > 0 && selected.size === rows.length;
  const someSelected = selected.size > 0 && selected.size < rows.length;

  const toggleRow = (repoId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(repoId)) next.delete(repoId);
      else next.add(repoId);
      return next;
    });
  };

  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(rows.map((r) => r.item.repoId)));
  };

  const bulkRemove = () => {
    for (const id of selected) removeRepo(id);
    setSelected(new Set());
  };

  const bulkExport = () => {
    const subset = rows.filter((r) => selected.has(r.item.repoId));
    if (subset.length === 0) return;
    const csv = buildCsv(subset);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `watchlist-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Single-add handler.
  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setAddError(null);
    const raw = draft.trim();
    if (!raw) return;
    const parsed = parsePasteBlock(raw);
    if (parsed.length === 0) {
      setAddError("Use owner/name (e.g. vercel/next.js).");
      return;
    }
    for (const fullName of parsed) {
      const id = slugToId(fullName);
      const live = reposById[id] ?? null;
      addRepo(id, live?.stars ?? 0, fullName);
    }
    setDraft("");
    inputRef.current?.blur();
  };

  // Paste-block parsing on blur (no submit needed — the textarea is the action).
  const handlePasteBlur = () => {
    const raw = pasteRef.current?.value ?? "";
    const parsed = parsePasteBlock(raw);
    if (parsed.length === 0) {
      setPasteCount(0);
      return;
    }
    for (const fullName of parsed) {
      const id = slugToId(fullName);
      const live = reposById[id] ?? null;
      addRepo(id, live?.stars ?? 0, fullName);
    }
    setPasteCount(parsed.length);
    if (pasteRef.current) pasteRef.current.value = "";
  };

  const handlePasteChange = () => {
    const raw = pasteRef.current?.value ?? "";
    const parsed = parsePasteBlock(raw);
    setPasteCount(parsed.length);
  };

  // Freshness — drives the per-row pip color.
  const fresh = classifyFreshness("repos", fetchedAt);
  const pipClass =
    fresh.status === "live"
      ? "fresh-live"
      : fresh.status === "warn"
        ? "fresh-warm"
        : "fresh-cold";

  return (
    <section className="wl-board-v2" aria-labelledby="wl-board-head">
      <WatchlistClientStyles />

      {/* Card head */}
      <div className="wl-board-head">
        <div className="wl-head-left">
          <span className="wl-eyebrow-num">{"// 01"}</span>
          <span className="wl-eyebrow-title" id="wl-board-head">
            Your watchlist
          </span>
          <span className="wl-eyebrow-meta">
            <b>{mounted ? rows.length : "—"}</b> pinned · stored locally
          </span>
        </div>
        <form className="wl-add" onSubmit={handleAddSubmit} role="search">
          <input
            ref={inputRef}
            type="text"
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              if (addError) setAddError(null);
            }}
            placeholder="owner/name (e.g. vercel/next.js)"
            autoComplete="off"
            spellCheck={false}
            aria-label="Add repo to watchlist"
            className="wl-add-input"
          />
          <button type="submit" className="btn primary wl-add-btn">
            <Icon name="plus" size="sm" /> Pin
          </button>
        </form>
      </div>

      {addError ? (
        <div className="wl-add-error" role="alert">
          <Icon name="alert-circle" size="sm" /> {addError}
        </div>
      ) : null}

      {/* Body */}
      {!mounted ? (
        <div className="wl-skel" aria-hidden="true">
          <span className="wl-skel-line" />
          <span className="wl-skel-line" />
          <span className="wl-skel-line" />
        </div>
      ) : rows.length === 0 ? (
        <EmptyBoard
          pasteRef={pasteRef}
          pasteCount={pasteCount}
          onChange={handlePasteChange}
          onBlur={handlePasteBlur}
        />
      ) : (
        <WatchlistTable
          rows={rows}
          selected={selected}
          allSelected={allSelected}
          someSelected={someSelected}
          toggleRow={toggleRow}
          toggleAll={toggleAll}
          onRemove={removeRepo}
          pipClass={pipClass}
          ageLabel={fresh.ageLabel}
        />
      )}

      {/* Sticky bulk-action footer */}
      {selected.size > 0 ? (
        <div className="wl-bulk-foot" role="region" aria-label="Bulk actions">
          <div className="wl-bulk-meta">
            <span className="wl-bulk-num">{selected.size}</span>
            <span className="wl-bulk-sub">
              {selected.size === 1 ? "row selected" : "rows selected"}
            </span>
          </div>
          <div className="wl-bulk-actions">
            <button
              type="button"
              className="btn ghost wl-bulk-btn"
              onClick={() => setSelected(new Set())}
            >
              Clear
            </button>
            <button
              type="button"
              className="btn wl-bulk-btn"
              onClick={bulkExport}
            >
              <Icon name="download" size="sm" /> Export CSV
            </button>
            <button
              type="button"
              className="btn wl-bulk-btn wl-bulk-danger"
              onClick={bulkRemove}
            >
              <Icon name="trash" size="sm" /> Remove
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

// ─── Empty board ─────────────────────────────────────────────────────────

interface EmptyBoardProps {
  pasteRef: React.RefObject<HTMLTextAreaElement | null>;
  pasteCount: number;
  onChange: () => void;
  onBlur: () => void;
}

function EmptyBoard({ pasteRef, pasteCount, onChange, onBlur }: EmptyBoardProps) {
  return (
    <div className="wl-empty-v2">
      <div className="wl-empty-glyph" aria-hidden="true">
        <Icon name="bookmark-plus" size="2xl" />
      </div>
      <div className="wl-empty-body">
        <div className="wl-empty-title">No repos pinned</div>
        <p className="wl-empty-sub">
          Paste a list of <code>owner/repo</code> lines below (one per line,
          GitHub URLs work too) and they auto-pin on blur. Or jump back to the{" "}
          <Link href="/" prefetch={false} className="wl-empty-link">
            trending hub →
          </Link>{" "}
          and pin from any row.
        </p>
        <label className="wl-paste-label" htmlFor="wl-paste-area">
          PASTE · auto-pins on blur
        </label>
        <textarea
          id="wl-paste-area"
          ref={pasteRef}
          className="wl-paste-area"
          rows={5}
          spellCheck={false}
          placeholder={`vercel/next.js\nsveltejs/svelte\nhttps://github.com/openai/codex`}
          onChange={onChange}
          onBlur={onBlur}
        />
        <div className="wl-paste-meta">
          <span className="wl-paste-count">
            {pasteCount} valid {pasteCount === 1 ? "line" : "lines"} detected
          </span>
          <span className="wl-paste-hint">
            <Icon name="info" size="sm" /> Lines starting with <code>#</code>{" "}
            are ignored.
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Data table ─────────────────────────────────────────────────────────

interface WatchlistTableProps {
  rows: JoinedRow[];
  selected: Set<string>;
  allSelected: boolean;
  someSelected: boolean;
  toggleRow: (repoId: string) => void;
  toggleAll: () => void;
  onRemove: (repoId: string) => void;
  pipClass: string;
  ageLabel: string;
}

function WatchlistTable({
  rows,
  selected,
  allSelected,
  someSelected,
  toggleRow,
  toggleAll,
  onRemove,
  pipClass,
  ageLabel,
}: WatchlistTableProps) {
  return (
    <div className="wl-table-wrap">
      <table className="tdata wl-table">
        <thead>
          <tr>
            <th className="wl-th-check">
              <input
                type="checkbox"
                aria-label={allSelected ? "Clear selection" : "Select all rows"}
                checked={allSelected}
                ref={(el) => {
                  if (el) el.indeterminate = someSelected;
                }}
                onChange={toggleAll}
              />
            </th>
            <th className="wl-th-rank num">#</th>
            <th className="wl-th-repo">Repo</th>
            <th className="wl-th-stars num">Stars</th>
            <th className="wl-th-delta num">24h Δ</th>
            <th className="wl-th-delta num">7d Δ</th>
            <th className="wl-th-vel">Velocity</th>
            <th className="wl-th-ment">Mentions (7d)</th>
            <th className="wl-th-fresh" title={`Scanned ${ageLabel}`}>
              Fresh
            </th>
            <th className="wl-th-act" aria-label="Row actions" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => {
            const { item, repo, fullName, owner, name } = row;
            const isSel = selected.has(item.repoId);
            const vel = velocityForRepo(repo);
            const d24 = repo?.starsDelta24h ?? null;
            const d7 = repo?.starsDelta7d ?? null;
            const href =
              owner && name
                ? `/repo/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`
                : "/account";
            return (
              <tr
                key={item.repoId}
                className={isSel ? "wl-row-selected" : undefined}
              >
                <td className="wl-td-check">
                  <input
                    type="checkbox"
                    checked={isSel}
                    onChange={() => toggleRow(item.repoId)}
                    aria-label={`Select ${fullName}`}
                  />
                </td>
                <td className="wl-td-rank num">{String(idx + 1).padStart(2, "0")}</td>
                <td className="wl-td-repo">
                  <div className="wl-repo-cell">
                    <span className="wl-repo-avatar" aria-hidden="true">
                      {repo?.ownerAvatarUrl ? (
                        <Image
                          src={repo.ownerAvatarUrl}
                          alt=""
                          width={24}
                          height={24}
                          unoptimized
                          style={{ borderRadius: 2, display: "block" }}
                        />
                      ) : (
                        <span className="wl-repo-avatar-fallback">
                          {(owner || fullName).slice(0, 2).toUpperCase()}
                        </span>
                      )}
                    </span>
                    <div className="wl-repo-id">
                      <Link
                        href={href}
                        prefetch={false}
                        className="wl-repo-name"
                      >
                        <span className="wl-repo-owner">{owner}/</span>
                        {name}
                      </Link>
                      <span className="wl-repo-lang">
                        {repo?.language ? (
                          <>
                            <span className="wl-lang-dot" aria-hidden="true" />
                            {repo.language}
                          </>
                        ) : (
                          "resolving…"
                        )}
                      </span>
                    </div>
                  </div>
                </td>
                <td className="num">
                  <span className="wl-stars-v">{formatStars(repo?.stars)}</span>
                </td>
                <td className={`num wl-delta wl-delta-${deltaClass(d24)}`}>
                  {formatSignedDelta(d24)}
                </td>
                <td className={`num wl-delta wl-delta-${deltaClass(d7)}`}>
                  {formatSignedDelta(d7)}
                </td>
                <td>
                  <span className={`velocity ${vel.tone}`}>
                    <span className="dot" /> {vel.label}
                  </span>
                </td>
                <td>
                  {repo ? (
                    <MentionCell repo={repo} />
                  ) : (
                    <span className="wl-faint">—</span>
                  )}
                </td>
                <td>
                  <span className={`fresh ${pipClass}`} title={ageLabel}>
                    <span className="pip" />
                  </span>
                </td>
                <td className="wl-td-act">
                  <div className="wl-act-group">
                    <Link
                      href={href}
                      prefetch={false}
                      className="wl-act-btn"
                      title="Open repo"
                      aria-label={`Open ${fullName}`}
                    >
                      <Icon name="external" size="sm" />
                    </Link>
                    <button
                      type="button"
                      className="wl-act-btn wl-act-danger"
                      title="Remove from watchlist"
                      aria-label={`Remove ${fullName}`}
                      onClick={() => onRemove(item.repoId)}
                    >
                      <Icon name="trash" size="sm" />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Component-scoped styles ─────────────────────────────────────────────

function WatchlistClientStyles() {
  return (
    <style>{`
      .wl-board-v2 {
        background: var(--surface);
        border: 1px solid var(--border-subtle);
        border-radius: var(--r-lg);
        padding: 14px 16px 16px;
        margin-top: 16px;
        position: relative;
      }

      /* Head row ------------------------------------------------------- */
      .wl-board-head {
        display: flex;
        align-items: center;
        gap: 14px;
        flex-wrap: wrap;
        padding-bottom: 12px;
        margin-bottom: 12px;
        border-bottom: 1px solid var(--border-subtle);
      }
      .wl-head-left {
        display: flex;
        align-items: baseline;
        gap: 10px;
        flex: 1 1 auto;
        min-width: 0;
      }
      .wl-eyebrow-num {
        font-family: var(--font-mono);
        font-size: 11px;
        color: var(--accent);
        letter-spacing: 0.10em;
        font-weight: 600;
      }
      .wl-eyebrow-title {
        font-size: 13.5px;
        color: var(--fg-bright);
        font-weight: 500;
      }
      .wl-eyebrow-meta {
        font-family: var(--font-mono);
        font-size: 10.5px;
        color: var(--fg-faint);
        letter-spacing: 0.06em;
      }
      .wl-eyebrow-meta b { color: var(--fg); font-weight: 500; }

      .wl-add {
        display: flex;
        align-items: center;
        gap: 6px;
        flex: 0 0 auto;
      }
      .wl-add-input {
        height: 30px;
        padding: 0 10px;
        background: var(--surface-2);
        border: 1px solid var(--border-subtle);
        border-radius: var(--r-md);
        color: var(--fg-bright);
        font-family: var(--font-mono);
        font-size: 12px;
        outline: none;
        min-width: 260px;
        transition: border-color var(--motion-fast) var(--ease);
      }
      .wl-add-input::placeholder { color: var(--fg-faint); }
      .wl-add-input:focus { border-color: var(--accent); }
      .wl-add-btn {
        height: 30px;
        gap: 4px;
      }

      .wl-add-error {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        margin-bottom: 12px;
        padding: 6px 10px;
        background: var(--down-soft);
        border: 1px solid rgba(255, 77, 77, 0.28);
        border-radius: var(--r-md);
        color: var(--down);
        font-family: var(--font-mono);
        font-size: 11px;
      }

      /* Skeleton ------------------------------------------------------- */
      .wl-skel { display: flex; flex-direction: column; gap: 6px; }
      .wl-skel-line {
        display: block;
        height: 42px;
        background: linear-gradient(90deg, var(--surface-2) 0%, var(--surface-3) 50%, var(--surface-2) 100%);
        background-size: 200% 100%;
        animation: wl-skel-shimmer 1.4s ease-in-out infinite;
        border-radius: var(--r-xs);
        opacity: 0.55;
      }
      .wl-skel-line:nth-child(2) { opacity: 0.40; }
      .wl-skel-line:nth-child(3) { opacity: 0.30; }
      @keyframes wl-skel-shimmer {
        0% { background-position: 200% 0; }
        100% { background-position: -200% 0; }
      }

      /* Empty board ---------------------------------------------------- */
      .wl-empty-v2 {
        display: grid;
        grid-template-columns: 64px 1fr;
        gap: 18px;
        align-items: start;
        padding: 24px 22px;
        background: var(--surface-2);
        border: 1px dashed var(--border);
        border-radius: var(--r-lg);
      }
      .wl-empty-glyph {
        width: 56px;
        height: 56px;
        display: grid;
        place-items: center;
        background: var(--accent-wash);
        border: 1px solid var(--accent-line);
        border-radius: var(--r-md);
        color: var(--accent);
      }
      .wl-empty-body { min-width: 0; }
      .wl-empty-title {
        font-family: var(--font-display);
        font-size: 18px;
        font-weight: 600;
        letter-spacing: -0.01em;
        color: var(--fg-bright);
        margin-bottom: 6px;
      }
      .wl-empty-sub {
        margin: 0 0 14px;
        font-size: 12.5px;
        color: var(--fg-muted);
        line-height: 1.55;
        max-width: 62ch;
      }
      .wl-empty-sub code {
        font-family: var(--font-mono);
        background: var(--surface-3);
        padding: 1px 5px;
        border-radius: var(--r-xs);
        font-size: 11px;
        color: var(--accent);
      }
      .wl-empty-link { color: var(--accent); text-decoration: none; }
      .wl-empty-link:hover { text-decoration: underline; }

      .wl-paste-label {
        display: block;
        font-family: var(--font-mono);
        font-size: 10px;
        letter-spacing: 0.14em;
        color: var(--fg-faint);
        text-transform: uppercase;
        margin-bottom: 6px;
      }
      .wl-paste-area {
        width: 100%;
        min-height: 96px;
        padding: 10px 12px;
        background: var(--surface);
        border: 1px solid var(--border-subtle);
        border-radius: var(--r-md);
        color: var(--fg-bright);
        font-family: var(--font-mono);
        font-size: 12px;
        line-height: 1.55;
        outline: none;
        resize: vertical;
        transition: border-color var(--motion-fast) var(--ease);
      }
      .wl-paste-area::placeholder {
        color: var(--fg-faint);
        white-space: pre;
      }
      .wl-paste-area:focus { border-color: var(--accent); }
      .wl-paste-meta {
        margin-top: 8px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        font-family: var(--font-mono);
        font-size: 10.5px;
        color: var(--fg-faint);
      }
      .wl-paste-count { color: var(--fg-muted); }
      .wl-paste-hint {
        display: inline-flex;
        align-items: center;
        gap: 4px;
      }
      .wl-paste-hint code {
        font-family: var(--font-mono);
        background: var(--surface-3);
        padding: 0 4px;
        border-radius: 2px;
        color: var(--fg);
      }

      /* Table ---------------------------------------------------------- */
      .wl-table-wrap { overflow-x: auto; }
      .wl-table { width: 100%; }
      .wl-table th, .wl-table td {
        padding: 9px 10px;
        border-bottom: 1px solid var(--border-subtle);
      }
      .wl-table tbody tr.wl-row-selected {
        background: var(--accent-wash);
        box-shadow: inset 3px 0 0 var(--accent) !important;
      }

      .wl-th-check, .wl-td-check { width: 30px; text-align: center; padding: 9px 4px; }
      .wl-th-check input, .wl-td-check input {
        appearance: none;
        width: 14px;
        height: 14px;
        background: var(--surface-2);
        border: 1px solid var(--border);
        border-radius: var(--r-xs);
        cursor: pointer;
        position: relative;
        vertical-align: middle;
        transition: all var(--motion-fast) var(--ease);
      }
      .wl-th-check input:hover, .wl-td-check input:hover {
        border-color: var(--accent);
      }
      .wl-th-check input:checked, .wl-td-check input:checked {
        background: var(--accent);
        border-color: var(--accent);
      }
      .wl-th-check input:checked::after,
      .wl-td-check input:checked::after {
        content: "";
        position: absolute;
        inset: 1px;
        background: var(--bg);
        -webkit-mask-image: url(/icons/check.svg);
        mask-image: url(/icons/check.svg);
        -webkit-mask-size: contain;
        mask-size: contain;
        -webkit-mask-repeat: no-repeat;
        mask-repeat: no-repeat;
      }
      .wl-th-check input:indeterminate {
        background: var(--accent);
        border-color: var(--accent);
      }
      .wl-th-check input:indeterminate::after {
        content: "";
        position: absolute;
        left: 2px; right: 2px; top: 5px;
        height: 2px;
        background: var(--bg);
      }

      .wl-th-rank, .wl-td-rank { width: 36px; color: var(--fg-faint); }
      .wl-th-stars, .wl-td-stars { width: 90px; }
      .wl-th-delta { width: 80px; }
      .wl-th-vel { width: 110px; }
      .wl-th-ment { width: 200px; }
      .wl-th-fresh { width: 60px; text-align: center; }
      .wl-th-act { width: 84px; text-align: right; }

      .wl-repo-cell {
        display: flex;
        align-items: center;
        gap: 10px;
        min-width: 0;
      }
      .wl-repo-avatar {
        width: 24px;
        height: 24px;
        flex: 0 0 24px;
        display: grid;
        place-items: center;
      }
      .wl-repo-avatar-fallback {
        width: 24px; height: 24px;
        display: grid; place-items: center;
        background: var(--surface-3);
        color: var(--fg-faint);
        font-family: var(--font-mono);
        font-size: 9px;
        font-weight: 600;
        border-radius: var(--r-xs);
      }
      .wl-repo-id { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
      .wl-repo-name {
        font-family: var(--font-mono);
        font-size: 13px;
        color: var(--fg-bright);
        text-decoration: none;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        font-weight: 500;
      }
      .wl-repo-name:hover { color: var(--accent); }
      .wl-repo-owner { color: var(--fg-muted); font-weight: 400; }
      .wl-repo-lang {
        font-family: var(--font-mono);
        font-size: 10px;
        color: var(--fg-faint);
        display: inline-flex;
        align-items: center;
        gap: 5px;
      }
      .wl-lang-dot {
        width: 6px; height: 6px;
        border-radius: 50%;
        background: var(--info);
      }

      .wl-stars-v {
        font-family: var(--font-mono);
        color: var(--fg-bright);
        font-variant-numeric: tabular-nums;
      }
      .wl-delta {
        font-variant-numeric: tabular-nums;
        font-family: var(--font-mono);
      }
      .wl-delta-up { color: var(--up); }
      .wl-delta-dn { color: var(--down); }
      .wl-delta-fl { color: var(--fg-faint); }
      .wl-faint { color: var(--fg-faint); font-family: var(--font-mono); }

      .wl-td-act { text-align: right; }
      .wl-act-group {
        display: inline-flex;
        gap: 4px;
        justify-content: flex-end;
      }
      .wl-act-btn {
        width: 26px;
        height: 26px;
        display: inline-grid;
        place-items: center;
        background: var(--surface-2);
        border: 1px solid var(--border-subtle);
        border-radius: var(--r-xs);
        color: var(--fg-muted);
        cursor: pointer;
        text-decoration: none;
        transition: all var(--motion-fast) var(--ease);
      }
      .wl-act-btn:hover {
        color: var(--accent);
        border-color: var(--accent);
        background: var(--accent-wash);
      }
      .wl-act-btn.wl-act-danger:hover {
        color: var(--down);
        border-color: var(--down);
        background: var(--down-soft);
      }

      /* Sticky bulk-action footer ------------------------------------- */
      .wl-bulk-foot {
        position: sticky;
        bottom: 12px;
        margin: 16px -8px 0;
        padding: 10px 14px;
        background: var(--surface-3);
        border: 1px solid var(--accent-line);
        border-radius: var(--r-md);
        box-shadow: var(--overlay);
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 14px;
        animation: wl-bulk-in 180ms var(--ease);
      }
      @keyframes wl-bulk-in {
        from { opacity: 0; transform: translateY(8px); }
        to   { opacity: 1; transform: translateY(0); }
      }
      .wl-bulk-meta {
        display: flex;
        align-items: baseline;
        gap: 8px;
      }
      .wl-bulk-num {
        font-family: var(--font-mono);
        font-size: 18px;
        font-weight: 600;
        color: var(--accent);
        font-variant-numeric: tabular-nums;
        letter-spacing: -0.01em;
      }
      .wl-bulk-sub {
        font-family: var(--font-mono);
        font-size: 11px;
        color: var(--fg-muted);
        letter-spacing: 0.06em;
        text-transform: uppercase;
      }
      .wl-bulk-actions {
        display: flex;
        gap: 6px;
      }
      .wl-bulk-btn {
        gap: 5px;
      }
      .wl-bulk-danger:hover {
        background: var(--down-soft) !important;
        border-color: var(--down) !important;
        color: var(--down) !important;
      }

      /* Responsive ------------------------------------------------------ */
      @media (max-width: 1100px) {
        .wl-th-ment, .wl-th-fresh { display: none; }
        .wl-table tbody td:nth-child(8),
        .wl-table tbody td:nth-child(9) { display: none; }
      }
      @media (max-width: 820px) {
        .wl-th-vel { display: none; }
        .wl-table tbody td:nth-child(7) { display: none; }
        .wl-add-input { min-width: 180px; }
      }
      @media (max-width: 640px) {
        .wl-empty-v2 { grid-template-columns: 1fr; }
        .wl-empty-glyph { width: 48px; height: 48px; }
      }
    `}</style>
  );
}
