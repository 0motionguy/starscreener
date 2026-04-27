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
import { useCallback, useEffect, useState } from "react";

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

function providerBadge(provider: Provider): string {
  if (provider === "api") return "border-up/50 bg-up/10 text-up";
  if (provider === "scrape") return "border-warning/50 bg-warning/10 text-warning";
  return "border-border-primary bg-bg-muted text-text-secondary";
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

function statusColor(status: ScannerStatus): string {
  if (status === "ok") return "border-up/60 bg-up/10 text-up";
  if (status === "cold") return "border-border-primary bg-bg-muted text-text-tertiary";
  if (status === "degraded") return "border-warning/60 bg-warning/10 text-warning";
  return "border-down/60 bg-down/10 text-down";
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
            <section className="mb-6 v2-card p-4">
              <h2 className="mb-3 text-sm font-bold uppercase tracking-wider">
                Issues
                <span className="ml-2 text-[10px] text-text-tertiary">
                  ({overview.issues.length})
                </span>
              </h2>
              {overview.issues.length === 0 ? (
                <p className="text-sm text-text-tertiary">
                  No stale/degraded sources, no metadata failures, no stuck queue rows.
                </p>
              ) : (
                <ul className="space-y-2">
                  {overview.issues.map((issue, idx) => (
                    <li
                      key={`${issue.kind}-${idx}`}
                      className="rounded-md border border-warning/50 bg-warning/5 px-3 py-2 text-xs"
                    >
                      <div className="font-semibold uppercase tracking-wider text-warning">
                        {issue.label}
                      </div>
                      <div className="mt-1 text-text-secondary">{issue.detail}</div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Feeds */}
            <section className="mb-6 v2-card p-4">
              <h2 className="mb-3 text-sm font-bold uppercase tracking-wider">
                Feeds &amp; manual scan
                <span className="ml-2 text-[10px] text-text-tertiary">
                  {"// scan now = spawn scripts/scrape-<source>.mjs · log → .data/admin-scan-runs/"}
                </span>
              </h2>
              <p className="mb-3 text-[11px] text-text-tertiary">
                <span className="rounded-full border border-up/50 bg-up/10 px-1.5 py-0.5 text-up">API</span>{" "}
                = official API (needs credentials).{" "}
                <span className="rounded-full border border-warning/50 bg-warning/10 px-1.5 py-0.5 text-warning">SCRAPE</span>{" "}
                = HTML scrape / workaround (no stable API).
              </p>

              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="text-left text-text-tertiary">
                    <tr className="border-b border-border-primary">
                      <th className="px-2 py-2 font-mono uppercase tracking-wider">Source</th>
                      <th className="px-2 py-2 font-mono uppercase tracking-wider">Kind</th>
                      <th className="px-2 py-2 font-mono uppercase tracking-wider">Cadence</th>
                      <th className="px-2 py-2 font-mono uppercase tracking-wider">Last scrape</th>
                      <th className="px-2 py-2 font-mono uppercase tracking-wider">Age</th>
                      <th className="px-2 py-2 font-mono uppercase tracking-wider">Status</th>
                      <th className="px-2 py-2 font-mono uppercase tracking-wider">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {SCAN_SOURCES.map((scan) => {
                      const health = overview.sources.find((s) => s.id === scan.id);
                      return (
                        <tr
                          key={scan.id}
                          className="border-b border-border-primary/40 last:border-b-0"
                        >
                          <td className="px-2 py-2">
                            <div className="font-semibold">{scan.label}</div>
                            {scan.note ? (
                              <div className="text-[10px] text-text-tertiary">{scan.note}</div>
                            ) : null}
                          </td>
                          <td className="px-2 py-2">
                            <span
                              className={
                                "rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider " +
                                providerBadge(scan.provider)
                              }
                            >
                              {scan.provider}
                            </span>
                          </td>
                          <td className="px-2 py-2 text-text-secondary">
                            {health?.cadence ?? "—"}
                          </td>
                          <td className="px-2 py-2 text-text-secondary">
                            {health ? fmtWhen(health.fetchedAt) : "not tracked"}
                          </td>
                          <td className="px-2 py-2 text-text-secondary">
                            {health ? fmtAge(health.ageSeconds) : "—"}
                          </td>
                          <td className="px-2 py-2">
                            {health ? (
                              <span
                                className={
                                  "rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider " +
                                  statusColor(health.status)
                                }
                              >
                                {health.status}
                              </span>
                            ) : (
                              <span className="text-[10px] text-text-tertiary">n/a</span>
                            )}
                          </td>
                          <td className="px-2 py-2">
                            <div className="flex flex-wrap gap-1">
                              <button
                                type="button"
                                onClick={() => void runScan(scan.id)}
                                disabled={busyScan === scan.id}
                                className="rounded-md border border-brand/60 bg-brand/10 px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-text-primary hover:bg-brand/20 disabled:opacity-50"
                              >
                                {busyScan === scan.id ? "starting…" : "Scan now"}
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
                <details className="mt-3 text-xs text-text-secondary">
                  <summary className="cursor-pointer text-text-tertiary">
                    Source notes (health)
                  </summary>
                  <ul className="mt-2 space-y-1">
                    {overview.sources
                      .filter((s) => s.notes.length > 0)
                      .map((s) => (
                        <li key={s.id}>
                          <span className="text-text-primary">{s.label}</span>
                          {": "}
                          {s.notes.join(" · ")}
                        </li>
                      ))}
                  </ul>
                </details>
              ) : null}
            </section>

            {/* Drop-a-repo submissions */}
            <section className="mb-6 v2-card p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-bold uppercase tracking-wider">
                  Drop-a-repo submissions
                  <span className="ml-2 text-[10px] text-text-tertiary">
                    {overview.repoQueue.pending} pending · {overview.repoQueue.listed} listed · {overview.repoQueue.failed} failed · {overview.repoQueue.total} total
                  </span>
                </h2>
                {overview.aisoRescanQueue.total > 0 ? (
                  <button
                    type="button"
                    onClick={() => void drainQueue()}
                    disabled={busyDrain}
                    className="rounded-md border border-up/60 bg-up/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-up hover:bg-up/20 disabled:opacity-50"
                    title="Drain AISO website-rescan queue (separate from drop submissions)"
                  >
                    {busyDrain ? "draining…" : `Drain AISO rescan (${overview.aisoRescanQueue.total})`}
                  </button>
                ) : null}
              </div>

              {overview.repoQueue.preview.length === 0 ? (
                <div className="rounded-md border border-dashed border-border-primary bg-bg-muted/40 px-3 py-3 text-xs text-text-tertiary">
                  No submissions on file ({" "}
                  <code>.data/repo-submissions.jsonl</code> empty). Submissions
                  for already-tracked repos bypass this file and never land
                  here — see the &quot;Drop attempts&quot; tile above for the
                  silent count.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="text-left text-text-tertiary">
                      <tr className="border-b border-border-primary">
                        <th className="px-2 py-2 font-mono uppercase tracking-wider">Repo</th>
                        <th className="px-2 py-2 font-mono uppercase tracking-wider">Status</th>
                        <th className="px-2 py-2 font-mono uppercase tracking-wider">Submitted</th>
                        <th className="px-2 py-2 font-mono uppercase tracking-wider">Age</th>
                        <th className="px-2 py-2 font-mono uppercase tracking-wider">Error</th>
                      </tr>
                    </thead>
                    <tbody>
                      {overview.repoQueue.preview.map((row) => (
                        <tr
                          key={row.id}
                          className="border-b border-border-primary/40 last:border-b-0"
                        >
                          <td className="px-2 py-2 font-semibold">
                            {row.repoPath ? (
                              <Link href={row.repoPath} className="underline">
                                {row.repoFullName}
                              </Link>
                            ) : (
                              row.repoFullName
                            )}
                          </td>
                          <td className="px-2 py-2">
                            <span
                              className={
                                "rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider " +
                                (row.status === "listed"
                                  ? "border-up/60 bg-up/10 text-up"
                                  : row.status === "scan_failed"
                                    ? "border-down/60 bg-down/10 text-down"
                                    : "border-warning/60 bg-warning/10 text-warning")
                              }
                            >
                              {row.status}
                            </span>
                          </td>
                          <td className="px-2 py-2 text-text-secondary">
                            {fmtWhen(row.submittedAt)}
                          </td>
                          <td className="px-2 py-2 text-text-secondary">
                            {fmtAge(row.ageSeconds)}
                          </td>
                          <td className="px-2 py-2 text-[11px] text-down">
                            {row.lastScanError
                              ? row.lastScanError.slice(0, 60)
                              : ""}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {overview.repoQueue.total > overview.repoQueue.preview.length ? (
                    <p className="mt-2 text-[11px] text-text-tertiary">
                      +{overview.repoQueue.total - overview.repoQueue.preview.length} more not shown
                    </p>
                  ) : null}
                </div>
              )}
            </section>

            {/* Ideas queue */}
            <section className="mb-6 v2-card p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-bold uppercase tracking-wider">
                  Ideas queue
                  <span className="ml-2 text-[10px] text-text-tertiary">
                    {overview.ideasQueue.pending} pending ·{" "}
                    {overview.ideasQueue.published} published ·{" "}
                    {overview.ideasQueue.rejected} rejected
                  </span>
                </h2>
                <Link
                  href="/admin/ideas-queue"
                  className="rounded-md border border-brand/60 bg-brand/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-text-primary hover:bg-brand/20"
                >
                  Open moderation →
                </Link>
              </div>

              {overview.ideasQueue.preview.length === 0 ? (
                <p className="text-sm text-text-tertiary">No pending ideas.</p>
              ) : (
                <ul className="space-y-2 text-xs">
                  {overview.ideasQueue.preview.map((idea) => (
                    <li
                      key={idea.id}
                      className="rounded-md border border-border-primary/60 bg-bg-muted/40 px-3 py-2"
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="font-semibold">{idea.title}</span>
                        <span className="text-[10px] text-text-tertiary">
                          @{idea.authorHandle} · {fmtWhen(idea.createdAt)}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
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
