"use client";

// Topbar — global. Client component because of search + share interactivity.
// Renders crumbs, live search bar with dropdown, share menu, avatar button.

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/icon/Icon";
import { ArrowUpRight } from "@/lib/icons";
import { matchNavCommands, type NavCommand } from "@/lib/nav-commands";

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
  // Static fallback while the Clerk-backed TopbarAuthChip is loading.
  // Matches the chip's signed-out layout (single primary Sign up) so the
  // topbar doesn't flicker on hydration.
  return (
    <Link href="/sign-up" className="btn primary sm" aria-label="Sign up">
      Sign up
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

type Hit =
  | { kind: "page"; item: NavCommand }
  | { kind: "repo"; item: RepoHit }
  | { kind: "llm"; item: LlmHit };

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

  // Instant, client-side page matches — the "Pages" tier. No fetch, so
  // ⌘K + "funding" jumps to the page even before repo results land.
  const pageHits = useMemo(() => matchNavCommands(query), [query]);

  // Flat ordered hit list for keyboard navigation: pages first (instant,
  // deterministic), then repos, then LLMs. This order MUST match the render
  // order in SearchDropdown so activeIdx lines up across sections.
  const hits = useMemo<Hit[]>(() => {
    const pages: Hit[] = pageHits.map((item) => ({ kind: "page" as const, item }));
    const repos: Hit[] = results
      ? results.repos.map((item) => ({ kind: "repo" as const, item }))
      : [];
    const llms: Hit[] = results
      ? results.llms.map((item) => ({ kind: "llm" as const, item }))
      : [];
    return [...pages, ...repos, ...llms];
  }, [pageHits, results]);

  const navigateToHit = useCallback(
    (hit: Hit) => {
      setOpen(false);
      setQuery("");
      if (hit.kind === "page") {
        router.push(hit.item.href);
      } else if (hit.kind === "repo") {
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
    open &&
    query.trim().length >= MIN_QUERY &&
    (loading || results !== null || pageHits.length > 0);

  useEffect(() => {
    const el = dropdownRef.current;
    if (!showDropdown || !anchorRect || !el) return;
    el.style.setProperty("--search-dropdown-top", `${anchorRect.bottom + 6}px`);
    el.style.setProperty("--search-dropdown-left", `${anchorRect.left}px`);
    el.style.setProperty("--search-dropdown-width", `${anchorRect.width}px`);
  }, [anchorRect, showDropdown]);

  return (
    <header className="topbar">
      <button className="hamburger" data-toggle="sidebar" aria-label="Toggle sidebar">
        <Icon name="menu" size="lg" />
      </button>

      <div className="topbar-left">
        {crumbs && crumbs.length > 0 ? (
          <nav className="crumbs">
            {crumbs.map((c, i) => {
              const last = i === crumbs.length - 1;
              const sep = i > 0 ? <span className={`sep${c.sub ? " crumb-sub" : ""}`}>/</span> : null;
              const label = last ? <b>{c.label}</b> : c.href ? <Link href={c.href}>{c.label}</Link> : <span className={c.sub ? "crumb-sub" : undefined}>{c.label}</span>;
              return (
                <span key={`${c.label}-${i}`} className="crumb-part">
                  {sep}
                  {label}
                </span>
              );
            })}
          </nav>
        ) : (
          <nav className="crumbs" aria-hidden="true" />
        )}
      </div>

      <div ref={wrapRef} className="searchbar">
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
          role="combobox"
          aria-label="Search"
          aria-autocomplete="list"
          aria-controls="global-search-dropdown"
          aria-expanded={showDropdown}
        />
        <kbd>⌘K</kbd>

        {showDropdown && (
          <SearchDropdown
            loading={loading}
            results={results}
            pageHits={pageHits}
            activeIdx={activeIdx}
            anchorRect={anchorRect}
            panelRef={dropdownRef}
            onHover={setActiveIdx}
            onPick={navigateToHit}
          />
        )}
      </div>

      <div className="topbar-actions">
        <Link href="/drop" className="btn topbar-drop sm" aria-label="Drop a repo">
          <Icon name="download" size="sm" />
          <span className="topbar-drop-label">Drop a repo</span>
        </Link>
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
  pageHits: NavCommand[];
  activeIdx: number;
  anchorRect: DOMRect | null;
  panelRef: React.RefObject<HTMLDivElement | null>;
  onHover: (idx: number) => void;
  onPick: (hit: Hit) => void;
}

function SearchDropdown({ loading, results, pageHits, activeIdx, anchorRect, panelRef, onHover, onPick }: SearchDropdownProps) {
  if (typeof document === "undefined" || !anchorRect) return null;

  const hasPages = pageHits.length > 0;
  const repos = results?.repos ?? [];
  const llms = results?.llms ?? [];
  const hasResults = repos.length > 0 || llms.length > 0;

  const wrap = (children: React.ReactNode) =>
    createPortal(
      <div id="global-search-dropdown" ref={panelRef} className="search-dropdown" role="listbox">
        {children}
      </div>,
      document.body,
    );

  // Repo/LLM fetch in flight and nothing instant to show yet.
  if (loading && !results && !hasPages) {
    return wrap(<div className="search-empty">Searching…</div>);
  }
  // Fetch returned empty AND no page matches.
  if (!hasPages && results && !hasResults) {
    return wrap(
      <div className="search-empty">
        No results for <b>{results.query}</b>
      </div>,
    );
  }
  // Nothing to render at all.
  if (!hasPages && !hasResults) return null;

  // runningIdx MUST advance in the same order as the `hits` array in Topbar
  // (pages, repos, llms) so keyboard activeIdx maps to the right row.
  let runningIdx = 0;
  return wrap(
    <>
      {hasPages && (
        <>
          <SectionHeader label="Pages" count={pageHits.length} />
          {pageHits.map((cmd) => {
            const idx = runningIdx++;
            return (
              <PageRow
                key={cmd.id}
                cmd={cmd}
                active={idx === activeIdx}
                onMouseEnter={() => onHover(idx)}
                onClick={() => onPick({ kind: "page", item: cmd })}
              />
            );
          })}
        </>
      )}
      {repos.length > 0 && (
        <>
          <SectionHeader label="Repos" count={results?.totals?.repos ?? repos.length} />
          {repos.map((repo) => {
            const idx = runningIdx++;
            return (
              <RepoRow
                key={repo.fullName}
                repo={repo}
                active={idx === activeIdx}
                onMouseEnter={() => onHover(idx)}
                onClick={() => onPick({ kind: "repo", item: repo })}
              />
            );
          })}
        </>
      )}
      {llms.length > 0 && (
        <>
          <SectionHeader label="LLMs" count={results?.totals?.llms ?? llms.length} />
          {llms.map((llm) => {
            const idx = runningIdx++;
            return (
              <LlmRow
                key={llm.slug}
                llm={llm}
                active={idx === activeIdx}
                onMouseEnter={() => onHover(idx)}
                onClick={() => onPick({ kind: "llm", item: llm })}
              />
            );
          })}
        </>
      )}
    </>,
  );
}

function PageRow({ cmd, active, onMouseEnter, onClick }: { cmd: NavCommand; active: boolean; onMouseEnter: () => void; onClick: () => void }) {
  return (
    <button
      type="button"
      onMouseEnter={onMouseEnter}
      onClick={onClick}
      className={`search-row${active ? " is-active" : ""}`}
    >
      <span className="search-row-avatar search-row-avatar-fallback">
        <ArrowUpRight size={13} strokeWidth={1.8} aria-hidden="true" />
      </span>
      <span className="search-row-body">
        <span className="search-row-title">{cmd.label}</span>
        <span className="search-row-subtitle">Jump to page</span>
      </span>
      <span className="search-row-meta">{cmd.group}</span>
    </button>
  );
}

function SectionHeader({ label, count }: { label: string; count: number }) {
  return (
    <div className="search-section-head">
      <span>{label}</span>
      <span>{count}</span>
    </div>
  );
}

function RepoRow({ repo, active, onMouseEnter, onClick }: { repo: RepoHit; active: boolean; onMouseEnter: () => void; onClick: () => void }) {
  return (
    <button
      type="button"
      onMouseEnter={onMouseEnter}
      onClick={onClick}
      className={`search-row${active ? " is-active" : ""}`}
    >
      {repo.ownerAvatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={repo.ownerAvatarUrl}
          alt=""
          width={20}
          height={20}
          className="search-row-avatar"
          loading="lazy"
          decoding="async"
        />
      ) : (
        <span className="search-row-avatar search-row-avatar-fallback" />
      )}
      <span className="search-row-body">
        <span className="search-row-title">
          {repo.fullName}
        </span>
        {repo.description && (
          <span className="search-row-subtitle">
            {repo.description}
          </span>
        )}
      </span>
      <span className="search-row-meta">
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
      className={`search-row${active ? " is-active" : ""}`}
    >
      <span className="search-row-avatar search-row-ai">
        AI
      </span>
      <span className="search-row-body">
        <span className="search-row-title">
          {llm.name}
        </span>
        <span className="search-row-subtitle">
          {llm.creator}
        </span>
      </span>
      {typeof llm.intelligenceIndex === "number" && (
        <span className="search-row-meta">
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
