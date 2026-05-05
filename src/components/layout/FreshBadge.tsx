"use client";

import { useEffect, useRef, useState } from "react";
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

export function formatAge(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return "--";
  if (seconds < 60) return "live";
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

export function buildBadgeLabel(status: HealthStatus, scraperAgeSeconds: number | null): string {
  if (status === "error") return "--";
  const age = formatAge(scraperAgeSeconds);
  if (status === "stale") {
    return age === "--" ? "STALE" : `STALE / ${age}`;
  }
  return age === "--" ? "FRESH" : `FRESH / ${age}`;
}

const POLL_INTERVAL_ERROR_MS = 30_000;
const POLL_INTERVAL_STALE_MS = 60_000;
const POLL_INTERVAL_FAST_SOURCE_OK_MS = 5 * 60_000;

export function getPollIntervalMs(snap: HealthSnapshot | null): number {
  if (snap === null) return POLL_INTERVAL_STALE_MS;
  if (snap.status === "error") return POLL_INTERVAL_ERROR_MS;
  if (snap.status === "stale") return POLL_INTERVAL_STALE_MS;
  // Fastest source cadence on this badge is hourly (GitHub/Reddit/HN/Bluesky/Lobsters).
  // Polling every 5 minutes is enough to catch freshness changes without 60s churn.
  return POLL_INTERVAL_FAST_SOURCE_OK_MS;
}

export function FreshBadge() {
  const [snap, setSnap] = useState<HealthSnapshot | null>(null);
  const latestSnapRef = useRef<HealthSnapshot | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      if (typeof document !== "undefined" && document.hidden) return;
      try {
        const res = await fetch("/api/health?soft=1", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (!cancelled) {
          const nextSnap = normalizeHealth(json);
          latestSnapRef.current = nextSnap;
          setSnap(nextSnap);
        }
      } catch {
        if (!cancelled) {
          const errorSnap = { status: "error", ageSeconds: EMPTY_AGES } satisfies HealthSnapshot;
          latestSnapRef.current = errorSnap;
          setSnap(errorSnap);
        }
      }
      if (!cancelled) {
        timer = setTimeout(tick, getPollIntervalMs(latestSnapRef.current));
      }
    };

    tick();
    const onVisibility = () => {
      if (document.hidden) return;
      void tick();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      if (timer !== null) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  if (snap === null) {
    return (
      <div
        className="pill hidden w-[92px] md:inline-flex"
        aria-hidden="true"
      />
    );
  }

  const status = snap.status;
  const scraperSec = readAge(snap, "scraper");

  const { label, dotClass, textClass } = (() => {
    if (status === "error") {
      return {
        label: buildBadgeLabel(status, scraperSec),
        dotClass: "bg-[var(--ink-500)]",
        textClass: "text-[var(--ink-500)]",
      };
    }
    if (status === "stale") {
      return {
        label: buildBadgeLabel(status, scraperSec),
        dotClass: "bg-[var(--sig-amber)]",
        textClass: "text-[var(--sig-amber)]",
      };
    }
    return {
      label: buildBadgeLabel(status, scraperSec),
      dotClass: "bg-[var(--sig-green)]",
      textClass: "text-[var(--sig-green)]",
    };
  })();

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
        "pill live hidden md:inline-flex",
        "font-mono text-[11px] uppercase tracking-wider",
      )}
      title={`Data freshness\n${tooltip}`}
      aria-label={`Data freshness: ${label}`}
    >
      <span
        className={cn(
          "dot inline-block",
          dotClass,
          status === "ok" && "animate-pulse",
        )}
        aria-hidden="true"
      />
      <span className={textClass}>{label}</span>
    </div>
  );
}
