// Admin — fleet-wide GitHub token pool snapshot.
//
// Sibling to /admin/pool. The original page is per-process (whichever lambda
// served the request); this page aggregates the per-token state ALL lambdas
// publish to Redis and shows the fleet-wide view. Use this one when asking
// "is the FLEET healthy" — the per-process page is for debugging a single
// lambda's pool history.
//
// Auth: same cookie session as /admin/pool. Same redirect contract too.

import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  ADMIN_SESSION_COOKIE_NAME,
  verifyAdminSession,
} from "@/lib/api/admin-session";
import {
  readAggregatePoolState,
  type AggregateTokenRow,
} from "@/lib/github-token-pool-aggregate";

export const metadata: Metadata = {
  title: "Admin — GitHub Token Pool (Fleet)",
  description:
    "Fleet-wide token pool aggregate: total remaining across all lambdas, exhausted + quarantined counts, per-token last-write summary.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

interface RowVM {
  idx: number;
  tokenLabel: string;
  remaining: string;
  resetAt: string;
  lastObserved: string;
  quarantine: string;
  lambdaId: string;
  writtenAt: string;
  health: "healthy" | "exhausted" | "quarantined" | "untouched";
}

function relTime(thenMs: number, nowMs: number): string {
  const diff = nowMs - thenMs;
  if (diff < 0) return "in future";
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

function relFuture(thenMs: number, nowMs: number): string {
  const diff = thenMs - nowMs;
  if (diff <= 0) return "expired";
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
  return `${Math.floor(diff / 86_400_000)}d`;
}

function buildRow(row: AggregateTokenRow, idx: number, nowMs: number): RowVM {
  const nowSec = Math.floor(nowMs / 1000);
  const state = row.latestState;

  if (!state) {
    return {
      idx,
      tokenLabel: row.tokenLabel,
      remaining: "—",
      resetAt: "—",
      lastObserved: "never",
      quarantine: "—",
      lambdaId: "—",
      writtenAt: "—",
      health: "untouched",
    };
  }

  const isQuarantined =
    state.quarantinedUntilMs !== null && state.quarantinedUntilMs > nowMs;
  const isExhausted =
    state.remaining !== null &&
    state.remaining <= 0 &&
    state.resetUnixSec !== null &&
    state.resetUnixSec > nowSec;

  let health: RowVM["health"] = "healthy";
  if (isQuarantined) health = "quarantined";
  else if (isExhausted) health = "exhausted";
  else if (state.lastObservedMs === null) health = "untouched";

  const writtenAtMs = new Date(state.writtenAt).getTime();

  return {
    idx,
    tokenLabel: row.tokenLabel,
    remaining: state.remaining === null ? "—" : String(state.remaining),
    resetAt:
      state.resetUnixSec === null
        ? "—"
        : `${new Date(state.resetUnixSec * 1000).toISOString()} (${relFuture(
            state.resetUnixSec * 1000,
            nowMs,
          )})`,
    lastObserved:
      state.lastObservedMs === null
        ? "never"
        : relTime(state.lastObservedMs, nowMs),
    quarantine: isQuarantined
      ? `until ${new Date(state.quarantinedUntilMs!).toISOString()} (${relFuture(
          state.quarantinedUntilMs!,
          nowMs,
        )})`
      : "—",
    lambdaId: state.lambdaId,
    writtenAt: Number.isFinite(writtenAtMs)
      ? relTime(writtenAtMs, nowMs)
      : state.writtenAt,
    health,
  };
}

export default async function AdminPoolAggregatePage() {
  const cookieStore = await cookies();
  const session = cookieStore.get(ADMIN_SESSION_COOKIE_NAME)?.value ?? null;
  if (!verifyAdminSession(session)) {
    redirect("/admin/login?next=/admin/pool-aggregate");
  }

  const aggregate = await readAggregatePoolState();
  const nowMs = Date.now();
  const rows = aggregate.perToken.map((r, i) => buildRow(r, i, nowMs));

  return (
    <main
      style={{
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
        padding: "24px",
        background: "var(--v2-bg-elev0, #0b0d12)",
        color: "var(--v2-ink-1, #e6eaf2)",
        minHeight: "100vh",
      }}
    >
      <h1 style={{ fontSize: 18, marginBottom: 4 }}>
        GitHub token pool — FLEET view
      </h1>
      <p style={{ fontSize: 12, opacity: 0.7, marginTop: 0 }}>
        Last-write-wins aggregate across all Vercel lambdas (Redis-backed).
        For the per-process snapshot of a single lambda, see{" "}
        <a
          href="/admin/pool"
          style={{ color: "#7dd3fc", textDecoration: "underline" }}
        >
          /admin/pool
        </a>
        . Refresh to re-read.
      </p>

      {aggregate.redisUnavailable && (
        <div
          style={{
            marginTop: 16,
            padding: "10px 14px",
            background: "rgba(248, 113, 113, 0.12)",
            border: "1px solid rgba(248, 113, 113, 0.4)",
            borderRadius: 4,
            fontSize: 12,
            color: "#fca5a5",
          }}
        >
          DEGRADED — Redis is not configured or unreachable. Showing local
          token labels only; remaining / quarantine state is unavailable. Set
          REDIS_URL (Railway) or UPSTASH_REDIS_REST_URL +
          UPSTASH_REDIS_REST_TOKEN to activate the fleet view.
        </div>
      )}

      <section style={{ marginTop: 16, fontSize: 13 }}>
        <div>
          tokens seen: <strong>{aggregate.tokensSeen}</strong> · lambdas
          reporting: <strong>{aggregate.lambdasReporting}</strong>
        </div>
        <div>
          fleet remaining:{" "}
          <strong>
            {aggregate.totalRemainingAcrossFleet.toLocaleString()}
          </strong>{" "}
          · exhausted: <strong>{aggregate.exhaustedCount}</strong> ·
          quarantined: <strong>{aggregate.quarantinedCount}</strong>
        </div>
        <div style={{ opacity: 0.6, marginTop: 4 }}>
          assembled at {aggregate.assembledAt}
        </div>
      </section>

      <table
        style={{
          marginTop: 24,
          fontSize: 12,
          borderCollapse: "collapse",
          width: "100%",
        }}
      >
        <thead>
          <tr style={{ borderBottom: "1px solid #2a2f3a", textAlign: "left" }}>
            <th style={{ padding: "8px 12px" }}>#</th>
            <th style={{ padding: "8px 12px" }}>token</th>
            <th style={{ padding: "8px 12px" }}>remaining</th>
            <th style={{ padding: "8px 12px" }}>reset</th>
            <th style={{ padding: "8px 12px" }}>last seen</th>
            <th style={{ padding: "8px 12px" }}>quarantine</th>
            <th style={{ padding: "8px 12px" }}>last writer</th>
            <th style={{ padding: "8px 12px" }}>publish age</th>
            <th style={{ padding: "8px 12px" }}>health</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.idx}
              style={{ borderBottom: "1px solid #1a1d24", opacity: 0.95 }}
            >
              <td style={{ padding: "8px 12px" }}>{r.idx}</td>
              <td style={{ padding: "8px 12px" }}>{r.tokenLabel}</td>
              <td style={{ padding: "8px 12px" }}>{r.remaining}</td>
              <td style={{ padding: "8px 12px" }}>{r.resetAt}</td>
              <td style={{ padding: "8px 12px" }}>{r.lastObserved}</td>
              <td style={{ padding: "8px 12px" }}>{r.quarantine}</td>
              <td style={{ padding: "8px 12px" }}>{r.lambdaId}</td>
              <td style={{ padding: "8px 12px" }}>{r.writtenAt}</td>
              <td
                style={{
                  padding: "8px 12px",
                  color:
                    r.health === "healthy"
                      ? "#4ade80"
                      : r.health === "untouched"
                        ? "#94a3b8"
                        : r.health === "exhausted"
                          ? "#fbbf24"
                          : "#f87171",
                }}
              >
                {r.health}
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td
                colSpan={9}
                style={{
                  padding: "16px 12px",
                  textAlign: "center",
                  opacity: 0.7,
                }}
              >
                Local pool is empty. Configure GITHUB_TOKEN and/or
                GH_TOKEN_POOL.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </main>
  );
}
