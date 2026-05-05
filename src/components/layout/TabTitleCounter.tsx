"use client";

// AGN-612 — Browser-tab live counter
//
// Mirrors gmail/slack: prefixes <title> with `(N)` when there are unread
// alerts so users glancing at their browser tabs see new activity without
// switching focus.
//
// Data source: /api/pipeline/alerts?unreadOnly=true — same poll the
// BrowserAlertBridge uses (30s cadence, plus an immediate refresh on
// window focus). Falls back silently when unauthenticated or offline; the
// title just stays un-prefixed in that case.
//
// Implementation notes:
//   - Sits at the root layout under <body> (rendered alongside the other
//     bridges) so the counter persists across route changes. Each page may
//     still call `document.title = "..."` in its own useEffect; this
//     component re-applies the `(N)` prefix on every poll, on focus, and
//     on a MutationObserver firing for <title> changes — so per-page
//     titles are preserved while the counter rides on top.
//   - When count is 0 the prefix is removed.
//   - Counts above 99 render as `(99+)` to keep the tab compact.

import { useEffect, useRef } from "react";

const POLL_INTERVAL_MS = 30_000;
const PREFIX_PATTERN = /^\((\d{1,2}\+?|\d{1,2})\)\s+/;

interface AlertsResponse {
  ok: boolean;
  unreadCount?: number;
}

function formatPrefix(count: number): string {
  if (count <= 0) return "";
  const display = count > 99 ? "99+" : String(count);
  return `(${display}) `;
}

function applyPrefix(prefix: string): void {
  if (typeof document === "undefined") return;
  const current = document.title;
  const stripped = current.replace(PREFIX_PATTERN, "");
  const next = prefix + stripped;
  if (next !== current) {
    document.title = next;
  }
}

export function TabTitleCounter() {
  const countRef = useRef(0);
  // Guard the MutationObserver against feedback loops: when this component
  // re-applies the prefix it is the one mutating <title>, and we don't want
  // to recurse.
  const applyingRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const apply = () => {
      applyingRef.current = true;
      applyPrefix(formatPrefix(countRef.current));
      // The mutation completes synchronously on document.title assignment,
      // but flip the flag in a microtask so the observer's callback (which
      // queues asynchronously) sees it.
      queueMicrotask(() => {
        applyingRef.current = false;
      });
    };

    const fetchUnread = async () => {
      try {
        const res = await fetch(
          "/api/pipeline/alerts?unreadOnly=true",
          {
            cache: "no-store",
            credentials: "include",
          },
        );
        if (!res.ok) return;
        const data = (await res.json()) as AlertsResponse;
        const next =
          typeof data.unreadCount === "number" && Number.isFinite(data.unreadCount)
            ? Math.max(0, Math.floor(data.unreadCount))
            : 0;
        if (next !== countRef.current) {
          countRef.current = next;
          apply();
        }
      } catch {
        // Non-fatal — leave the existing count in place.
      }
    };

    // Re-apply the prefix when other code (e.g. per-page useEffects that
    // do `document.title = "Foo — TrendingRepo"`) overwrites <title>.
    const titleEl = document.querySelector("title");
    let observer: MutationObserver | null = null;
    if (titleEl) {
      observer = new MutationObserver(() => {
        if (applyingRef.current) return;
        if (countRef.current <= 0) return;
        apply();
      });
      observer.observe(titleEl, { childList: true, characterData: true, subtree: true });
    }

    void fetchUnread();
    const intervalId = window.setInterval(() => {
      void fetchUnread();
    }, POLL_INTERVAL_MS);

    const onFocus = () => {
      if (document.hidden) return;
      void fetchUnread();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
      observer?.disconnect();
      // Strip the prefix on unmount so a stale "(3)" doesn't survive.
      countRef.current = 0;
      apply();
    };
  }, []);

  return null;
}
