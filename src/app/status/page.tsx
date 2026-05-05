import type { Metadata } from "next";
import Link from "next/link";

import { SITE_NAME, SITE_URL } from "@/lib/seo";

export const metadata: Metadata = {
  title: `Status - ${SITE_NAME}`,
  description: `Live status for ${SITE_NAME}: app health, cron activity, source breakers, and worker freshness.`,
  alternates: { canonical: `${SITE_URL.replace(/\/+$/, "")}/status` },
};

export const dynamic = "force-dynamic";

type HealthPayload = {
  status?: "ok" | "stale" | "error";
  sourceStatus?: "ok" | "degraded";
  warning?: string;
  error?: string;
};

type CronSummaryPayload = {
  summary?: {
    failed?: number;
    ageMs?: number | null;
  };
};

type WorkerPayload = {
  summary?: {
    total?: number;
    green?: number;
    amber?: number;
    red?: number;
    missing?: number;
  };
};

type SourcesPayload = {
  summary?: {
    total?: number;
    open?: number;
    halfOpen?: number;
  };
};

async function fetchJson<T>(path: string): Promise<T | null> {
  try {
    const response = await fetch(path, { cache: "no-store" });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

function stateTone(ok: boolean): { label: string; color: string } {
  return ok
    ? { label: "Operational", color: "var(--v3-sig-green)" }
    : { label: "Degraded", color: "var(--v3-sig-red)" };
}

export default async function StatusPage() {
  const [health, cron, worker, sources] = await Promise.all([
    fetchJson<HealthPayload>("/api/health?soft=1"),
    fetchJson<CronSummaryPayload>("/api/health/cron-activity"),
    fetchJson<WorkerPayload>("/api/worker/health"),
    fetchJson<SourcesPayload>("/api/health/sources"),
  ]);

  const appHealthy = health?.status === "ok" && health?.sourceStatus !== "degraded";
  const cronHealthy =
    (cron?.summary?.failed ?? 0) === 0 &&
    typeof cron?.summary?.ageMs === "number" &&
    cron.summary.ageMs <= 30 * 60 * 1000;
  const workerHealthy = (worker?.summary?.red ?? 0) === 0;
  const breakerHealthy =
    (sources?.summary?.open ?? 0) === 0 &&
    (sources?.summary?.halfOpen ?? 0) === 0;

  const sentrySignalHealthy = appHealthy;
  const sentrySignalNote = appHealthy
    ? "No active error surge inferred from public app health."
    : "Public app health is degraded, treat this as a potential Sentry/error-rate spike signal.";

  const overallOk =
    appHealthy && cronHealthy && workerHealthy && breakerHealthy && sentrySignalHealthy;
  const overall = stateTone(overallOk);

  return (
    <main className="aiso-container px-6 py-10 max-w-5xl">
      <p
        className="v2-mono text-[10px] tracking-[0.2em] uppercase"
        style={{ color: "var(--v3-ink-400)" }}
      >
        Public Status
      </p>
      <h1 className="mt-2 text-3xl md:text-4xl" style={{ color: "var(--v3-ink-100)" }}>
        TrendingRepo Systems Status
      </h1>
      <p className="mt-3 text-sm" style={{ color: "var(--v3-ink-300)" }}>
        Live operational signal sourced from public health endpoints. This page auto-updates
        on cron degradation and app-level error pressure.
      </p>

      <section
        className="mt-6 rounded border px-4 py-4"
        style={{
          borderColor: "var(--v3-line-100)",
          background: "var(--v3-bg-025)",
        }}
      >
        <p className="text-xs v2-mono tracking-[0.12em] uppercase" style={{ color: "var(--v3-ink-400)" }}>
          Overall
        </p>
        <p className="mt-1 text-xl" style={{ color: overall.color }}>
          {overall.label}
        </p>
      </section>

      <section className="mt-6 grid gap-4 md:grid-cols-2">
        <article className="rounded border p-4" style={{ borderColor: "var(--v3-line-100)" }}>
          <p className="text-xs v2-mono tracking-[0.12em] uppercase" style={{ color: "var(--v3-ink-400)" }}>
            App Health
          </p>
          <p className="mt-1 text-sm" style={{ color: appHealthy ? "var(--v3-sig-green)" : "var(--v3-sig-red)" }}>
            {appHealthy ? "OK" : "DEGRADED"}
          </p>
          <p className="mt-2 text-xs" style={{ color: "var(--v3-ink-300)" }}>
            {health?.warning ?? health?.error ?? "No warning message."}
          </p>
        </article>

        <article className="rounded border p-4" style={{ borderColor: "var(--v3-line-100)" }}>
          <p className="text-xs v2-mono tracking-[0.12em] uppercase" style={{ color: "var(--v3-ink-400)" }}>
            Cron Activity
          </p>
          <p className="mt-1 text-sm" style={{ color: cronHealthy ? "var(--v3-sig-green)" : "var(--v3-sig-red)" }}>
            {cronHealthy ? "OK" : "DEGRADED"}
          </p>
          <p className="mt-2 text-xs" style={{ color: "var(--v3-ink-300)" }}>
            Failed runs (window): {cron?.summary?.failed ?? "unknown"}
          </p>
        </article>

        <article className="rounded border p-4" style={{ borderColor: "var(--v3-line-100)" }}>
          <p className="text-xs v2-mono tracking-[0.12em] uppercase" style={{ color: "var(--v3-ink-400)" }}>
            Worker Fleet
          </p>
          <p className="mt-1 text-sm" style={{ color: workerHealthy ? "var(--v3-sig-green)" : "var(--v3-sig-red)" }}>
            {workerHealthy ? "OK" : "DEGRADED"}
          </p>
          <p className="mt-2 text-xs" style={{ color: "var(--v3-ink-300)" }}>
            Red workers: {worker?.summary?.red ?? "unknown"} / total {worker?.summary?.total ?? "unknown"}
          </p>
        </article>

        <article className="rounded border p-4" style={{ borderColor: "var(--v3-line-100)" }}>
          <p className="text-xs v2-mono tracking-[0.12em] uppercase" style={{ color: "var(--v3-ink-400)" }}>
            Source Breakers
          </p>
          <p className="mt-1 text-sm" style={{ color: breakerHealthy ? "var(--v3-sig-green)" : "var(--v3-sig-red)" }}>
            {breakerHealthy ? "OK" : "DEGRADED"}
          </p>
          <p className="mt-2 text-xs" style={{ color: "var(--v3-ink-300)" }}>
            Open/half-open breakers: {sources?.summary?.open ?? "unknown"}/{sources?.summary?.halfOpen ?? "unknown"}
          </p>
        </article>
      </section>

      <section className="mt-6 rounded border p-4" style={{ borderColor: "var(--v3-line-100)" }}>
        <p className="text-xs v2-mono tracking-[0.12em] uppercase" style={{ color: "var(--v3-ink-400)" }}>
          Sentry Spike Signal
        </p>
        <p className="mt-1 text-sm" style={{ color: sentrySignalHealthy ? "var(--v3-sig-green)" : "var(--v3-sig-red)" }}>
          {sentrySignalHealthy ? "No spike inferred" : "Spike/degradation inferred"}
        </p>
        <p className="mt-2 text-xs" style={{ color: "var(--v3-ink-300)" }}>
          {sentrySignalNote}
        </p>
      </section>

      <p className="mt-6 text-xs" style={{ color: "var(--v3-ink-400)" }}>
        Need full diagnostics? Visit <Link href="/about">About</Link> and API routes{" "}
        <Link href="/api/health?soft=1">/api/health</Link>,{" "}
        <Link href="/api/health/cron-activity">/api/health/cron-activity</Link>,{" "}
        <Link href="/api/worker/health">/api/worker/health</Link>.
      </p>
    </main>
  );
}

