"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ROUTES } from "@/lib/constants";
import { SearchBar } from "@/components/shared/SearchBar";
import { HamburgerButton } from "@/components/layout/HamburgerButton";

// Same shape as Sidebar.tsx's useUserSession — duplicated here so the
// Header can hide/show the profile chip independently of the rail.
function useUserSession(): { loaded: boolean; userId: string | null } {
  const [state, setState] = useState<{ loaded: boolean; userId: string | null }>(
    { loaded: false, userId: null },
  );
  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/session", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { ok: false }))
      .then((data: { ok?: boolean; userId?: string }) => {
        if (cancelled) return;
        setState({
          loaded: true,
          userId: data?.ok && data.userId ? data.userId : null,
        });
      })
      .catch(() => {
        if (!cancelled) setState({ loaded: true, userId: null });
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return state;
}

function avatarInitials(userId: string): string {
  // Public IDs look like `a_xxx` / `u_xxx` — strip the prefix so the
  // chip shows the meaningful first 2 chars of the handle.
  const trimmed = userId.replace(/^[au]_/, "");
  return trimmed.slice(0, 2).toUpperCase();
}

export function Header() {
  const { userId } = useUserSession();

  return (
    <header className="topbar">
      <div className="topbar-shimmer" aria-hidden="true"></div>

      <HamburgerButton />

      <Link
        href={ROUTES.HOME}
        className="brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-accent focus-visible:rounded"
        aria-label="TrendingRepo home"
      >
        <div className="brand-mark" aria-hidden="true">
          <i className="tk tl"></i>
          <i className="tk tr"></i>
          <i className="tk bl"></i>
          <i className="tk br"></i>
          <span className="glow"></span>
          <svg viewBox="0 0 64 64" fill="none" aria-hidden="true">
            <path
              d="M27 14 L31.7 25.6 L44 27 L34.5 35.2 L37.2 47.5 L27 41.2 L16.8 47.5 L19.5 35.2 L10 27 L22.3 25.6 Z"
              fill="#ff6b35"
            />
            <path
              d="M31.5 26.2 L58 22 L33.2 30.5 Z"
              fill="#ff6b35"
            />
          </svg>
        </div>
        <div className="brand-stack">
          <div className="brand-row">
            <span className="brand-name">
              TRENDING<span className="accent">REPO</span>
            </span>
            <span className="brand-beta">BETA</span>
          </div>
          <div className="brand-sub">
            {"// "}
            <b>OPEN SOURCE</b>
            {" · LIVE"}
          </div>
        </div>
      </Link>

      <div className="search-wrap">
        <SearchBar placeholder="search repos, skills, MCPs…" fullWidth />
        <span className="key" aria-hidden="true">
          <kbd>{'⌘'}</kbd>
          <kbd>K</kbd>
        </span>
      </div>

      <div className="topbar-actions">
        <Link
          href={ROUTES.SUBMIT}
          className="btn-drop focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-accent focus-visible:rounded"
          title="Submit a repo for tracking"
          aria-label="Drop your repo"
        >
          <svg
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M14 2 L7 9"></path>
            <path d="M14 2 L9.5 14 L7 9 L2 6.5 Z" fill="#190902"></path>
          </svg>
          <span>DROP REPO</span>
          <span className="arr" aria-hidden="true">-&gt;</span>
        </Link>

        {userId ? (
          <>
            <span className="tb-div" aria-hidden="true"></span>
            <Link
              href={`/u/${userId}`}
              className="profile focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-accent focus-visible:rounded"
              title="Profile"
              aria-label="Profile"
            >
              <div className="av">{avatarInitials(userId)}</div>
            </Link>
          </>
        ) : (
          <>
            <span className="tb-div" aria-hidden="true"></span>
            <Link
              href="/sign-in"
              className="btn-signin focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-accent focus-visible:rounded"
              title="Sign in"
            >
              Sign in
            </Link>
            <Link
              href="/sign-up"
              className="btn-signup focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-accent focus-visible:rounded"
              title="Sign up"
            >
              <span>Sign up</span>
              <span className="arr" aria-hidden="true">-&gt;</span>
            </Link>
          </>
        )}
      </div>
    </header>
  );
}
