"use client";

// WatchlistClient — interactive board for /tools/watchlist.
//
// Reads the persisted Zustand watchlist store (`useWatchlistStore`, the
// SAME store used by the in-row `<WatchButton>` everywhere else in the app
// so pins added on /trending immediately show up here) and renders one row
// per pinned repo. Each row joins the persisted `repoId` against the
// server-provided `reposById` map so we get live stars + deltas + mentions
// + alert flags from the trending pipeline.
//
// Server-rendered chrome (Hero, Suggestions) is the parent; this component
// is the one boundary that needs 'use client' because Zustand persist is
// browser-only.
//
// Empty / not-yet-hydrated path: render a soft empty state pointing at the
// suggestions strip below. We gate on a mount flag so SSR + first paint
// don't show "0 pins" before the store finishes rehydrating from
// localStorage (which would flash a misleading empty state).

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";

import { useWatchlistStore } from "@/lib/store";
import type { Repo, WatchlistItem } from "@/lib/types";
import { slugToId } from "@/lib/utils";

interface WatchlistClientProps {
  /** Server-provided lookup of every tracked repo, keyed by `slugToId(fullName)`. */
  reposById: Record<string, Repo>;
}

interface JoinedRow {
  item: WatchlistItem;
  repo: Repo | null;
  fullName: string;
  owner: string;
  name: string;
}

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

/**
 * Resolve a pinned watchlist item back to a live Repo. Tries the canonical
 * repoId key first; falls through to a fullName-derived id when the
 * persisted store was seeded with a different id scheme.
 */
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

/**
 * Returns the most relevant breakout-style flag for the row, or null when
 * the repo is in a calm regime. Drives the `.wl-flag` pill.
 */
function detectFlag(repo: Repo | null): { label: string; tone: "hot" | "warn" } | null {
  if (!repo) return null;
  if (repo.movementStatus === "breakout") return { label: "BREAKOUT", tone: "hot" };
  if (repo.movementStatus === "hot") return { label: "HOT", tone: "hot" };
  if (repo.tags?.includes("momentum-spike")) {
    return { label: "MOMENTUM SPIKE", tone: "hot" };
  }
  if (repo.movementStatus === "quiet_killer") {
    return { label: "QUIET KILLER", tone: "warn" };
  }
  if ((repo.channelsFiring ?? 0) >= 4) {
    return { label: `${repo.channelsFiring} CHANNELS`, tone: "warn" };
  }
  return null;
}

interface MentionPipsProps {
  repo: Repo | null;
}

/**
 * Compact 6-pip row mirroring the cross-signal channel dots used on the
 * trending table. Stays muted when there's no rollup so the row layout
 * stays predictable even pre-hydration.
 */
function MentionPips({ repo }: MentionPipsProps) {
  const status = repo?.channelStatus ?? null;
  const channels: Array<{ key: keyof NonNullable<Repo["channelStatus"]>; label: string }> = [
    { key: "github", label: "GH" },
    { key: "reddit", label: "RD" },
    { key: "hn", label: "HN" },
    { key: "bluesky", label: "BS" },
    { key: "devto", label: "DV" },
    { key: "twitter", label: "X" },
  ];
  const total = repo?.mentions?.total7d ?? null;
  return (
    <div className="wl-pips" aria-label="cross-source mentions">
      {channels.map((c) => {
        const on = status ? status[c.key] : false;
        return (
          <span
            key={c.key}
            className={`wl-pip ${on ? "on" : ""}`}
            title={`${c.label} ${on ? "firing" : "quiet"}`}
            aria-hidden="true"
          />
        );
      })}
      <span className="wl-pip-count">
        {total === null || total === undefined
          ? "—"
          : `${total} m/7d`}
      </span>
    </div>
  );
}

