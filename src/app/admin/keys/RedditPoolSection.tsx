"use client";

import type { AdminPoolStateResponse } from "@/app/api/admin/pool-state/route";
import { formatAge, formatDateTime, SectionShell, StatusPill } from "./PoolAnomalies";

export function RedditPoolSection({
  data,
}: {
  data: AdminPoolStateResponse["reddit"];
}) {
  return (
    <SectionShell
      eyebrow="C / Reddit User-Agent Pool"
      title="Reddit UA rotation"
      status={data.health}
      summary={
        <>
          {data.totalConfigured} honest User-Agent identities. Current-hour 429 count: {data.rateLimitedLastHour}.
        </>
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr style={{ borderBottom: "1px solid var(--v3-line-100)" }}>
              <Th>User-Agent</Th>
              <Th>Fingerprint</Th>
              <Th align="right">Requests</Th>
              <Th align="right">Fail</Th>
              <Th>Last 429</Th>
              <Th>Quarantine</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row) => (
              <tr key={row.fingerprint} style={{ borderBottom: "1px dashed var(--v3-line-100)" }}>
                <Td>{row.userAgentLabel}</Td>
                <Td><span className="v2-mono">{row.fingerprint}</span></Td>
                <Td align="right">{row.requests24h}</Td>
                <Td align="right">{row.fail24h}</Td>
                <Td>{formatAge(row.last429At)}</Td>
                <Td>{row.quarantine.active ? `${row.quarantine.reason ?? "unknown"} until ${formatDateTime(row.quarantine.until)}` : "-"}</Td>
                <Td><StatusPill status={row.status} /></Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionShell>
  );
}

function Th({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "right" }) {
  return <th className="v2-mono px-3 py-2 text-[10px] tracking-[0.16em] uppercase" style={{ color: "var(--v3-ink-400)", textAlign: align }}>{children}</th>;
}

function Td({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "right" }) {
  return <td className="px-3 py-2 align-middle tabular-nums" style={{ color: "var(--v3-ink-100)", textAlign: align }}>{children}</td>;
}
