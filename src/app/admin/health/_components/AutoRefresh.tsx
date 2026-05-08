"use client";

// Tiny client island for /admin/health. Calls router.refresh() every
// `intervalMs` so the parent server component re-reads the meta
// sidecars and renders the latest tier/age values without operator
// interaction. We deliberately avoid setInterval-with-fetch — letting
// the App Router handle the refetch keeps caching semantics consistent
// with the initial render.
//
// The hook also pauses while the tab is hidden (visibilityState !==
// "visible"), so a parked dashboard tab doesn't burn cycles refreshing
// HTML nobody is looking at.

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export function AutoRefresh({ intervalMs }: { intervalMs: number }) {
  const router = useRouter();
  const [lastTick, setLastTick] = useState<number>(() => Date.now());

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;

    const schedule = () => {
      timer = setTimeout(() => {
        if (
          typeof document === "undefined" ||
          document.visibilityState === "visible"
        ) {
          router.refresh();
          setLastTick(Date.now());
        }
        schedule();
      }, intervalMs);
    };

    schedule();
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [intervalMs, router]);

  return (
    <p
      aria-live="polite"
      className="mt-6 text-[10px] tracking-[0.18em] uppercase"
      style={{ color: "var(--v4-ink-400, #6b7280)" }}
    >
      {"// auto-refresh every "}
      {Math.round(intervalMs / 1000)}
      {"s · last tick "}
      {new Date(lastTick).toISOString().slice(11, 19)}
      {"Z"}
    </p>
  );
}
