"use client";

/**
 * FreshBadge — header-mounted "is the firehose live?" indicator.
 *
 * Polls /api/health once on mount and then every 60s. The pill shows the
 * age of the GitHub scrape (the main user-visible data path) and tints
 * based on the endpoint's overall `status`:
 *   - ok     → green dot, "LIVE · 4m"
 *   - stale  → amber dot, "STALE · 2h"    (any source past its SLO)
 *   - error  → muted dot, "—"             (endpoint errored)
 *
 * Hover surfaces the per-source ages so ops can sanity-check which
 * feed is cold without leaving the page.
 */

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type HealthStatus = "ok" | "stale" | "error";

interface AgeSeconds {
  scraper: number | null;
  deltas: number | null;
  reddit: number | null;
  bluesky: number | null;
  hn: number | null;
  producthunt: number | null;
  devto: number | null;
  lobsters: number | null;
}

interface HealthSnapshot {
  status: HealthStatus;
  /**
   * Per-source ages. APP-12 strips this object from `/api/health?soft=1`
   * for unauthorized callers, so it can be missing entirely — every
   * read goes through `readAge()` which returns null when absent.
   */
  ageSeconds?: AgeSeconds;
}

const EMPTY_AGES: AgeSeconds = {
  scraper: null,
  deltas: null,
  reddit: null,
  bluesky: null,
  hn: null,
  producthunt: null,
  devto: null,
  lobsters: null,
};

export function readAge(snap: HealthSnapshot, key: keyof AgeSeconds): number | null {
  return snap.ageSeconds?.[key] ?? null;
}

function isHealthStatus(value: unknown): value is HealthStatus {
  return value === "ok" || value === "stale" || value === "error";
}

/** Coerce any health-shaped JSON into a safe HealthSnapshot. */
export function normalizeHealth(raw: unknown): HealthSnapshot {
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const status = isHealthStatus(obj.status) ? obj.status : "error";
  const ages = obj.ageSeconds && typeof obj.ageSeconds === "object"
    ? (obj.ageSeconds as Partial<AgeSeconds>)
    : null;
  return {
    status,
    ageSeconds: ages
      ? {
          scraper: typeof ages.scraper === "number" ? ages.scraper : null,
          deltas: typeof ages.deltas === "number" ? ages.deltas : null,
          reddit: typeof ages.reddit === "number" ? ages.reddit : null,
          bluesky: typeof ages.bluesky === "number" ? ages.bluesky : null,
          hn: typeof ages.hn === "number" ? ages.hn : null,
          producthunt: typeof ages.producthunt === "number" ? ages.producthunt : null,
          devto: typeof ages.devto === "number" ? ages.devto : null,
          lobsters: typeof ages.lobsters === "number" ? ages.lobsters : null,
        }
      : undefined,
  };
}

/**
 * Pretty-print a second count as "4m" / "2h" / "3d". Returns "—"
 * when input is null so the UI never shows NaN.
 */
export function formatAge(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return "—";
  if (seconds < 60) return "live";
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

const POLL_INTERVAL_MS = 60_000;

export function FreshBadge() {
  const [snap, setSnap] = useState<HealthSnapshot | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const tick = async () => {
      try {
        const res = await fetch("/api/health?soft=1", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (!cancelled) setSnap(normalizeHealth(json));
      } catch {
        if (!cancelled) {
          setSnap({ status: "error", ageSeconds: EMPTY_AGES });
        }
      }
    };

    tick();
    timer = setInterval(tick, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      if (timer !== null) clearInterval(timer);
    };
  }, []);

  // Skeleton while the first fetch is in flight — same width as the
  // populated state so the header doesn't shift.
  if (snap === null) {
    return (
      <div
        className="hidden md:inline-flex h-8 w-[92px] items-center justify-center rounded-card border border-border-primary bg-bg-secondary"
        aria-hidden="true"
      />
    );
  }

  const status = snap.status;
  const scraperSec = readAge(snap, "scraper");

  const { label, dotClass, textClass } = (() => {
    if (status === "error") {
      return {
        label: "—",
        dotClass: "bg-text-muted",
        textClass: "text-text-muted",
      };
    }
    if (status === "stale") {
      return {
        label: `STALE · ${formatAge(scraperSec)}`,
        dotClass: "bg-warning",
        textClass: "text-warning",
      };
    }
    return {
      label: `LIVE · ${formatAge(scraperSec)}`,
      dotClass: "bg-functional",
      textClass: "text-functional",
    };
  })();

  // Tooltip — every age read goes through `readAge()` so the
  // unauthorized `/api/health?soft=1` shape (which has no
  // `ageSeconds`) renders "—" instead of crashing the React tree.
  const tooltip = [
    ["GitHub", readAge(snap, "scraper")],
    ["Reddit", readAge(snap, "reddit")],
    ["HN", readAge(snap, "hn")],
    ["Bluesky", readAge(snap, "bluesky")],
    ["ProductHunt", readAge(snap, "producthunt")],
    ["dev.to", readAge(snap, "devto")],
    ["Lobsters", readAge(snap, "lobsters")],
  ]
    .map(([k, s]) => `${k}: ${formatAge(s as number | null)}`)
    .join("\n");

  return (
    <div
      className={cn(
        "hidden md:inline-flex h-8 items-center gap-2 rounded-card",
        "border border-border-primary bg-bg-secondary px-3",
        "font-mono text-[11px] uppercase tracking-wider",
      )}
      title={`Data freshness\n${tooltip}`}
      aria-label={`Data freshness: ${label}`}
    >
      <span
        className={cn(
          "inline-block h-1.5 w-1.5 rounded-full",
          dotClass,
          status === "ok" && "animate-pulse",
        )}
        aria-hidden="true"
      />
      <span className={textClass}>{label}</span>
    </div>
  );
}
