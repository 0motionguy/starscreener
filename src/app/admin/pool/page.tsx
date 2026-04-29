// Admin — GitHub token pool snapshot.
//
// Per-token state for the in-process pool: redacted token suffix, last-known
// rate-limit remaining + reset, last observation, and quarantine flag. The
// snapshot is read-only — operator actions (rotate / quarantine) happen via
// env-var changes + restart. Pool state is per-process so this page reflects
// the lambda you happen to hit; multiple visits show different processes'
// views, which is expected and not a bug.
//
// Auth: same cookie session as /admin/scoring-shadow et al.

import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  ADMIN_SESSION_COOKIE_NAME,
  verifyAdminSession,
} from "@/lib/api/admin-session";
import {
  getGitHubTokenPool,
  redactToken,
} from "@/lib/github-token-pool";

export const metadata: Metadata = {
  title: "Admin — GitHub Token Pool",
  description:
    "Per-token rate-limit + quarantine state. Operator visibility into the pool that drives every GitHub call.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

interface RowVM {
  idx: number;
  redacted: string;
  remaining: string;
  resetAt: string;
  lastObserved: string;
  quarantine: string;
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

function buildRow(
  state: {
    token: string;
    remaining: number | null;
    resetUnixSec: number | null;
    lastObservedMs: number | null;
    quarantinedUntilMs: number | null;
  },
  idx: number,
  nowMs: number,
): RowVM {
  const nowSec = Math.floor(nowMs / 1000);
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

  return {
    idx,
    redacted: redactToken(state.token),
    remaining:
      state.remaining === null ? "—" : String(state.remaining),
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
    health,
  };
}

export default async function AdminPoolPage() {
  const cookieStore = await cookies();
  const session = cookieStore.get(ADMIN_SESSION_COOKIE_NAME)?.value ?? null;
  if (!verifyAdminSession(session)) {
    redirect("/admin/login?next=/admin/pool");
  }

  const pool = getGitHubTokenPool();
  const snapshot = pool.snapshot();
  const nowMs = Date.now();
  const rows = snapshot.map((s, i) => buildRow(s, i, nowMs));

  const healthy = rows.filter((r) => r.health === "healthy").length;
  const exhausted = rows.filter((r) => r.health === "exhausted").length;
  const quarantined = rows.filter((r) => r.health === "quarantined").length;
  const untouched = rows.filter((r) => r.health === "untouched").length;

  const poolEffective = pool.size() > 0;

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
        GitHub token pool — process snapshot
      </h1>
      <p style={{ fontSize: 12, opacity: 0.7, marginTop: 0 }}>
        Per-process view. Shows what THIS lambda has observed; sibling
        processes hold their own state. Refresh to re-read.
      </p>

      <section style={{ marginTop: 16, fontSize: 13 }}>
        <div>
          pool size:{" "}
          <strong>{pool.size()}</strong>{" "}
          {!poolEffective && (
            <span style={{ color: "#f87171" }}>
              ← EMPTY (set GITHUB_TOKEN or GH_TOKEN_POOL)
            </span>
          )}
        </div>
        <div>
          healthy: <strong>{healthy}</strong> · exhausted:{" "}
          <strong>{exhausted}</strong> · quarantined:{" "}
          <strong>{quarantined}</strong> · untouched:{" "}
          <strong>{untouched}</strong>
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
              <td style={{ padding: "8px 12px" }}>{r.redacted}</td>
              <td style={{ padding: "8px 12px" }}>{r.remaining}</td>
              <td style={{ padding: "8px 12px" }}>{r.resetAt}</td>
              <td style={{ padding: "8px 12px" }}>{r.lastObserved}</td>
              <td style={{ padding: "8px 12px" }}>{r.quarantine}</td>
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
                colSpan={7}
                style={{
                  padding: "16px 12px",
                  textAlign: "center",
                  opacity: 0.7,
                }}
              >
                Pool is empty. Configure GITHUB_TOKEN and/or GH_TOKEN_POOL.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </main>
  );
}
