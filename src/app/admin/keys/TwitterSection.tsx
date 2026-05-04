"use client";

import type { AdminPoolStateResponse } from "@/app/api/admin/pool-state/route";
import { formatAge, formatDateTime, SectionShell, StatusPill } from "./PoolAnomalies";

export function TwitterSection({
  data,
}: {
  data: AdminPoolStateResponse["twitter"];
}) {
  const totalCalls = data.sources.reduce((sum, row) => sum + row.requests24h, 0);
  return (
    <SectionShell
      eyebrow="D / Twitter + Apify"
      title="Apify primary, Nitter fallback"
      status={data.apify.status}
      summary={
        <>
          {totalCalls} telemetry call(s) in 24h. Degradation rate {Math.round(data.degradationRate24h * 100)}%.
        </>
      }
    >
      <div className="grid gap-3 md:grid-cols-4">
        <Metric label="Apify status" value={data.apify.status} />
        <Metric label="Last success" value={formatAge(data.apify.lastSuccess)} />
        <Metric label="Last fail" value={formatAge(data.apify.lastFailure)} />
        <Metric label="Quota" value={data.apify.estimatedQuotaState} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="overflow-x-auto rounded-[2px] border" style={{ borderColor: "var(--v3-line-100)" }}>
          <table className="w-full text-[12px]">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--v3-line-100)" }}>
                <Th>Source</Th>
                <Th align="right">Requests</Th>
                <Th align="right">Success</Th>
                <Th align="right">Fail</Th>
                <Th>Last call</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {data.sources.map((row) => (
                <tr key={row.source} style={{ borderBottom: "1px dashed var(--v3-line-100)" }}>
                  <Td>{row.source}</Td>
                  <Td align="right">{row.requests24h}</Td>
                  <Td align="right">{row.success24h}</Td>
                  <Td align="right">{row.fail24h}</Td>
                  <Td>{formatAge(row.lastCallAt)}</Td>
                  <Td><StatusPill status={row.status} /></Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="overflow-x-auto rounded-[2px] border" style={{ borderColor: "var(--v3-line-100)" }}>
          <table className="w-full text-[12px]">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--v3-line-100)" }}>
                <Th>Nitter instance</Th>
                <Th>Health</Th>
                <Th>Last check</Th>
                <Th align="right">Success 24h</Th>
              </tr>
            </thead>
            <tbody>
              {data.nitterInstances.map((row) => (
                <tr key={row.url} style={{ borderBottom: "1px dashed var(--v3-line-100)" }}>
                  <Td>{row.url}</Td>
                  <Td><StatusPill status={row.status === "dead" ? "RED" : row.status === "healthy" ? "GREEN" : "YELLOW"} label={row.status} /></Td>
                  <Td>{formatDateTime(row.lastChecked)}</Td>
                  <Td align="right">{row.successRate24h === null ? "-" : `${Math.round(row.successRate24h * 100)}%`}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </SectionShell>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[2px] border p-3" style={{ borderColor: "var(--v3-line-100)", background: "var(--v3-bg-050)" }}>
      <p className="v2-mono text-[10px] tracking-[0.16em] uppercase" style={{ color: "var(--v3-ink-400)" }}>{label}</p>
      <p className="mt-1 truncate text-[13px]" style={{ color: "var(--v3-ink-100)" }}>{value}</p>
    </div>
  );
}

function Th({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "right" }) {
  return <th className="v2-mono px-3 py-2 text-[10px] tracking-[0.16em] uppercase" style={{ color: "var(--v3-ink-400)", textAlign: align }}>{children}</th>;
}

function Td({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "right" }) {
  return <td className="px-3 py-2 align-middle tabular-nums" style={{ color: "var(--v3-ink-100)", textAlign: align }}>{children}</td>;
}
