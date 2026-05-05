import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  ADMIN_SESSION_COOKIE_NAME,
  verifyAdminSession,
} from "@/lib/api/admin-session";

export const metadata: Metadata = {
  title: "Admin - Observability",
  description:
    "Operational observability dashboard mock: Sentry, Redis, GitHub pool, and alert thresholds.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type AlertRule = {
  id: string;
  signal: string;
  trigger: string;
  threshold: string;
  window: string;
  severity: "high" | "medium";
  route: string;
  action: string;
};

const ALERT_RULES: AlertRule[] = [
  {
    id: "OBS-GH-POOL-001",
    signal: "GitHub token pool exhausted",
    trigger: "usable token count == 0",
    threshold: "for 2 consecutive checks",
    window: "2m",
    severity: "high",
    route: "/api/admin/pool-state",
    action: "page on-call + suspend GitHub-backed ingestion jobs",
  },
  {
    id: "OBS-REDIS-001",
    signal: "Redis memory pressure",
    trigger: "used_memory / maxmemory >= 0.70",
    threshold: "persisting for >= 10m",
    window: "10m",
    severity: "high",
    route: "/api/worker/health",
    action: "warn at 70%, throttle non-critical writes, page at 85%",
  },
  {
    id: "OBS-SENTRY-001",
    signal: "Sentry error-rate spike",
    trigger: "5xx + fatal events exceed baseline x3",
    threshold: ">= 15 events / 5m and ratio >= 3x 7d baseline",
    window: "5m",
    severity: "high",
    route: "/api/admin/sentry-verify",
    action: "open incident channel + freeze non-essential deploys",
  },
];

function severityStyle(severity: AlertRule["severity"]) {
  if (severity === "high") {
    return {
      borderColor: "var(--v3-sig-red)",
      background: "color-mix(in srgb, var(--v3-sig-red) 10%, transparent)",
      color: "var(--v3-sig-red)",
    };
  }
  return {
    borderColor: "var(--v3-sig-amber)",
    background: "color-mix(in srgb, var(--v3-sig-amber) 10%, transparent)",
    color: "var(--v3-sig-amber)",
  };
}

export default async function AdminObservabilityPage() {
  const cookieStore = await cookies();
  const session = cookieStore.get(ADMIN_SESSION_COOKIE_NAME)?.value ?? null;
  if (!verifyAdminSession(session)) {
    redirect("/admin/login?next=/admin/observability");
  }

  return (
    <main className="mx-auto max-w-[1400px] px-6 py-10">
      <header className="mb-6">
        <p
          className="v2-mono text-[10px] tracking-[0.22em] uppercase"
          style={{ color: "var(--v3-ink-400)" }}
        >
          Admin / Observability
        </p>
        <h1
          className="mt-1 text-[28px] leading-tight"
          style={{ color: "var(--v3-ink-100)" }}
        >
          Runtime health and alerting control plane
        </h1>
        <p className="mt-2 text-[13px]" style={{ color: "var(--v3-ink-300)" }}>
          Mock surface for AGN-490 handoff. Wires existing health endpoints into
          operator-first thresholds before incident routing is automated.
        </p>
      </header>

      <section
        className="mb-6 rounded-[2px] border px-4 py-4"
        style={{
          borderColor: "var(--v3-line-100)",
          background: "var(--v3-bg-025)",
        }}
      >
        <h2
          className="v2-mono text-[11px] tracking-[0.16em] uppercase"
          style={{ color: "var(--v3-ink-300)" }}
        >
          Priority Alert Rules
        </h2>
        <p className="mt-2 text-[12px]" style={{ color: "var(--v3-ink-300)" }}>
          Required coverage from AGN-490: GitHub pool exhaustion, Redis memory
          pressure, and Sentry spike detection.
        </p>
      </section>

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
              <th className="px-3 py-2 text-left v2-mono text-[10px] tracking-[0.18em] uppercase" style={{ color: "var(--v3-ink-400)", fontWeight: 400 }}>rule</th>
              <th className="px-3 py-2 text-left v2-mono text-[10px] tracking-[0.18em] uppercase" style={{ color: "var(--v3-ink-400)", fontWeight: 400 }}>signal</th>
              <th className="px-3 py-2 text-left v2-mono text-[10px] tracking-[0.18em] uppercase" style={{ color: "var(--v3-ink-400)", fontWeight: 400 }}>trigger</th>
              <th className="px-3 py-2 text-left v2-mono text-[10px] tracking-[0.18em] uppercase" style={{ color: "var(--v3-ink-400)", fontWeight: 400 }}>threshold</th>
              <th className="px-3 py-2 text-right v2-mono text-[10px] tracking-[0.18em] uppercase" style={{ color: "var(--v3-ink-400)", fontWeight: 400 }}>window</th>
              <th className="px-3 py-2 text-right v2-mono text-[10px] tracking-[0.18em] uppercase" style={{ color: "var(--v3-ink-400)", fontWeight: 400 }}>severity</th>
              <th className="px-3 py-2 text-right v2-mono text-[10px] tracking-[0.18em] uppercase" style={{ color: "var(--v3-ink-400)", fontWeight: 400 }}>route</th>
            </tr>
          </thead>
          <tbody>
            {ALERT_RULES.map((rule) => (
              <tr key={rule.id} style={{ borderBottom: "1px solid var(--v3-line-050)" }}>
                <td className="px-3 py-2">
                  <span className="v2-mono text-[10px]" style={{ color: "var(--v3-ink-200)" }}>
                    {rule.id}
                  </span>
                </td>
                <td className="px-3 py-2" style={{ color: "var(--v3-ink-100)" }}>
                  {rule.signal}
                </td>
                <td className="px-3 py-2" style={{ color: "var(--v3-ink-300)" }}>
                  {rule.trigger}
                </td>
                <td className="px-3 py-2" style={{ color: "var(--v3-ink-300)" }}>
                  {rule.threshold}
                </td>
                <td className="px-3 py-2 text-right">
                  <span className="v2-mono text-[10px] tracking-[0.12em]" style={{ color: "var(--v3-ink-300)" }}>
                    {rule.window}
                  </span>
                </td>
                <td className="px-3 py-2 text-right">
                  <span className="rounded-[2px] border px-2 py-0.5 v2-mono text-[10px] tracking-[0.14em] uppercase" style={severityStyle(rule.severity)}>
                    {rule.severity}
                  </span>
                </td>
                <td className="px-3 py-2 text-right">
                  <span className="v2-mono text-[10px] tracking-[0.12em]" style={{ color: "var(--v3-ink-400)" }}>
                    {rule.route}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section
        className="mt-6 rounded-[2px] border px-4 py-4"
        style={{
          borderColor: "var(--v3-line-100)",
          background: "var(--v3-bg-025)",
        }}
      >
        <h2
          className="v2-mono text-[11px] tracking-[0.16em] uppercase"
          style={{ color: "var(--v3-ink-300)" }}
        >
          Dispatch Actions
        </h2>
        <ul className="mt-2 space-y-1 text-[12px]" style={{ color: "var(--v3-ink-300)" }}>
          <li>1. Emit OPS webhook and Sentry tagged event for every high alert.</li>
          <li>2. Link alert to runbook (`docs/forensic/AGN-739...`) and owner.</li>
          <li>3. Suppress duplicate pages for 15m while incident remains active.</li>
        </ul>
      </section>
    </main>
  );
}
