"use client";

// Topbar — global. Client component because of search + share interactivity.
// Renders crumbs, 4 hero pillar tabs, search bar, share menu, avatar button.
// Active pillar derived from pathname.

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { HeroPillarLink } from "./NavLink";
import {
  Activity,
  BarChart3,
  Lightbulb,
  Menu,
  TrendingUp,
} from "@/lib/icons";

export interface Crumb {
  label: string;
  href?: string;
  sub?: boolean;
}

interface TopbarProps {
  crumbs?: Crumb[];
}

export function Topbar({ crumbs }: TopbarProps) {
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  // ⌘K / Ctrl+K opens search
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
        setTimeout(() => searchRef.current?.focus(), 10);
      } else if (e.key === "Escape") {
        setSearchOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <header className="topbar">
      <button className="hamburger" data-toggle="sidebar" aria-label="Toggle sidebar">
        <Menu size={16} strokeWidth={1.6} aria-hidden="true" />
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
        <nav className="crumbs">
          <b>TrendingRepo</b>
        </nav>
      )}

      <nav className="topbar-tabs" aria-label="Hero pillars">
        <HeroPillarLink href="/" pillar="trending" match="/">
          <span className="tab-glyph">
            <TrendingUp size={16} strokeWidth={1.7} aria-hidden="true" />
          </span>
          <span>Trending</span>
        </HeroPillarLink>
        <HeroPillarLink href="/ideas" pillar="ideas">
          <span className="tab-glyph">
            <Lightbulb size={16} strokeWidth={1.7} aria-hidden="true" />
          </span>
          <span>Ideas</span>
        </HeroPillarLink>
        <HeroPillarLink href="/build" pillar="build">
          <span className="tab-glyph">
            <BarChart3 size={16} strokeWidth={1.7} aria-hidden="true" />
          </span>
          <span>Build</span>
        </HeroPillarLink>
        <HeroPillarLink href="/market-signals" pillar="signals" match="/market-signals">
          <span className="tab-glyph">
            <Activity size={16} strokeWidth={1.7} aria-hidden="true" />
          </span>
          <span>Market Signals</span>
        </HeroPillarLink>
      </nav>

      <form
        className="searchbar"
        action="/search"
        method="get"
        onSubmit={(e) => {
          const v = (searchRef.current?.value || "").trim();
          if (!v) e.preventDefault();
        }}
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="7" cy="7" r="4.5" />
          <path d="M11 11l3 3" />
        </svg>
        <input
          ref={searchRef}
          name="q"
          placeholder="Search repos, mentions, owners, models…"
          autoComplete="off"
          aria-label="Search"
        />
        <kbd>⌘K</kbd>
      </form>

      <div className="topbar-actions">
        <div className="share-wrap">
          <button className="share-btn" type="button" aria-label="Share">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="4" cy="8" r="2" />
              <circle cx="12" cy="4" r="2" />
              <circle cx="12" cy="12" r="2" />
              <path d="M6 7l4-2M6 9l4 2" />
            </svg>
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
        <Link className="icon-btn" href="/account?tab=alerts" aria-label="Alerts">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M3 12V8a5 5 0 0110 0v4l1 2H2l1-2zM6 14a2 2 0 004 0" />
          </svg>
        </Link>
        <Link className="avatar-btn" href="/account" aria-label="MK account">
          <span className="avatar">MK</span>
          <span style={{ display: "none" }} className="avatar-name">
            You
          </span>
        </Link>
      </div>

      {/* ⌘K helper — basic for now, enhance later */}
      {searchOpen && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setSearchOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(8,9,10,0.74)",
            backdropFilter: "blur(8px)",
            zIndex: 1000,
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "center",
            padding: "100px 20px 20px",
          }}
        >
          <form
            action="/search"
            method="get"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(640px, 100%)",
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              padding: 4,
              display: "flex",
            }}
          >
            <input
              autoFocus
              name="q"
              placeholder="Search repos, mentions, owners, models…"
              aria-label="Search"
              style={{
                flex: 1,
                background: "transparent",
                border: 0,
                outline: 0,
                color: "var(--fg-bright)",
                padding: "14px 16px",
                fontSize: 15,
                fontFamily: "var(--font-sans)",
              }}
            />
            <button
              type="submit"
              style={{
                padding: "0 18px",
                background: "var(--accent)",
                color: "#0a0a0a",
                fontWeight: 700,
                borderRadius: 4,
                border: 0,
              }}
            >
              Search
            </button>
          </form>
        </div>
      )}
    </header>
  );
}
