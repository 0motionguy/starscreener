"use client";

// Plain, single-page admin dashboard. No fancy design.
//
// Sections (top → bottom):
//   - stats strip (repos / snapshots / last refresh)
//   - DashboardStats (GitHub rate limit · stale signals · disk usage)
//   - DropEventsTile (drop-repo activity over 7 days)
//   - issues box (stale/degraded sources, metadata failures, stuck queue rows)
//   - feeds + scan-now buttons + per-source log viewer
//   - drop-a-repo submissions
//   - ideas queue summary + deep-link to /admin/ideas-queue
//
// Auth: server-gated on the ss_admin cookie (see src/app/admin/page.tsx).
// Every fetch goes out with credentials: "include" so the cookie auto-sends.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type CSSProperties } from "react";

import DashboardStats from "./DashboardStats";
import DropEventsTile from "./DropEventsTile";
import ScanLogViewer from "./ScanLogViewer";

type ScannerStatus = "ok" | "cold" | "degraded" | "stale";

interface ScannerSource {
  id: string;
  label: string;
  provider: string;
  cadence: string;
  fetchedAt: string | null;
  cold: boolean;
  stale: boolean;
  degraded: boolean;
  status: ScannerStatus;
  ageSeconds: number | null;
  staleAfterSeconds: number;
  degradedAfterSeconds: number;
  notes: string[];
}

interface RepoQueueRow {
  id: string;
  repoFullName: string;
  status: string;
  submittedAt: string;
  ageSeconds: number;
  lastScanError: string | null;
  repoPath: string | null;
}

interface IdeaPreview {
  id: string;
  title: string;
  authorHandle: string;
  createdAt: string;
}

interface Overview {
  ok: true;
  generatedAt: string;
  sources: ScannerSource[];
  repoQueue: {
    total: number;
    pending: number;
    listed: number;
    failed: number;
    latestSubmittedAt: string | null;
    preview: RepoQueueRow[];
  };
  aisoRescanQueue: { total: number };
  ideasQueue: {
    pending: number;
    published: number;
    rejected: number;
    preview: IdeaPreview[];
  };
  issues: Array<{ kind: string; label: string; detail: string }>;
  stats: {
    repoCount: number;
    snapshotCount: number;
    lastFetchedAt: string | null;
    deltasComputedAt: string | null;
    repoMetadataCount: number;
    repoMetadataSourceCount: number;
  };
}

// `provider` tells the operator at a glance whether this source uses an
// official API (reliable, needs a key) or a scraper (brittle, no key but
// can break when the site's HTML changes).
type Provider = "api" | "scrape" | "hybrid";

const SCAN_SOURCES: Array<{
  id: string;
  label: string;
  provider: Provider;
  note?: string;
}> = [
  { id: "reddit", label: "Reddit", provider: "scrape", note: "old.reddit.com + Chrome UA (no stable API)" },
  { id: "bluesky", label: "Bluesky", provider: "api", note: "AT Protocol — needs BLUESKY_HANDLE/APP_PASSWORD" },
  { id: "hackernews", label: "Hacker News", provider: "api", note: "Firebase + Algolia public APIs" },
  { id: "lobsters", label: "Lobsters", provider: "scrape", note: "HTML scrape — no API" },
  { id: "devto", label: "dev.to", provider: "api", note: "public API, no key needed" },
  { id: "producthunt", label: "Product Hunt", provider: "api", note: "GraphQL — needs PRODUCTHUNT_TOKEN" },
  { id: "npm", label: "npm (full)", provider: "api", note: "registry + downloads API" },
  { id: "npm-daily", label: "npm (daily)", provider: "api" },
  { id: "trending", label: "GitHub trending", provider: "scrape", note: "github.com/trending HTML" },
  { id: "funding-news", label: "Funding news", provider: "scrape" },
];

