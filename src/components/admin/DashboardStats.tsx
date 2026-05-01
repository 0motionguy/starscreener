"use client";

// DashboardStats — three at-a-glance tiles for the admin dashboard:
//
//   Tile A: GitHub API rate limit (remaining/limit + reset clock).
//   Tile B: Which staleness signals are flipping the global STALE banner.
//   Tile C: Disk usage of .data/ and data/.
//
// Data source: GET /api/admin/stats (cookie-auth admin route).

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface RateLimit {
  remaining: number | null;
  limit: number | null;
  resetAt: string | null;
}

interface StaleSignals {
  scraper: boolean;
  deltas: boolean;
  hotCollections: boolean;
  recentRepos: boolean;
  repoMetadata: boolean;
  collectionRankings: boolean;
  worstAgeSeconds: number | null;
  lastFetchedAt: string | null;
}

interface DiskUsage {
  hiddenDataBytes: number;
  publicDataBytes: number;
  totalBytes: number;
}

interface StatsResponse {
  ok: true;
  rateLimit: RateLimit;
  staleSignals: StaleSignals;
  diskUsage: DiskUsage;
}

const SIGNAL_LABELS: Record<keyof Omit<StaleSignals, "worstAgeSeconds" | "lastFetchedAt">, string> = {
  scraper: "scraper",
  deltas: "deltas",
  hotCollections: "hot collections",
  recentRepos: "recent repos",
  repoMetadata: "repo metadata",
  collectionRankings: "collection rankings",
};

function formatAge(seconds: number | null): string {
  if (seconds === null) return "n/a";
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

function formatBytes(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatResetTime(iso: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function rateLimitColor(remaining: number | null): string {
  if (remaining === null) return "text-text-muted";
  if (remaining < 500) return "text-[var(--v4-red)]";
  if (remaining < 1000) return "text-[var(--v4-amber)]";
  return "text-[var(--v4-money)]";
}

function Tile({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="v2-card p-3">
      <div className="text-xs uppercase tracking-wide text-text-muted">{label}</div>
      {children}
    </div>
  );
}

export default function DashboardStats() {
  const router = useRouter();
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/admin/stats", {
          credentials: "include",
          cache: "no-store",
        });
        if (res.status === 401) {
          router.push("/admin/login?next=/admin");
          return;
        }
        if (!res.ok) {
          if (!cancelled) {
            setError(`HTTP ${res.status}`);
            setLoading(false);
          }
          return;
        }
        const data = (await res.json()) as StatsResponse;
        if (!cancelled) {
          setStats(data);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load stats");
          setLoading(false);
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {["GitHub API", "Stale signals", "Data dirs"].map((label) => (
          <Tile key={label} label={label}>
            <div className="mt-1 h-6 w-24 animate-pulse rounded bg-bg-muted" />
            <div className="mt-2 h-3 w-32 animate-pulse rounded bg-bg-muted" />
          </Tile>
        ))}
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {["GitHub API", "Stale signals", "Data dirs"].map((label) => (
          <Tile key={label} label={label}>
            <div className="mt-1 text-lg font-semibold text-text-muted">—</div>
            <div className="mt-1 text-xs text-text-muted">
              {error ?? "no data"}
            </div>
          </Tile>
        ))}
      </div>
    );
  }

  const { rateLimit, staleSignals, diskUsage } = stats;

  // Tile A — GitHub API
  const allRateNull =
    rateLimit.remaining === null &&
    rateLimit.limit === null &&
    rateLimit.resetAt === null;
  const rateValue = allRateNull
    ? "n/a"
    : `${rateLimit.remaining ?? "?"}/${rateLimit.limit ?? "?"}`;
  const rateColor = allRateNull
    ? "text-text-muted"
    : rateLimitColor(rateLimit.remaining);
  const resetTxt = formatResetTime(rateLimit.resetAt);

  // Tile B — Stale signals
  const trueSignals = (Object.keys(SIGNAL_LABELS) as Array<keyof typeof SIGNAL_LABELS>)
    .filter((key) => staleSignals[key])
    .map((key) => SIGNAL_LABELS[key]);
  const allFresh = trueSignals.length === 0;

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
      {/* Tile A: GitHub API */}
      <Tile label="GitHub API">
        <div className={`mt-1 text-lg font-semibold ${rateColor}`}>{rateValue}</div>
        <div className="mt-1 text-xs text-text-muted">
          {resetTxt ? `resets ${resetTxt}` : "reset unknown"}
        </div>
      </Tile>

      {/* Tile B: Stale signals */}
      <Tile label="Stale signals">
        <div
          className={`mt-1 text-lg font-semibold ${
            allFresh ? "text-[var(--v4-money)]" : "text-[var(--v4-red)]"
          }`}
        >
          {allFresh ? "all fresh" : trueSignals.join(" · ")}
        </div>
        <div className="mt-1 text-xs text-text-muted">
          worst age: {formatAge(staleSignals.worstAgeSeconds)}
        </div>
      </Tile>

      {/* Tile C: Data dirs */}
      <Tile label="Data dirs">
        <div className="mt-1 text-lg font-semibold">
          {formatBytes(diskUsage.totalBytes)}
        </div>
        <div className="mt-1 text-xs text-text-muted">
          {formatBytes(diskUsage.hiddenDataBytes)} hidden ·{" "}
          {formatBytes(diskUsage.publicDataBytes)} public
        </div>
      </Tile>
    </div>
  );
}
