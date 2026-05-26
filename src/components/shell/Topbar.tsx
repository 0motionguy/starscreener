"use client";

// Topbar — global. Client component because of search + share interactivity.
// Renders crumbs, live search bar with dropdown, share menu, avatar button.

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/icon/Icon";

export interface Crumb {
  label: string;
  href?: string;
  sub?: boolean;
}

interface TopbarProps {
  crumbs?: Crumb[];
  // Server-resolved Boolean(clerkPublishableKey) from the root layout. Gates
  // the Clerk-backed account chip so it never mounts without a ClerkProvider.
  authEnabled?: boolean;
}

function TopbarSignInLink() {
  return (
    <Link href="/sign-in" className="btn primary sm" aria-label="Sign in">
      Sign in
    </Link>
  );
}

const TopbarAuthChip = dynamic(
  () =>
    import("@/components/shell/TopbarAuthChip").then((mod) => mod.TopbarAuthChip),
  { ssr: false, loading: () => <TopbarSignInLink /> },
);

interface RepoHit {
  fullName: string;
  name: string;
  owner: string;
  description: string | null;
  stars: number;
  language: string | null;
  ownerAvatarUrl: string | null;
}

interface LlmHit {
  slug: string;
  name: string;
  creator: string;
  intelligenceIndex: number | null;
}

interface SearchResponse {
  ok: boolean;
  query: string;
  repos: RepoHit[];
  llms: LlmHit[];
  totals?: { repos: number; llms: number };
}

type Hit = { kind: "repo"; item: RepoHit } | { kind: "llm"; item: LlmHit };

const DEBOUNCE_MS = 180;
const MIN_QUERY = 1;