export function WatchlistClient({ reposById }: WatchlistClientProps) {
  // Mount gate — Zustand persist rehydrates from localStorage AFTER the
  // first client render. Reading `repos` before then yields the SSR value
  // (empty), which would flash a misleading empty state.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const repos = useWatchlistStore((s) => s.repos);
  const removeRepo = useWatchlistStore((s) => s.removeRepo);
  const addRepo = useWatchlistStore((s) => s.addRepo);

  // Mirror the rendered pin count into the hero pill so the server-rendered
  // "—" gets replaced with the live count on hydration.
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

  // Add-repo inline input. Accepts `owner/name` or a full github URL.
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const raw = draft.trim();
    if (!raw) return;
    // Strip a leading https://github.com/ if pasted as a URL.
    const cleaned = raw
      .replace(/^https?:\/\/(www\.)?github\.com\//i, "")
      .replace(/\.git$/i, "")
      .replace(/\/$/, "");
    const parts = cleaned.split("/").filter(Boolean);
    if (parts.length < 2) {
      setError("Use owner/name (e.g. vercel/next.js).");
      return;
    }
    const fullName = `${parts[0]}/${parts[1]}`;
    const id = slugToId(fullName);
    const live = reposById[id] ?? null;
    addRepo(id, live?.stars ?? 0, fullName);
    setDraft("");
    inputRef.current?.blur();
  };

  return (
    <section className="wl-board" aria-labelledby="wl-board-head">
      <WatchlistClientStyles />

      <div className="wl-eyebrow">
        <span className="num">{"// 01"}</span>
        <span className="title" id="wl-board-head">
          Your watchlist
        </span>
        <span className="meta">
          <b>{mounted ? rows.length : "—"}</b> pinned &middot; stored locally
        </span>
      </div>

      <form className="wl-add" onSubmit={handleSubmit} role="search">
        <label htmlFor="wl-add-input" className="wl-add-label">
          Add repo
        </label>
        <input
          id="wl-add-input"
          ref={inputRef}
          type="text"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            if (error) setError(null);
          }}
          placeholder="owner/name (e.g. vercel/next.js)"
          autoComplete="off"
          spellCheck={false}
          className="wl-add-input"
        />
        <button type="submit" className="wl-add-btn">
          Pin
        </button>
        {error ? (
          <span className="wl-add-error" role="alert">
            {error}
          </span>
        ) : null}
      </form>

      {!mounted ? (
        <div className="wl-skel" aria-hidden="true">
          <span className="wl-skel-line" />
          <span className="wl-skel-line" />
          <span className="wl-skel-line" />
        </div>
      ) : rows.length === 0 ? (
        <div className="wl-empty">
          <div className="wl-empty-icon" aria-hidden="true">
            ◌
          </div>
          <div className="wl-empty-body">
            <div className="wl-empty-title">Suggested pins ready</div>
            <p className="wl-empty-sub">
              Drop an <code>owner/name</code> into the box above, or pin
              one of the curated suggestions below. Every repo tracks live
              stars, deltas, mentions, and breakout flags.
            </p>
          </div>
        </div>
      ) : (
        <ul className="wl-rows">
          {rows.map((row) => {
            const { item, repo, fullName, owner, name } = row;
            const flag = detectFlag(repo);
            const href =
              owner && name
                ? `/repo/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`
                : "/account";
            const d24 = repo?.starsDelta24h ?? null;
            const d7 = repo?.starsDelta7d ?? null;
            return (
              <li key={item.repoId} className="wl-row">
                <div className="wl-row-avatar" aria-hidden="true">
                  {repo?.ownerAvatarUrl ? (
                    <Image
                      src={repo.ownerAvatarUrl}
                      alt=""
                      width={28}
                      height={28}
                      unoptimized
                      style={{
                        borderRadius: 2,
                        objectFit: "cover",
                        display: "block",
                      }}
                    />
                  ) : (
                    <span className="wl-row-avatar-fallback">
                      {(owner || fullName).slice(0, 2).toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="wl-row-id">
                  <Link href={href} prefetch={false} className="wl-row-name">
                    <span className="muted">{owner}/</span>
                    {name}
                  </Link>
                  <span className="wl-row-sub">
                    {repo?.language ?? "—"}
                    {flag ? null : repo ? (
                      <>
                        {" "}
                        &middot; {repo.movementStatus.replace(/_/g, " ")}
                      </>
                    ) : (
                      <> &middot; resolving…</>
                    )}
                  </span>
                </div>
                <div className="wl-row-stars">
                  <span className="wl-stars-num">{formatStars(repo?.stars)}</span>
                  <span className="wl-stars-lbl">★</span>
                </div>
                <div className="wl-row-delta">
                  <span className={`wl-delta-num ${deltaClass(d24)}`}>
                    {formatSignedDelta(d24)}
                  </span>
                  <span className="wl-delta-lbl">24h</span>
                </div>
                <div className="wl-row-delta">
                  <span className={`wl-delta-num ${deltaClass(d7)}`}>
                    {formatSignedDelta(d7)}
                  </span>
                  <span className="wl-delta-lbl">7d</span>
                </div>
                <div className="wl-row-pips">
                  <MentionPips repo={repo} />
                </div>
                <div className="wl-row-flag">
                  {flag ? (
                    <span className={`wl-flag ${flag.tone}`}>{flag.label}</span>
                  ) : (
                    <span className="wl-flag-empty">—</span>
                  )}
                </div>
                <button
                  type="button"
                  className="wl-remove"
                  onClick={() => removeRepo(item.repoId)}
                  aria-label={`Remove ${fullName} from watchlist`}
                >
                  Remove
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function WatchlistClientStyles() {
  return (
    <style>{`
      .wl-board {
        background: var(--surface);
        border: 1px solid var(--border-subtle);
        border-radius: var(--r-1);
        padding: 14px 16px 16px;
        margin-top: 16px;
      }
      .wl-eyebrow {
        display: flex;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
      }
      .wl-eyebrow .num {
        font-family: var(--font-mono);
        font-size: 11px;
        color: var(--accent);
        letter-spacing: 0.10em;
        font-weight: 600;
      }
      .wl-eyebrow .title {
        font-size: 13.5px;
        color: var(--fg-bright);
        font-weight: 500;
      }
      .wl-eyebrow .meta {
        margin-left: auto;
        font-family: var(--font-mono);
        font-size: 10.5px;
        color: var(--fg-faint);
      }
      .wl-eyebrow .meta b { color: var(--fg); font-weight: 500; }

      /* Add-repo input ---------------------------------------------------- */
      .wl-add {
        display: grid;
        grid-template-columns: auto 1fr auto;
        align-items: center;
        gap: 8px;
        margin-top: 12px;
        padding: 10px 12px;
        background: var(--surface-2);
        border: 1px solid var(--border-subtle);
        border-radius: var(--r-1);
      }
      .wl-add-label {
        font-family: var(--font-mono);
        font-size: 10px;
        color: var(--fg-faint);
        letter-spacing: 0.10em;
        text-transform: uppercase;
      }
      .wl-add-input {
        height: 30px;
        padding: 0 10px;
        background: var(--surface);
        border: 1px solid var(--border-subtle);
        border-radius: 2px;
        color: var(--fg-bright);
        font-family: var(--font-mono);
        font-size: 12px;
        outline: none;
        transition: border-color var(--d-fast) var(--ease);
      }
      .wl-add-input::placeholder { color: var(--fg-faint); }
      .wl-add-input:focus { border-color: var(--accent); }
      .wl-add-btn {
        height: 30px;
        padding: 0 14px;
        background: var(--accent);
        color: var(--bg);
        border: 0;
        border-radius: 2px;
        font-family: var(--font-mono);
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        cursor: pointer;
        transition: opacity var(--d-fast) var(--ease);
      }
      .wl-add-btn:hover { opacity: 0.88; }
      .wl-add-error {
        grid-column: 2 / 4;
        font-family: var(--font-mono);
        font-size: 10.5px;
        color: var(--down);
      }

      /* Skeleton (pre-hydration) ----------------------------------------- */
      .wl-skel { margin-top: 12px; display: flex; flex-direction: column; gap: 6px; }
      .wl-skel-line {
        display: block;
        height: 42px;
        background: linear-gradient(90deg, var(--surface-2) 0%, var(--surface-3) 50%, var(--surface-2) 100%);
        background-size: 200% 100%;
        animation: wl-skel-shimmer 1.4s ease-in-out infinite;
        border-radius: 2px;
        opacity: 0.55;
      }
      .wl-skel-line:nth-child(2) { opacity: 0.40; }
      .wl-skel-line:nth-child(3) { opacity: 0.30; }
      @keyframes wl-skel-shimmer {
        0% { background-position: 200% 0; }
        100% { background-position: -200% 0; }
      }

      /* Empty state ------------------------------------------------------- */
      .wl-empty {
        margin-top: 14px;
        display: grid;
        grid-template-columns: 48px 1fr;
        gap: 14px;
        align-items: start;
        padding: 22px 18px;
        background: var(--surface-2);
        border: 1px dashed var(--border-subtle);
        border-radius: var(--r-1);
      }
      .wl-empty-icon {
        font-size: 32px;
        color: var(--fg-faint);
        font-family: var(--font-mono);
        line-height: 1;
      }
      .wl-empty-title {
        font-family: var(--font-mono);
        font-size: 13px;
        color: var(--fg-bright);
        margin-bottom: 4px;
      }
      .wl-empty-sub {
        margin: 0;
        font-size: 12px;
        color: var(--fg-muted);
        max-width: 60ch;
        line-height: 1.55;
      }
      .wl-empty-sub code {
        font-family: var(--font-mono);
        background: var(--surface-3);
        padding: 1px 5px;
        border-radius: 2px;
        font-size: 11px;
        color: var(--accent);
      }

      /* Rows --------------------------------------------------------------- */
      .wl-rows {
        list-style: none;
        margin: 12px 0 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 1px;
        background: var(--border-subtle);
        border: 1px solid var(--border-subtle);
        border-radius: var(--r-1);
        overflow: hidden;
      }
      .wl-row {
        display: grid;
        grid-template-columns: 36px minmax(0, 1.6fr) minmax(80px, 0.9fr) minmax(72px, 0.7fr) minmax(72px, 0.7fr) minmax(0, 1.4fr) minmax(96px, 0.9fr) 78px;
        align-items: center;
        gap: 12px;
        padding: 10px 14px;
        background: var(--surface);
        transition: background var(--d-fast) var(--ease);
      }
      .wl-row:hover { background: var(--surface-2); }
      .wl-row-avatar { width: 28px; height: 28px; display: grid; place-items: center; }
      .wl-row-avatar-fallback {
        width: 28px; height: 28px;
        display: grid; place-items: center;
        background: var(--surface-3);
        color: var(--fg-faint);
        font-family: var(--font-mono);
        font-size: 10px;
        font-weight: 600;
        border-radius: 2px;
      }
      .wl-row-id { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
      .wl-row-name {
        font-family: var(--font-mono);
        font-size: 12.5px;
        color: var(--fg-bright);
        text-decoration: none;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .wl-row-name:hover { color: var(--accent); }
      .wl-row-name .muted { color: var(--fg-muted); }
      .wl-row-sub {
        font-family: var(--font-mono);
        font-size: 10.5px;
        color: var(--fg-faint);
        text-transform: lowercase;
      }
      .wl-row-stars { display: flex; align-items: baseline; gap: 4px; justify-content: flex-end; }
      .wl-stars-num {
        font-family: var(--font-mono);
        font-size: 13px;
        color: var(--fg-bright);
        font-variant-numeric: tabular-nums;
      }
      .wl-stars-lbl { color: var(--fg-faint); font-size: 11px; }
      .wl-row-delta { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; }
      .wl-delta-num {
        font-family: var(--font-mono);
        font-size: 12px;
        font-variant-numeric: tabular-nums;
      }
      .wl-delta-num.up { color: var(--up); }
      .wl-delta-num.dn { color: var(--down); }
      .wl-delta-num.fl { color: var(--fg-faint); }
      .wl-delta-lbl {
        font-family: var(--font-mono);
        font-size: 9px;
        letter-spacing: 0.08em;
        color: var(--fg-faint);
        text-transform: uppercase;
      }

      .wl-row-pips { min-width: 0; }
      .wl-pips { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
      .wl-pip {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--surface-3);
        border: 1px solid var(--border-subtle);
      }
      .wl-pip.on { background: var(--accent); border-color: var(--accent); }
      .wl-pip-count {
        margin-left: 6px;
        font-family: var(--font-mono);
        font-size: 10px;
        color: var(--fg-faint);
        font-variant-numeric: tabular-nums;
      }

      .wl-row-flag { display: flex; align-items: center; }
      .wl-flag {
        display: inline-block;
        padding: 2px 7px;
        border-radius: 2px;
        font-family: var(--font-mono);
        font-size: 9.5px;
        font-weight: 700;
        letter-spacing: 0.10em;
        text-transform: uppercase;
        color: var(--bg);
      }
      .wl-flag.hot { background: var(--accent); }
      .wl-flag.warn { background: var(--up); }
      .wl-flag-empty {
        font-family: var(--font-mono);
        font-size: 10px;
        color: var(--fg-faint);
      }

      .wl-remove {
        justify-self: end;
        padding: 5px 10px;
        background: transparent;
        border: 1px solid var(--border-subtle);
        border-radius: 2px;
        color: var(--fg-faint);
        font-family: var(--font-mono);
        font-size: 10px;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        cursor: pointer;
        transition: all var(--d-fast) var(--ease);
      }
      .wl-remove:hover {
        color: var(--down);
        border-color: var(--down);
      }

      @media (max-width: 1100px) {
        .wl-row {
          grid-template-columns: 28px minmax(0, 1fr) auto auto;
          grid-template-areas:
            "avatar id stars remove"
            ".      sub delta delta7"
            ".      pips pips flag";
          row-gap: 6px;
        }
        .wl-row-avatar { grid-area: avatar; }
        .wl-row-id { grid-area: id; }
        .wl-row-stars { grid-area: stars; justify-content: flex-end; }
        .wl-row-delta:nth-of-type(1) { grid-area: delta; }
        .wl-row-delta:nth-of-type(2) { grid-area: delta7; }
        .wl-row-pips { grid-area: pips; }
        .wl-row-flag { grid-area: flag; justify-content: flex-end; }
        .wl-remove { grid-area: remove; }
      }
    `}</style>
  );
}
