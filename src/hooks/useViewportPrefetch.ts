"use client";

import { useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/**
 * AGN-1782 — Viewport-triggered route prefetch.
 *
 * Returns an `observe(href, el)` ref-callback. When the element scrolls within
 * ~100px of the viewport, the hook calls `router.prefetch(href)` exactly once
 * for that href.
 *
 * Bounded concurrency:
 * - Each `prefetch()` call resolves synchronously in Next.js (no flush hook
 *   exposed), so we approximate "in-flight" by treating the most recent
 *   `MAX_IN_FLIGHT` prefetches as active and queueing further requests.
 *   In practice this caps how many prefetches we kick off per scroll burst.
 *
 * Save-Data:
 * - When `navigator.connection.saveData` is true we no-op completely. This is
 *   cheap to re-check but stable for a given session, so we read it once on
 *   mount.
 */

const ROOT_MARGIN = "100px";
const MAX_IN_FLIGHT = 5;
const FLIGHT_RELEASE_MS = 600;

interface NavigatorConnection {
  saveData?: boolean;
}

function readSaveData(): boolean {
  if (typeof navigator === "undefined") return false;
  const conn = (navigator as Navigator & { connection?: NavigatorConnection })
    .connection;
  return Boolean(conn?.saveData);
}

export function useViewportPrefetch(): (href: string, el: Element | null) => void {
  const router = useRouter();
  const observerRef = useRef<IntersectionObserver | null>(null);
  // href -> element currently observed
  const elByHrefRef = useRef<Map<string, Element>>(new Map());
  // element -> href lookup (IO callback gives us the element)
  const hrefByElRef = useRef<WeakMap<Element, string>>(new WeakMap());
  // already-prefetched hrefs — never refetch
  const prefetchedRef = useRef<Set<string>>(new Set());
  // queued hrefs waiting for a flight slot
  const queueRef = useRef<string[]>([]);
  const inFlightRef = useRef<number>(0);
  const saveDataRef = useRef<boolean>(false);

  // Drain queued hrefs while we have capacity. Each drain releases the slot
  // after FLIGHT_RELEASE_MS (an approximation — Next.js prefetch is fire-and-
  // forget at the hook boundary).
  const drain = useCallback(() => {
    while (
      inFlightRef.current < MAX_IN_FLIGHT &&
      queueRef.current.length > 0
    ) {
      const href = queueRef.current.shift();
      if (!href || prefetchedRef.current.has(href)) continue;
      prefetchedRef.current.add(href);
      inFlightRef.current += 1;
      try {
        router.prefetch(href);
      } catch {
        // Swallow — prefetch is best-effort.
      }
      window.setTimeout(() => {
        inFlightRef.current = Math.max(0, inFlightRef.current - 1);
        drain();
      }, FLIGHT_RELEASE_MS);
    }
  }, [router]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (typeof IntersectionObserver === "undefined") return;
    saveDataRef.current = readSaveData();
    if (saveDataRef.current) return;

    // Capture refs locally so the cleanup closure is independent of mutations
    // to the *.current pointers between mount and unmount.
    const elByHref = elByHrefRef.current;
    const queue = queueRef.current;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const href = hrefByElRef.current.get(entry.target);
          if (!href) continue;
          // Stop watching once seen — single-shot per card.
          io.unobserve(entry.target);
          elByHref.delete(href);
          if (prefetchedRef.current.has(href)) continue;
          if (queue.includes(href)) continue;
          queue.push(href);
          drain();
        }
      },
      { rootMargin: ROOT_MARGIN },
    );
    observerRef.current = io;

    return () => {
      io.disconnect();
      observerRef.current = null;
      elByHref.clear();
      queue.length = 0;
      inFlightRef.current = 0;
    };
  }, [drain]);

  return useCallback((href: string, el: Element | null) => {
    if (saveDataRef.current) return;
    if (!href) return;
    if (prefetchedRef.current.has(href)) return;
    const io = observerRef.current;
    if (!io) return;

    // Element unmount: stop tracking the previous element for this href.
    const prevEl = elByHrefRef.current.get(href);
    if (prevEl && prevEl !== el) {
      io.unobserve(prevEl);
      elByHrefRef.current.delete(href);
    }

    if (!el) return;
    if (prevEl === el) return;

    hrefByElRef.current.set(el, href);
    elByHrefRef.current.set(href, el);
    io.observe(el);
  }, []);
}