export function Topbar({ crumbs, authEnabled = false }: TopbarProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Recompute dropdown anchor whenever the searchbar moves (scroll, resize)
  // or the dropdown is about to open.
  useEffect(() => {
    if (!open) return;
    function measure() {
      if (wrapRef.current) setAnchorRect(wrapRef.current.getBoundingClientRect());
    }
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [open]);

  // ⌘K / Ctrl+K focuses the search.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
        setOpen(true);
      } else if (e.key === "Escape") {
        setOpen(false);
        searchRef.current?.blur();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Click outside closes the dropdown. The dropdown is portal'd to
  // document.body so we must check BOTH the wrapper and the portal'd panel
  // — otherwise mousedown on a result row registers as "outside", closes
  // the dropdown, and unmounts the button before its click handler fires.
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      const target = e.target as Node | null;
      if (!target) return;
      if (wrapRef.current?.contains(target)) return;
      if (dropdownRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  // Debounced fetch on query change.
  useEffect(() => {
    const q = query.trim();
    if (q.length < MIN_QUERY) {
      setResults(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const handle = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/search/global?q=${encodeURIComponent(q)}`,
          { cache: "no-store" },
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as SearchResponse;
        if (!cancelled) {
          setResults(data);
          setActiveIdx(0);
        }
      } catch {
        if (!cancelled) setResults({ ok: false, query: q, repos: [], llms: [] });
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [query]);

  // Flat ordered hit list for keyboard navigation.
  const hits = useMemo<Hit[]>(() => {
    if (!results) return [];
    return [
      ...results.repos.map((item) => ({ kind: "repo" as const, item })),
      ...results.llms.map((item) => ({ kind: "llm" as const, item })),
    ];
  }, [results]);

  const navigateToHit = useCallback(
    (hit: Hit) => {
      setOpen(false);
      setQuery("");
      if (hit.kind === "repo") {
        router.push(`/repo/${hit.item.fullName}`);
      } else {
        router.push(`/?cat=llms#${encodeURIComponent(hit.item.slug)}`);
      }
    },
    [router],
  );

  function onInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActiveIdx((i) => (hits.length === 0 ? 0 : (i + 1) % hits.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => (hits.length === 0 ? 0 : (i - 1 + hits.length) % hits.length));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const hit = hits[activeIdx];
      if (hit) navigateToHit(hit);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const showDropdown =
    open && query.trim().length >= MIN_QUERY && (loading || results !== null);

  return (
    <header className="topbar">
      <button className="hamburger" data-toggle="sidebar" aria-label="Toggle sidebar">
        <Icon name="menu" size="lg" />
      </button>

      {crumbs && crumbs.length > 0 ? (
        <nav className="crumbs">
          {crumbs.map((c, i) => {
            const last = i === crumbs.length - 1;
            const sep = i > 0 ? <span className={`sep${c.sub ? " crumb-sub" : ""}`}>/</span> : null;
            const label = last ? <b>{c.label}</b> : c.href ? <Link href={c.href}>{c.label}</Link> : <span className={c.sub ? "crumb-sub" : undefined}>{c.label}</span>;
            return (
              <span key={`${c.label}-${i}`} style={{ display: "contents" }}>
                {sep}
                {label}
              </span>
            );
          })}
        </nav>
      ) : (
        <nav className="crumbs" aria-hidden="true" />
      )}

      <div ref={wrapRef} className="searchbar" style={{ position: "relative" }}>
        <Icon name="search" size="md" />
        <input
          ref={searchRef}
          name="q"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onInputKeyDown}
          placeholder="Search repos, mentions, owners, models…"
          autoComplete="off"
          aria-label="Search"
          aria-autocomplete="list"
          aria-expanded={showDropdown}
        />
        <kbd>⌘K</kbd>

        {showDropdown && (
          <SearchDropdown
            loading={loading}
            results={results}
            activeIdx={activeIdx}
            anchorRect={anchorRect}
            panelRef={dropdownRef}
            onHover={setActiveIdx}
            onPick={navigateToHit}
            hits={hits}
          />
        )}
      </div>

      <div className="topbar-actions">
        <div className="share-wrap">
          <button className="share-btn" type="button" aria-label="Share">
            <Icon name="share" size="sm" />
            Share
          </button>
          <div className="share-menu">
            <div className="item x" data-share="x">
              <span className="sm-ico">𝕏</span>Share to X
            </div>
            <div className="item li" data-share="li">
              <span className="sm-ico">in</span>Share to LinkedIn
            </div>
            <div className="item rd" data-share="rd">
              <span className="sm-ico">R</span>Share to Reddit
            </div>
            <div className="item bs" data-share="bs">
              <span className="sm-ico">⌁</span>Share to Bluesky
            </div>
            <div className="divider" />
            <div className="item cp" data-share="cp">
              <span className="sm-ico">⌧</span>Copy link
            </div>
            <div className="item em" data-share="em">
              <span className="sm-ico">&lt;/&gt;</span>Embed widget<span className="pro-tag">PRO</span>
            </div>
          </div>
        </div>
        {authEnabled ? <TopbarAuthChip /> : <TopbarSignInLink />}
      </div>
    </header>
  );
}

interface SearchDropdownProps {
  loading: boolean;
  results: SearchResponse | null;
  hits: Hit[];
  activeIdx: number;
  anchorRect: DOMRect | null;
  panelRef: React.RefObject<HTMLDivElement | null>;
  onHover: (idx: number) => void;
  onPick: (hit: Hit) => void;
}

function SearchDropdown({ loading, results, hits, activeIdx, anchorRect, panelRef, onHover, onPick }: SearchDropdownProps) {
  if (typeof document === "undefined" || !anchorRect) return null;

  const panelStyle: React.CSSProperties = {
    position: "fixed",
    top: anchorRect.bottom + 6,
    left: anchorRect.left,
    width: anchorRect.width,
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: 6,
    boxShadow: "0 18px 40px rgba(0,0,0,0.55)",
    zIndex: 5000,
    maxHeight: 480,
    overflowY: "auto",
    padding: 4,
  };

  if (loading && !results) {
    return createPortal(
      <div ref={panelRef} style={panelStyle} role="listbox">
        <div style={emptyStyle}>Searching…</div>
      </div>,
      document.body,
    );
  }

  if (results && results.repos.length === 0 && results.llms.length === 0) {
    return createPortal(
      <div ref={panelRef} style={panelStyle} role="listbox">
        <div style={emptyStyle}>
          No results for <b>{results.query}</b>
        </div>
      </div>,
      document.body,
    );
  }

  if (!results) return null;

  let runningIdx = 0;
  return createPortal(
    <div ref={panelRef} style={panelStyle} role="listbox">
      {results.repos.length > 0 && (
        <>
          <SectionHeader label="Repos" count={results.totals?.repos ?? results.repos.length} />
          {results.repos.map((repo) => {
            const idx = runningIdx++;
            const active = idx === activeIdx;
            return (
              <RepoRow
                key={repo.fullName}
                repo={repo}
                active={active}
                onMouseEnter={() => onHover(idx)}
                onClick={() => onPick({ kind: "repo", item: repo })}
              />
            );
          })}
        </>
      )}
      {results.llms.length > 0 && (
        <>
          <SectionHeader label="LLMs" count={results.totals?.llms ?? results.llms.length} />
          {results.llms.map((llm) => {
            const idx = runningIdx++;
            const active = idx === activeIdx;
            return (
              <LlmRow
                key={llm.slug}
                llm={llm}
                active={active}
                onMouseEnter={() => onHover(idx)}
                onClick={() => onPick({ kind: "llm", item: llm })}
              />
            );
          })}
        </>
      )}
    </div>,
    document.body,
  );
}

const emptyStyle: React.CSSProperties = {
  padding: "16px 14px",
  color: "var(--fg-dim)",
  fontSize: 13,
  fontFamily: "var(--font-sans)",
};

function SectionHeader({ label, count }: { label: string; count: number }) {
  return (
    <div
      style={{
        padding: "10px 12px 6px",
        fontSize: 10,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        color: "var(--fg-dim)",
        fontWeight: 700,
        display: "flex",
        justifyContent: "space-between",
      }}
    >
      <span>{label}</span>
      <span>{count}</span>
    </div>
  );
}

function rowStyle(active: boolean): React.CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 10px",
    borderRadius: 4,
    cursor: "pointer",
    background: active ? "var(--surface-hi, rgba(255,255,255,0.06))" : "transparent",
    color: "var(--fg-bright)",
    fontFamily: "var(--font-sans)",
    fontSize: 13,
    lineHeight: 1.3,
  };
}

function RepoRow({ repo, active, onMouseEnter, onClick }: { repo: RepoHit; active: boolean; onMouseEnter: () => void; onClick: () => void }) {
  return (
    <button
      type="button"
      onMouseEnter={onMouseEnter}
      onClick={onClick}
      style={{ ...rowStyle(active), border: 0, width: "100%", textAlign: "left" }}
    >
      {repo.ownerAvatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={repo.ownerAvatarUrl}
          alt=""
          width={20}
          height={20}
          style={{ borderRadius: 4, flex: "0 0 20px" }}
          loading="lazy"
          decoding="async"
        />
      ) : (
        <span style={{ width: 20, height: 20, borderRadius: 4, background: "var(--border)", flex: "0 0 20px" }} />
      )}
      <span style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
        <span style={{ display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontWeight: 600 }}>
          {repo.fullName}
        </span>
        {repo.description && (
          <span style={{ display: "block", color: "var(--fg-dim)", fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {repo.description}
          </span>
        )}
      </span>
      <span style={{ color: "var(--fg-dim)", fontSize: 12, flex: "0 0 auto" }}>
        {formatStars(repo.stars)}★
      </span>
    </button>
  );
}

function LlmRow({ llm, active, onMouseEnter, onClick }: { llm: LlmHit; active: boolean; onMouseEnter: () => void; onClick: () => void }) {
  return (
    <button
      type="button"
      onMouseEnter={onMouseEnter}
      onClick={onClick}
      style={{ ...rowStyle(active), border: 0, width: "100%", textAlign: "left" }}
    >
      <span style={{ width: 20, height: 20, borderRadius: 4, background: "var(--border)", color: "var(--fg-bright)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, flex: "0 0 20px" }}>
        AI
      </span>
      <span style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
        <span style={{ display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontWeight: 600 }}>
          {llm.name}
        </span>
        <span style={{ display: "block", color: "var(--fg-dim)", fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {llm.creator}
        </span>
      </span>
      {typeof llm.intelligenceIndex === "number" && (
        <span style={{ color: "var(--fg-dim)", fontSize: 12, flex: "0 0 auto" }}>
          II {llm.intelligenceIndex}
        </span>
      )}
    </button>
  );
}

function formatStars(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return String(n);
}
