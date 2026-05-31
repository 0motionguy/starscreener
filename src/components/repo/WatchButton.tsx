"use client";

// WatchButton — wires the watch action to the persisted Zustand watchlist
// slice. React owns the active-state class flip (shell.js has no opinions
// about it for this element).
//
// Variants:
//   - "watch" (default) — heart icon + "Watch" / "Watching" label, optional
//     baseline-watcher pill. Used by repo cards and the live-leaderboard
//     row actions.
//   - "compact" — icon-only (bookmark glyph) for legacy reaction rows.
//     No text label, no count pill.
//   - "hero" — bookmark icon + "Save" label + optional baseline-watchers
//     count pill. Lives on the `.pf-react` family so it lines up with the
//     heart + unicorn + comments siblings in the /repo/[owner]/[name]
//     hero engage row. Mirrors the PF Profile standalone reference.
//
// All variants share the same Zustand `toggleWatch` underneath, so a click
// in any place lands the repo in `/watchlist` and the sidebar WATCHING
// group.
//
// Auth gate: watching is a personal feature, so an anonymous click bounces to
// the Clerk sign-in page (preserving the current URL via redirect_url) instead
// of silently writing guest-only local state. We detect auth with
// useClientSession (an anonymous-safe /api/auth/session fetch) rather than a
// Clerk hook, because WatchButton renders on ISR-cached PUBLIC surfaces (home
// cards, leaderboards) where ClerkProvider is not guaranteed to be mounted —
// rendering a Clerk component there is the 2026-05-15 prod-crash footgun.

import { useEffect, useState } from "react";
import type { CSSProperties } from "react";

import { useWatchlistStore } from "@/lib/store";
import { useClientSession } from "@/lib/hooks/useClientSession";
import { HeartIcon } from "@/components/icons-animated";
import { Icon } from "@/components/icon/Icon";

function signInHref(): string {
  if (typeof window === "undefined") return "/sign-in";
  const here = window.location.pathname + window.location.search;
  return `/sign-in?redirect_url=${encodeURIComponent(here)}`;
}

type WatchButtonVariant = "watch" | "compact" | "hero";

interface WatchButtonProps {
  repoId: string;
  fullName: string;
  stars: number;
  /** Optional baseline watcher count surfaced from server (e.g., aggregate). */
  baselineWatchers?: number | null;
  /** Visual variant. Default `"watch"` preserves the legacy behavior. */
  variant?: WatchButtonVariant;
}

export function WatchButton({
  repoId,
  fullName,
  stars,
  baselineWatchers,
  variant = "watch",
}: WatchButtonProps) {
  // Avoid hydration mismatch — only read the store after mount.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const watched = useWatchlistStore((s) =>
    mounted ? s.isWatched(repoId) : false,
  );
  const toggle = useWatchlistStore((s) => s.toggleWatch);

  // Anonymous-safe session probe (cached app-wide; loaded early by the root
  // PostHog bridge). Only redirect when we're certain the visitor is signed
  // out — if the probe hasn't resolved yet, fall through to the local toggle
  // rather than interrupting a legitimate signed-in click.
  const { loaded: sessionLoaded, userId } = useClientSession();
  const signedOut = sessionLoaded && !userId;

  const onClick = () => {
    if (signedOut) {
      window.location.assign(signInHref());
      return;
    }
    toggle(repoId, stars, fullName);
  };

  if (variant === "compact") {
    return (
      <button
        type="button"
        className={`pf-react watchlist${watched ? " is-active" : ""}`}
        style={
          { ["--reaction-on" as string]: "var(--accent)" } as CSSProperties
        }
        data-watch-toggle
        aria-pressed={watched}
        aria-label={watched ? "In your watchlist" : "Add to watchlist"}
        onClick={onClick}
      >
        <Icon name={watched ? "bookmark-fill" : "bookmark"} size={14} className="gly" />
      </button>
    );
  }

  if (variant === "hero") {
    // Hero variant — bookmark icon + "Save" + optional count. Used in the
    // /repo/[owner]/[name] PF engage row alongside heart and unicorn
    // siblings. We render the baseline count only when the server passes
    // one through; the per-user toggle's optimistic delta is folded in
    // client-side. No baseline => no count badge (honest empty-state, per
    // the design-system honesty rule).
    const baseCount =
      typeof baselineWatchers === "number" && baselineWatchers >= 0
        ? baselineWatchers
        : null;
    const displayCount =
      baseCount === null ? null : baseCount + (watched ? 1 : 0);

    return (
      <button
        type="button"
        className={`pf-react bookmark${watched ? " is-active" : ""}`}
        style={
          { ["--reaction-on" as string]: "var(--accent)" } as CSSProperties
        }
        data-watch-toggle
        aria-pressed={watched}
        aria-label={watched ? "Saved to your watchlist" : "Save to your watchlist"}
        onClick={onClick}
      >
        <Icon
          name={watched ? "bookmark-fill" : "bookmark"}
          size={14}
          className="gly"
        />
        <span>Save</span>
        {displayCount !== null ? (
          <span className="count" aria-hidden="true">
            {displayCount.toLocaleString()}
          </span>
        ) : null}
      </button>
    );
  }

  const label = watched ? "Watching" : "Watch";

  return (
    <button
      type="button"
      className={`watch-btn${watched ? " on" : ""}`}
      data-watch-toggle
      aria-pressed={watched}
      onClick={onClick}
    >
      <HeartIcon
        className="heart"
        size={14}
        strokeWidth={1.5}
        color={watched ? "var(--accent)" : "currentColor"}
        aria-hidden="true"
      />
      {label}
      {typeof baselineWatchers === "number" && baselineWatchers > 0 ? (
        <span
          style={{
            marginLeft: 4,
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            opacity: 0.75,
          }}
        >
          · {baselineWatchers.toLocaleString()}
        </span>
      ) : null}
    </button>
  );
}