function providerBadge(provider: Provider): CSSProperties {
  if (provider === "api") {
    return {
      borderColor: "var(--v3-sig-green)",
      background: "color-mix(in srgb, var(--v3-sig-green) 10%, transparent)",
      color: "var(--v3-sig-green)",
    };
  }
  if (provider === "scrape") {
    return {
      borderColor: "var(--v3-sig-amber)",
      background: "color-mix(in srgb, var(--v3-sig-amber) 10%, transparent)",
      color: "var(--v3-sig-amber)",
    };
  }
  return {
    borderColor: "var(--v3-line-200)",
    background: "var(--v3-bg-100)",
    color: "var(--v3-ink-200)",
  };
}

function fmtAge(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return "—";
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

function fmtWhen(iso: string | null): string {
  if (!iso) return "never";
  return new Date(iso).toISOString().slice(0, 16).replace("T", " ") + "Z";
}

function statusColor(status: ScannerStatus): CSSProperties {
  if (status === "ok") {
    return {
      borderColor: "var(--v3-sig-green)",
      background: "color-mix(in srgb, var(--v3-sig-green) 10%, transparent)",
      color: "var(--v3-sig-green)",
    };
  }
  if (status === "cold") {
    return {
      borderColor: "var(--v3-line-200)",
      background: "var(--v3-bg-100)",
      color: "var(--v3-ink-300)",
    };
  }
  if (status === "degraded") {
    return {
      borderColor: "var(--v3-sig-amber)",
      background: "color-mix(in srgb, var(--v3-sig-amber) 10%, transparent)",
      color: "var(--v3-sig-amber)",
    };
  }
  return {
    borderColor: "var(--v3-sig-red)",
    background: "color-mix(in srgb, var(--v3-sig-red) 10%, transparent)",
    color: "var(--v3-sig-red)",
  };
}

export function AdminDashboard() {
  const router = useRouter();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyScan, setBusyScan] = useState<string | null>(null);
  const [busyDrain, setBusyDrain] = useState(false);
  const [busyLogout, setBusyLogout] = useState(false);
  const [actionLog, setActionLog] = useState<string[]>([]);

  const pushLog = useCallback((line: string) => {
    setActionLog((prev) => [
      `${new Date().toISOString().slice(11, 19)} ${line}`,
      ...prev,
    ].slice(0, 20));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/overview", {
        credentials: "include",
        cache: "no-store",
      });
      if (res.status === 401) {
        router.push("/admin/login?next=/admin");
        return;
      }
      const data = await res.json();
      if (!res.ok || data.ok === false) {
        throw new Error(data?.reason ?? data?.error ?? `HTTP ${res.status}`);
      }
      setOverview(data as Overview);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  async function runScan(sourceId: string) {
    setBusyScan(sourceId);
    try {
      const res = await fetch("/api/admin/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ source: sourceId }),
      });
      const data = await res.json();
      if (!res.ok || data.ok === false) {
        throw new Error(data?.error ?? `HTTP ${res.status}`);
      }
      pushLog(
        `scan ${sourceId} started · pid ${data.pid ?? "?"} · log ${data.logPath ?? "?"}`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      pushLog(`scan ${sourceId} FAILED: ${msg}`);
      setError(msg);
    } finally {
      setBusyScan(null);
    }
  }

  async function drainQueue() {
    setBusyDrain(true);
    try {
      const res = await fetch("/api/admin/queues/repo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ drain: true, limit: 10 }),
      });
      const data = await res.json();
      if (!res.ok || data.ok === false) {
        throw new Error(data?.error ?? `HTTP ${res.status}`);
      }
      const r = data.result as
        | { drained?: number; succeeded?: number; failed?: number; remaining?: number }
        | undefined;
      pushLog(
        `drain: ${r?.drained ?? 0} drained · ${r?.succeeded ?? 0} ok · ${r?.failed ?? 0} fail · ${r?.remaining ?? "?"} left`,
      );
      void load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      pushLog(`drain FAILED: ${msg}`);
      setError(msg);
    } finally {
      setBusyDrain(false);
    }
  }

  async function logout() {
    setBusyLogout(true);
    try {
      await fetch("/api/admin/login", {
        method: "DELETE",
        credentials: "include",
      });
    } catch {
      // best-effort; cookie is short-lived anyway
    }
    router.push("/admin/login");
    router.refresh();
  }

  return (
    <main className="min-h-screen bg-bg-primary text-text-primary font-mono">
      <div className="max-w-[1200px] mx-auto px-4 md:px-6 py-6 md:py-8">
        <header
          className="mb-6 pb-4 space-y-3"
          style={{ borderBottom: "1px solid var(--v2-line-std)" }}
        >
          <div
            className="flex items-center justify-between gap-3 pb-1"
            style={{ borderBottom: "1px solid var(--v2-line-std)" }}
          >
            <span
              className="v2-mono"
              style={{ fontSize: 10, color: "var(--v2-ink-400)" }}
            >
              {"// 01 · ADMIN · CONTROL · OPERATOR-LEVEL"}
            </span>
            {overview ? (
              <span
                className="v2-mono v2-stat tabular-nums"
                style={{ fontSize: 10, color: "var(--v2-ink-300)" }}
              >
                <span className="v2-live-dot mr-2 inline-block" aria-hidden />
                LOADED {fmtWhen(overview.generatedAt).toUpperCase()}
              </span>
            ) : null}
          </div>

          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1
                style={{
                  fontFamily: "var(--font-geist), Inter, sans-serif",
                  fontSize: "clamp(24px, 3vw, 32px)",
                  fontWeight: 510,
                  letterSpacing: "-0.022em",
                  color: "var(--v2-ink-000)",
                  lineHeight: 1.1,
                }}
              >
                ADMIN CONTROL
              </h1>
              <p
                className="mt-1.5"
                style={{ fontSize: 13, color: "var(--v2-ink-300)" }}
              >
                {"// feeds, queues, issues"}
              </p>
              <div
                className="mt-3 flex flex-wrap gap-3 v2-mono"
                style={{ fontSize: 10, color: "var(--v2-ink-400)" }}
              >
                <Link
                  href="/admin/ideas-queue"
                  className="underline"
                  style={{ color: "var(--v2-ink-300)" }}
                >
                  /admin/ideas-queue
                </Link>
                <Link
                  href="/admin/revenue-queue"
                  className="underline"
                  style={{ color: "var(--v2-ink-300)" }}
                >
                  /admin/revenue-queue
                </Link>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void load()}
                disabled={loading}
                className="v2-btn v2-btn-ghost disabled:opacity-50"
              >
                {loading ? "…" : "RELOAD"}
              </button>
              <button
                type="button"
                onClick={() => void logout()}
                disabled={busyLogout}
                className="v2-btn v2-btn-ghost disabled:opacity-50"
              >
                {busyLogout ? "…" : "LOGOUT"}
              </button>
            </div>
          </div>
        </header>

        {error ? (
          <div
            className="v2-mono mb-4 px-3 py-2"
            style={{
              fontSize: 11,
              color: "var(--v2-sig-red)",
              border: "1px solid var(--v2-sig-red)",
              borderRadius: 2,
              background: "rgba(255, 77, 77, 0.06)",
            }}
          >
            {`// ERROR · ${error}`}
          </div>
        ) : null}

        {overview ? (
          <>
            {/* Stats strip */}
            <section className="mb-3 grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatTile label="Repos" value={overview.stats.repoCount} />
              <StatTile label="Snapshots" value={overview.stats.snapshotCount} />
              <StatTile
                label="Repo metadata"
                value={`${overview.stats.repoMetadataCount} / ${overview.stats.repoMetadataSourceCount}`}
              />
              <StatTile
                label="Last scraper tick"
                value={fmtWhen(overview.stats.lastFetchedAt)}
              />
            </section>

            {/* GitHub rate limit · stale signals · disk usage */}
            <section className="mb-3">
              <DashboardStats />
            </section>

            {/* Drop attempts (7d) — includes silent 'already tracked' bypass */}
            <section className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-4">
              <DropEventsTile />
            </section>

            {/* Issues */}
            <section
              className="mb-6 rounded-[2px]"
              style={{
                background: "var(--v3-bg-050)",
                border: "1px solid var(--v3-line-200)",
              }}
            >
              <div
                className="flex items-center justify-between gap-3 px-3 py-2"
                style={{
                  background: "var(--v3-bg-025)",
                  borderBottom: "1px solid var(--v3-line-100)",
                }}
              >
                <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em]">
                  <span
                    aria-hidden
                    className="inline-block"
                    style={{
                      width: 6,
                      height: 6,
                      background:
                        overview.issues.length === 0
                          ? "var(--v3-sig-green)"
                          : "var(--v3-sig-amber)",
                      borderRadius: 1,
                    }}
                  />
                  <span style={{ color: "var(--v3-ink-300)" }}>
                    {"// ISSUES"}
                  </span>
                </span>
                <span
                  className="font-mono text-[10px] tabular-nums tracking-[0.14em]"
                  style={{ color: "var(--v3-ink-400)" }}
                >
                  {String(overview.issues.length).padStart(2, "0")} OPEN
                </span>
              </div>
              <div className="p-4">
                {overview.issues.length === 0 ? (
                  <p
                    className="font-mono text-[11px] uppercase tracking-[0.16em]"
                    style={{ color: "var(--v3-ink-400)" }}
                  >
                    {"// NO STALE/DEGRADED SOURCES · NO METADATA FAILURES · NO STUCK QUEUE ROWS"}
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {overview.issues.map((issue, idx) => (
                      <li
                        key={`${issue.kind}-${idx}`}
                        className="rounded-[2px] px-3 py-2"
                        style={{
                          border: "1px solid var(--v3-sig-amber)",
                          background:
                            "color-mix(in oklab, var(--v3-sig-amber) 6%, transparent)",
                        }}
                      >
                        <div
                          className="font-mono text-[11px] uppercase tracking-[0.16em]"
                          style={{
                            color: "var(--v3-sig-amber)",
                            fontWeight: 500,
                          }}
                        >
                          {issue.label}
                        </div>
                        <div
                          className="mt-1 text-xs"
                          style={{ color: "var(--v3-ink-200)" }}
                        >
                          {issue.detail}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>

            {/* Feeds */}
            <section
              className="mb-6 rounded-[2px]"
              style={{
                background: "var(--v3-bg-050)",
                border: "1px solid var(--v3-line-200)",
              }}
            >
              <div
                className="flex flex-wrap items-center justify-between gap-3 px-3 py-2"
                style={{
                  background: "var(--v3-bg-025)",
                  borderBottom: "1px solid var(--v3-line-100)",
                }}
              >
                <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em]">
                  <span
                    aria-hidden
                    className="inline-block"
                    style={{
                      width: 6,
                      height: 6,
                      background: "var(--v3-acc)",
                      borderRadius: 1,
                    }}
                  />
                  <span style={{ color: "var(--v3-ink-300)" }}>
                    {"// FEEDS · MANUAL SCAN"}
                  </span>
                </span>
                <span
                  className="font-mono text-[10px] tabular-nums tracking-[0.14em]"
                  style={{ color: "var(--v3-ink-400)" }}
                >
                  {"SCAN NOW → SCRIPTS/SCRAPE-<SRC>.MJS · LOG → .DATA/ADMIN-SCAN-RUNS/"}
                </span>
              </div>
              <div className="p-4">
                <p
                  className="mb-3 font-mono text-[11px] uppercase tracking-[0.14em]"
                  style={{ color: "var(--v3-ink-400)" }}
                >
                  <span
                    className="rounded-[2px] border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em]"
                    style={{
                      borderColor: "var(--v3-sig-green)",
                      background: "color-mix(in srgb, var(--v3-sig-green) 10%, transparent)",
                      color: "var(--v3-sig-green)",
                    }}
                  >
                    API
                  </span>{" "}
                  = official API (needs credentials).{" "}
                  <span
                    className="rounded-[2px] border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em]"
                    style={{
                      borderColor: "var(--v3-sig-amber)",
                      background: "color-mix(in srgb, var(--v3-sig-amber) 10%, transparent)",
                      color: "var(--v3-sig-amber)",
                    }}
                  >
                    SCRAPE
                  </span>{" "}
                  = HTML scrape / workaround (no stable API).
                </p>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr style={{ borderBottom: "1px solid var(--v3-line-200)" }}>
                        <th
                          className="px-2 py-2 text-left font-mono text-[10px] uppercase tracking-[0.16em]"
                          style={{ color: "var(--v3-ink-400)" }}
                        >
                          Source
                        </th>
                        <th
                          className="px-2 py-2 text-left font-mono text-[10px] uppercase tracking-[0.16em]"
                          style={{ color: "var(--v3-ink-400)" }}
                        >
                          Kind
                        </th>
                        <th
                          className="px-2 py-2 text-left font-mono text-[10px] uppercase tracking-[0.16em]"
                          style={{ color: "var(--v3-ink-400)" }}
                        >
                          Cadence
                        </th>
                        <th
                          className="px-2 py-2 text-left font-mono text-[10px] uppercase tracking-[0.16em]"
                          style={{ color: "var(--v3-ink-400)" }}
                        >
                          Last scrape
                        </th>
                        <th
                          className="px-2 py-2 text-left font-mono text-[10px] uppercase tracking-[0.16em]"
                          style={{ color: "var(--v3-ink-400)" }}
                        >
                          Age
                        </th>
                        <th
                          className="px-2 py-2 text-left font-mono text-[10px] uppercase tracking-[0.16em]"
                          style={{ color: "var(--v3-ink-400)" }}
                        >
                          Status
                        </th>
                        <th
                          className="px-2 py-2 text-left font-mono text-[10px] uppercase tracking-[0.16em]"
                          style={{ color: "var(--v3-ink-400)" }}
                        >
                          Action
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {SCAN_SOURCES.map((scan) => {
                        const health = overview.sources.find((s) => s.id === scan.id);
                        return (
                          <tr
                            key={scan.id}
                            style={{ borderBottom: "1px solid var(--v3-line-100)" }}
                          >
                            <td className="px-2 py-2">
                              <div
                                style={{
                                  color: "var(--v3-ink-100)",
                                  fontWeight: 500,
                                }}
                              >
                                {scan.label}
                              </div>
                              {scan.note ? (
                                <div
                                  className="font-mono text-[10px] tracking-[0.12em]"
                                  style={{ color: "var(--v3-ink-400)" }}
                                >
                                  {scan.note}
                                </div>
                              ) : null}
                            </td>
                            <td className="px-2 py-2">
                              <span
                                className="rounded-[2px] border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em]"
                                style={providerBadge(scan.provider)}
                              >
                                {scan.provider}
                              </span>
                            </td>
                            <td
                              className="px-2 py-2 tabular-nums"
                              style={{ color: "var(--v3-ink-200)" }}
                            >
                              {health?.cadence ?? "—"}
                            </td>
                            <td
                              className="px-2 py-2 font-mono tabular-nums text-[11px]"
                              style={{ color: "var(--v3-ink-200)" }}
                            >
                              {health ? fmtWhen(health.fetchedAt) : "not tracked"}
                            </td>
                            <td
                              className="px-2 py-2 font-mono tabular-nums text-[11px]"
                              style={{ color: "var(--v3-ink-200)" }}
                            >
                              {health ? fmtAge(health.ageSeconds) : "—"}
                            </td>
                            <td className="px-2 py-2">
                              {health ? (
                                <span
                                  className="rounded-[2px] border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em]"
                                  style={statusColor(health.status)}
                                >
                                  {health.status}
                                </span>
                              ) : (
                                <span
                                  className="font-mono text-[10px] uppercase tracking-[0.14em]"
                                  style={{ color: "var(--v3-ink-500)" }}
                                >
                                  n/a
                                </span>
                              )}
                            </td>
                            <td className="px-2 py-2">
                              <div className="flex flex-wrap items-start gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => void runScan(scan.id)}
                                  disabled={busyScan === scan.id}
                                  className="inline-flex items-center rounded-[2px] px-2 py-1 font-mono text-[10px] uppercase tracking-[0.16em] transition-colors disabled:opacity-50"
                                  style={{
                                    background: "var(--v3-acc-soft)",
                                    border: "1px solid var(--v3-acc-dim)",
                                    color: "var(--v3-acc)",
                                    fontWeight: 500,
                                  }}
                                >
                                  {busyScan === scan.id ? "STARTING…" : "Scan now"}
                                </button>
                                <ScanLogViewer sourceId={scan.id} sourceLabel={scan.label} />
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {overview.sources.some((s) => s.notes.length > 0) ? (
                  <details
                    className="mt-3 text-xs"
                    style={{ color: "var(--v3-ink-200)" }}
                  >
                    <summary
                      className="cursor-pointer font-mono text-[10px] uppercase tracking-[0.16em]"
                      style={{ color: "var(--v3-ink-400)" }}
                    >
                      {"// SOURCE NOTES (HEALTH)"}
                    </summary>
                    <ul className="mt-2 space-y-1">
                      {overview.sources
                        .filter((s) => s.notes.length > 0)
                        .map((s) => (
                          <li key={s.id}>
                            <span style={{ color: "var(--v3-ink-100)" }}>
                              {s.label}
                            </span>
                            {": "}
                            <span style={{ color: "var(--v3-ink-300)" }}>
                              {s.notes.join(" · ")}
                            </span>
                          </li>
                        ))}
                    </ul>
                  </details>
                ) : null}
              </div>
            </section>

            {/* Drop-a-repo submissions */}
            <section
              className="mb-6 rounded-[2px]"
              style={{
                background: "var(--v3-bg-050)",
                border: "1px solid var(--v3-line-200)",
              }}
            >
              <div
                className="flex flex-wrap items-center justify-between gap-3 px-3 py-2"
                style={{
                  background: "var(--v3-bg-025)",
                  borderBottom: "1px solid var(--v3-line-100)",
                }}
              >
                <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em]">
                  <span
                    aria-hidden
                    className="inline-block"
                    style={{
                      width: 6,
                      height: 6,
                      background: "var(--v3-acc)",
                      borderRadius: 1,
                    }}
                  />
                  <span style={{ color: "var(--v3-ink-300)" }}>
                    {"// DROP-A-REPO SUBMISSIONS"}
                  </span>
                </span>
                <span
                  className="font-mono text-[10px] tabular-nums tracking-[0.14em]"
                  style={{ color: "var(--v3-ink-400)" }}
                >
                  {overview.repoQueue.pending} PENDING · {overview.repoQueue.listed} LISTED · {overview.repoQueue.failed} FAILED · {overview.repoQueue.total} TOTAL
                </span>
              </div>
              <div className="p-4">
                {overview.aisoRescanQueue.total > 0 ? (
                  <div className="mb-3 flex justify-end">
                    <button
                      type="button"
                      onClick={() => void drainQueue()}
                      disabled={busyDrain}
                      className="inline-flex items-center rounded-[2px] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] transition-colors disabled:opacity-50"
                      style={{
                        background:
                          "color-mix(in oklab, var(--v3-sig-green) 12%, transparent)",
                        border: "1px solid var(--v3-sig-green)",
                        color: "var(--v3-sig-green)",
                        fontWeight: 500,
                      }}
                      title="Drain AISO website-rescan queue (separate from drop submissions)"
                    >
                      {busyDrain ? "DRAINING…" : `DRAIN AISO RESCAN (${overview.aisoRescanQueue.total})`}
                    </button>
                  </div>
                ) : null}

                {overview.repoQueue.preview.length === 0 ? (
                  <div
                    className="rounded-[2px] px-3 py-3 font-mono text-[11px] uppercase tracking-[0.14em]"
                    style={{
                      border: "1px dashed var(--v3-line-200)",
                      background: "var(--v3-bg-025)",
                      color: "var(--v3-ink-400)",
                    }}
                  >
                    {"// NO SUBMISSIONS ON FILE — "}
                    <code
                      style={{
                        color: "var(--v3-ink-200)",
                        fontFamily:
                          "var(--font-geist-mono), var(--font-jetbrains-mono), monospace",
                      }}
                    >
                      .data/repo-submissions.jsonl
                    </code>
                    {" "}
                    {" EMPTY · ALREADY-TRACKED REPOS BYPASS THIS FILE — SEE \"DROP ATTEMPTS\" TILE ABOVE."}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr style={{ borderBottom: "1px solid var(--v3-line-200)" }}>
                          <th
                            className="px-2 py-2 text-left font-mono text-[10px] uppercase tracking-[0.16em]"
                            style={{ color: "var(--v3-ink-400)" }}
                          >
                            Repo
                          </th>
                          <th
                            className="px-2 py-2 text-left font-mono text-[10px] uppercase tracking-[0.16em]"
                            style={{ color: "var(--v3-ink-400)" }}
                          >
                            Status
                          </th>
                          <th
                            className="px-2 py-2 text-left font-mono text-[10px] uppercase tracking-[0.16em]"
                            style={{ color: "var(--v3-ink-400)" }}
                          >
                            Submitted
                          </th>
                          <th
                            className="px-2 py-2 text-left font-mono text-[10px] uppercase tracking-[0.16em]"
                            style={{ color: "var(--v3-ink-400)" }}
                          >
                            Age
                          </th>
                          <th
                            className="px-2 py-2 text-left font-mono text-[10px] uppercase tracking-[0.16em]"
                            style={{ color: "var(--v3-ink-400)" }}
                          >
                            Error
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {overview.repoQueue.preview.map((row) => (
                          <tr
                            key={row.id}
                            style={{ borderBottom: "1px solid var(--v3-line-100)" }}
                          >
                            <td
                              className="px-2 py-2"
                              style={{
                                color: "var(--v3-ink-100)",
                                fontWeight: 500,
                              }}
                            >
                              {row.repoPath ? (
                                <Link
                                  href={row.repoPath}
                                  className="underline transition-colors"
                                  style={{ color: "var(--v3-ink-100)" }}
                                >
                                  {row.repoFullName}
                                </Link>
                              ) : (
                                row.repoFullName
                              )}
                            </td>
                            <td className="px-2 py-2">
                              <span
                                className="rounded-[2px] border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em]"
                                style={
                                  row.status === "listed"
                                    ? {
                                        borderColor: "var(--v3-sig-green)",
                                        background: "color-mix(in srgb, var(--v3-sig-green) 10%, transparent)",
                                        color: "var(--v3-sig-green)",
                                      }
                                    : row.status === "scan_failed"
                                      ? {
                                          borderColor: "var(--v3-sig-red)",
                                          background: "color-mix(in srgb, var(--v3-sig-red) 10%, transparent)",
                                          color: "var(--v3-sig-red)",
                                        }
                                      : {
                                          borderColor: "var(--v3-sig-amber)",
                                          background: "color-mix(in srgb, var(--v3-sig-amber) 10%, transparent)",
                                          color: "var(--v3-sig-amber)",
                                        }
                                }
                              >
                                {row.status}
                              </span>
                            </td>
                            <td
                              className="px-2 py-2 font-mono tabular-nums text-[11px]"
                              style={{ color: "var(--v3-ink-200)" }}
                            >
                              {fmtWhen(row.submittedAt)}
                            </td>
                            <td
                              className="px-2 py-2 font-mono tabular-nums text-[11px]"
                              style={{ color: "var(--v3-ink-200)" }}
                            >
                              {fmtAge(row.ageSeconds)}
                            </td>
                            <td
                              className="px-2 py-2 font-mono text-[11px]"
                              style={{ color: "var(--v3-sig-red)" }}
                            >
                              {row.lastScanError
                                ? row.lastScanError.slice(0, 60)
                                : ""}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {overview.repoQueue.total > overview.repoQueue.preview.length ? (
                      <p
                        className="mt-2 font-mono text-[10px] uppercase tracking-[0.16em]"
                        style={{ color: "var(--v3-ink-400)" }}
                      >
                        {`// +${overview.repoQueue.total - overview.repoQueue.preview.length} MORE NOT SHOWN`}
                      </p>
                    ) : null}
                  </div>
                )}
              </div>
            </section>

            {/* Ideas queue */}
            <section
              className="mb-6 rounded-[2px]"
              style={{
                background: "var(--v3-bg-050)",
                border: "1px solid var(--v3-line-200)",
              }}
            >
              <div
                className="flex flex-wrap items-center justify-between gap-3 px-3 py-2"
                style={{
                  background: "var(--v3-bg-025)",
                  borderBottom: "1px solid var(--v3-line-100)",
                }}
              >
                <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em]">
                  <span
                    aria-hidden
                    className="inline-block"
                    style={{
                      width: 6,
                      height: 6,
                      background: "var(--v3-acc)",
                      borderRadius: 1,
                    }}
                  />
                  <span style={{ color: "var(--v3-ink-300)" }}>
                    {"// IDEAS QUEUE"}
                  </span>
                </span>
                <span
                  className="font-mono text-[10px] tabular-nums tracking-[0.14em]"
                  style={{ color: "var(--v3-ink-400)" }}
                >
                  {overview.ideasQueue.pending} PENDING · {overview.ideasQueue.published} PUBLISHED · {overview.ideasQueue.rejected} REJECTED
                </span>
              </div>
              <div className="p-4">
                <div className="mb-3 flex justify-end">
                  <Link
                    href="/admin/ideas-queue"
                    className="inline-flex items-center rounded-[2px] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] transition-colors"
                    style={{
                      background: "var(--v3-acc-soft)",
                      border: "1px solid var(--v3-acc-dim)",
                      color: "var(--v3-acc)",
                      fontWeight: 500,
                    }}
                  >
                    OPEN MODERATION →
                  </Link>
                </div>

                {overview.ideasQueue.preview.length === 0 ? (
                  <p
                    className="font-mono text-[11px] uppercase tracking-[0.16em]"
                    style={{ color: "var(--v3-ink-400)" }}
                  >
                    {"// NO PENDING IDEAS"}
                  </p>
                ) : (
                  <ul className="space-y-2 text-xs">
                    {overview.ideasQueue.preview.map((idea) => (
                      <li
                        key={idea.id}
                        className="rounded-[2px] px-3 py-2"
                        style={{
                          background: "var(--v3-bg-025)",
                          border: "1px solid var(--v3-line-100)",
                        }}
                      >
                        <div className="flex items-baseline justify-between gap-2">
                          <span
                            style={{
                              color: "var(--v3-ink-100)",
                              fontWeight: 500,
                            }}
                          >
                            {idea.title}
                          </span>
                          <span
                            className="font-mono text-[10px] tabular-nums tracking-[0.14em]"
                            style={{ color: "var(--v3-ink-400)" }}
                          >
                            @{idea.authorHandle} · {fmtWhen(idea.createdAt)}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>

            {/* Action log */}
            {actionLog.length > 0 ? (
              <section className="v2-card p-4">
                <h2 className="mb-2 text-sm font-bold uppercase tracking-wider">
                  Action log (this session)
                </h2>
                <ul className="space-y-0.5 text-[11px] text-text-secondary">
                  {actionLog.map((line, i) => (
                    <li key={i} className="font-mono">
                      {line}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </>
        ) : loading ? (
          <p className="text-sm text-text-tertiary">Loading…</p>
        ) : null}
      </div>
    </main>
  );
}

function StatTile({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="v2-card p-3">
      <div className="text-[10px] uppercase tracking-wider text-text-tertiary">
        {label}
      </div>
      <div className="mt-1 text-base font-semibold">{value}</div>
    </div>
  );
}

export default AdminDashboard;
