import type { Metadata } from "next";
import { cookies } from "next/headers";
import { NextRequest } from "next/server";
import { redirect } from "next/navigation";

import {
  ADMIN_SESSION_COOKIE_NAME,
  verifyAdminSession,
} from "@/lib/api/admin-session";
import {
  GET as getAdminSources,
  type AdminSourcesResponse,
} from "@/app/api/admin/sources/route";

export const metadata: Metadata = {
  title: "Admin - Source SLA",
  description:
    "Per-source freshness SLA dashboard from /api/admin/sources.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

function ageLabel(ms: number | null): string {
  if (ms === null) return "-";
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
  if (ms < 86_400_000) return `${(ms / 3_600_000).toFixed(1)}h`;
  return `${(ms / 86_400_000).toFixed(1)}d`;
}

function statusStyle(status: "GREEN" | "YELLOW" | "RED") {
  if (status === "GREEN") {
    return {
      borderColor: "var(--v3-sig-green)",
      background: "color-mix(in srgb, var(--v3-sig-green) 10%, transparent)",
      color: "var(--v3-sig-green)",
    };
  }
  if (status === "YELLOW") {
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

export default async function AdminSourcesPage() {
  const cookieStore = await cookies();
  const session = cookieStore.get(ADMIN_SESSION_COOKIE_NAME)?.value ?? null;
  if (!verifyAdminSession(session)) {
    redirect("/admin/login?next=/admin/sources");
  }

  const headerCookie = cookieStore
    .getAll()
    .map((entry) => `${entry.name}=${entry.value}`)
    .join("; ");

  const request = new NextRequest("http://localhost/api/admin/sources", {
    headers: headerCookie ? { cookie: headerCookie } : {},
  });
  const response = await getAdminSources(request);
  const body = (await response.json()) as
    | AdminSourcesResponse
    | { ok: false; reason?: string; error?: string };
  const errorBody = body as { ok?: false; reason?: string; error?: string };

  if (!("rows" in body) || !Array.isArray(body.rows)) {
    return (
      <main className="mx-auto max-w-[1400px] px-6 py-10">
        <p
          className="v2-mono text-[10px] tracking-[0.22em] uppercase"
          style={{ color: "var(--v3-ink-400)" }}
        >
          Admin / Source SLA
        </p>
        <h1
          className="mt-1 text-[28px] leading-tight"
          style={{ color: "var(--v3-ink-100)" }}
        >
          Sources unavailable
        </h1>
        <p className="mt-3 text-[13px]" style={{ color: "var(--v3-ink-300)" }}>
          {errorBody.error ?? errorBody.reason ?? "unknown failure"}
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-[1400px] px-6 py-10">
      <header className="mb-6">
        <p
          className="v2-mono text-[10px] tracking-[0.22em] uppercase"
          style={{ color: "var(--v3-ink-400)" }}
        >
          Admin / Source SLA
        </p>
        <h1
          className="mt-1 text-[28px] leading-tight"
          style={{ color: "var(--v3-ink-100)" }}
        >
          Per-source SLA status
        </h1>
        <p className="mt-2 text-[13px]" style={{ color: "var(--v3-ink-300)" }}>
          generated {body.generatedAt} · health {body.health}
        </p>
      </header>

      <div
        className="overflow-x-auto rounded-[2px] border"
        style={{
          borderColor: "var(--v3-line-100)",
          background: "var(--v3-bg-025)",
        }}
      >
        <table className="w-full text-[12px]">
          <thead>
            <tr style={{ borderBottom: "1px solid var(--v3-line-100)" }}>
              <th className="px-3 py-2 text-left v2-mono text-[10px] tracking-[0.18em] uppercase" style={{ color: "var(--v3-ink-400)", fontWeight: 400 }}>source</th>
              <th className="px-3 py-2 text-left v2-mono text-[10px] tracking-[0.18em] uppercase" style={{ color: "var(--v3-ink-400)", fontWeight: 400 }}>status</th>
              <th className="px-3 py-2 text-right v2-mono text-[10px] tracking-[0.18em] uppercase" style={{ color: "var(--v3-ink-400)", fontWeight: 400 }}>last_success_at</th>
              <th className="px-3 py-2 text-right v2-mono text-[10px] tracking-[0.18em] uppercase" style={{ color: "var(--v3-ink-400)", fontWeight: 400 }}>age</th>
              <th className="px-3 py-2 text-right v2-mono text-[10px] tracking-[0.18em] uppercase" style={{ color: "var(--v3-ink-400)", fontWeight: 400 }}>error_rate_24h</th>
              <th className="px-3 py-2 text-right v2-mono text-[10px] tracking-[0.18em] uppercase" style={{ color: "var(--v3-ink-400)", fontWeight: 400 }}>rate_limit_remaining</th>
            </tr>
          </thead>
          <tbody>
            {body.rows.map((row) => (
              <tr key={row.source} style={{ borderBottom: "1px solid var(--v3-line-050)" }}>
                <td className="px-3 py-2">
                  <span className="v2-mono text-[11px]" style={{ color: "var(--v3-ink-100)" }}>
                    {row.source}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <span
                    className="rounded-[2px] border px-2 py-0.5 v2-mono text-[10px] tracking-[0.14em] uppercase"
                    style={statusStyle(row.status)}
                  >
                    {row.status}
                  </span>
                </td>
                <td className="px-3 py-2 text-right">
                  <span className="v2-mono text-[10px] tracking-[0.12em]" style={{ color: "var(--v3-ink-400)" }}>
                    {row.last_success_at ?? "-"}
                  </span>
                </td>
                <td className="px-3 py-2 text-right">
                  <span className="v2-mono text-[11px] tabular-nums" style={{ color: "var(--v3-ink-200)" }}>
                    {ageLabel(row.age_ms)}
                  </span>
                </td>
                <td className="px-3 py-2 text-right">
                  <span className="v2-mono text-[10px] tracking-[0.12em]" style={{ color: "var(--v3-ink-400)" }}>
                    {row.error_rate_24h === null ? "-" : `${(row.error_rate_24h * 100).toFixed(1)}%`}
                  </span>
                </td>
                <td className="px-3 py-2 text-right">
                  <span className="v2-mono text-[10px] tracking-[0.12em]" style={{ color: "var(--v3-ink-400)" }}>
                    {row.rate_limit_remaining === null ? "-" : row.rate_limit_remaining}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
