"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, RefreshCw, ShieldCheck } from "lucide-react";

import { GithubPoolSection } from "./GithubPoolSection";
import { RedditPoolSection } from "./RedditPoolSection";
import { TwitterSection } from "./TwitterSection";
import { SingletonsTable } from "./SingletonsTable";
import type {
  AdminPoolStateResponse,
  PoolAnomaly,
  PoolStatus,
} from "@/app/api/admin/pool-state/route";

export function AdminKeysDashboard({
  initialState,
}: {
  initialState: AdminPoolStateResponse;
}) {
  const router = useRouter();
  const [state, setState] = useState(initialState);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    async function refresh() {
      setBusy(true);
      try {
        const res = await fetch("/api/admin/pool-state", {
          credentials: "include",
          cache: "no-store",
        });
        if (res.status === 401) {
          router.push("/admin/login?next=/admin/keys");
          return;
        }
        const payload = (await res.json()) as
          | AdminPoolStateResponse
          | { ok: false; error: string };
        if (!payload.ok) throw new Error(payload.error);
        if (!cancelled) {
          setState(payload);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setBusy(false);
      }
    }

    timer = setInterval(() => void refresh(), 60_000);
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [router]);

  const headline = useMemo(() => {
    const red = [
      state.github.health,
      state.reddit.health,
      state.twitter.apify.status,
      ...state.singletons.map((row) => row.status),
    ].filter((value) => value === "RED" || value === "DEAD").length;
    const yellow = [
      state.github.health,
      state.reddit.health,
      state.twitter.apify.status,
      ...state.singletons.map((row) => row.status),
    ].filter((value) => value === "YELLOW").length;
    if (red > 0) return { label: "RED", tone: "RED" as PoolStatus };
    if (yellow > 0 || state.anomalies.length > 0) {
      return { label: "YELLOW", tone: "YELLOW" as PoolStatus };
    }
    return { label: "GREEN", tone: "GREEN" as PoolStatus };
  }, [state]);

  return (
    <main className="mx-auto max-w-[1500px] px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-6 flex flex-col gap-4 border-b pb-5 md:flex-row md:items-end md:justify-between" style={{ borderColor: "var(--v3-line-100)" }}>
        <div>
          <p
            className="v2-mono text-[10px] tracking-[0.22em] uppercase"
            style={{ color: "var(--v3-ink-400)" }}
          >
            Admin / Key Pools
          </p>
          <h1
            className="mt-1 text-[28px] leading-tight"
            style={{ color: "var(--v3-ink-100)" }}
          >
            Runtime key health
          </h1>
          <p className="mt-2 max-w-3xl text-[13px]" style={{ color: "var(--v3-ink-300)" }}>
            Generated {formatDateTime(state.generatedAt)}. Polling every 60s.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill status={headline.tone} label={headline.label} />
          <span className="v2-mono text-[10px]" style={{ color: "var(--v3-ink-400)" }}>
            {busy ? "refreshing" : error ? error : "live"}
          </span>
          <RefreshCw size={15} aria-hidden="true" className={busy ? "animate-spin" : ""} />
        </div>
      </header>

      <div className="space-y-6">
        <PoolAnomalies anomalies={state.anomalies} />
        <GithubPoolSection data={state.github} />
        <RedditPoolSection data={state.reddit} />
        <TwitterSection data={state.twitter} />
        <SingletonsTable rows={state.singletons} />
      </div>
    </main>
  );
}

export function PoolAnomalies({ anomalies }: { anomalies: PoolAnomaly[] }) {
  if (anomalies.length === 0) {
    return (
      <section className="rounded-[2px] border p-4" style={{ borderColor: "var(--v3-line-100)", background: "var(--v3-bg-025)" }}>
        <div className="flex items-center gap-2">
          <ShieldCheck size={16} style={{ color: "var(--v3-sig-green)" }} />
          <h2 className="v2-mono text-[12px] tracking-[0.18em] uppercase" style={{ color: "var(--v3-ink-100)" }}>
            Pool anomalies
          </h2>
        </div>
        <p className="mt-2 text-[12px]" style={{ color: "var(--v3-ink-300)" }}>
          No imbalance, idle-key, rate-limit, or dead-instance anomaly detected.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-[2px] border p-4" style={{ borderColor: "rgba(248,113,113,0.45)", background: "rgba(248,113,113,0.07)" }}>
      <div className="flex items-center gap-2">
        <AlertTriangle size={16} style={{ color: "var(--v3-sig-red)" }} />
        <h2 className="v2-mono text-[12px] tracking-[0.18em] uppercase" style={{ color: "var(--v3-ink-100)" }}>
          Pool anomalies
        </h2>
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-2">
        {anomalies.map((anomaly) => (
          <div key={`${anomaly.label}:${anomaly.detail}`} className="rounded-[2px] border p-3" style={{ borderColor: anomaly.severity === "RED" ? "rgba(248,113,113,0.55)" : "rgba(251,191,36,0.5)", background: "var(--v3-bg-050)" }}>
            <div className="flex items-center justify-between gap-3">
              <p className="v2-mono text-[11px] tracking-[0.14em] uppercase" style={{ color: "var(--v3-ink-100)" }}>
                {anomaly.label}
              </p>
              <StatusPill status={anomaly.severity} label={anomaly.severity} />
            </div>
            <p className="mt-1 text-[12px]" style={{ color: "var(--v3-ink-300)" }}>
              {anomaly.detail}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

export function StatusPill({
  status,
  label = status,
}: {
  status: PoolStatus;
  label?: string;
}) {
  const color =
    status === "GREEN"
      ? "var(--v3-sig-green)"
      : status === "YELLOW"
        ? "var(--v3-sig-amber)"
        : "var(--v3-sig-red)";
  return (
    <span
      className="v2-mono inline-flex items-center rounded-[2px] border px-2 py-1 text-[10px] tracking-[0.14em] uppercase"
      style={{
        color,
        borderColor: color,
        background: `color-mix(in srgb, ${color} 12%, transparent)`,
      }}
    >
      {label}
    </span>
  );
}

export function SectionShell({
  eyebrow,
  title,
  summary,
  status,
  children,
}: {
  eyebrow: string;
  title: string;
  summary: React.ReactNode;
  status: PoolStatus;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[2px] border p-4" style={{ borderColor: "var(--v3-line-100)", background: "var(--v3-bg-025)" }}>
      <header className="mb-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="v2-mono text-[10px] tracking-[0.2em] uppercase" style={{ color: "var(--v3-ink-400)" }}>
            {eyebrow}
          </p>
          <h2 className="mt-1 text-[18px]" style={{ color: "var(--v3-ink-100)" }}>
            {title}
          </h2>
          <div className="mt-2 text-[12px]" style={{ color: "var(--v3-ink-300)" }}>
            {summary}
          </div>
        </div>
        <StatusPill status={status} />
      </header>
      {children}
    </section>
  );
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return "never";
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return iso;
  return new Date(ms).toLocaleString();
}

export function formatAge(iso: string | null): string {
  if (!iso) return "never";
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "unknown";
  const diff = Math.max(0, Date.now() - ms);
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}
