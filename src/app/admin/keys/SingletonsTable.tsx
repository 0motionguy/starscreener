"use client";

import type { SingletonRow } from "@/app/api/admin/pool-state/route";
import { formatAge, SectionShell, StatusPill } from "./PoolAnomalies";

export function SingletonsTable({ rows }: { rows: SingletonRow[] }) {
  const red = rows.filter((row) => row.status === "RED" || row.status === "DEAD").length;
  const yellow = rows.filter((row) => row.status === "YELLOW").length;
  const status = red > 0 ? "RED" : yellow > 0 ? "YELLOW" : "GREEN";
  return (
    <SectionShell
      eyebrow="E / Other Singletons"
      title="Single-token and source freshness"
      status={status}
      summary={`${rows.length} singleton source rows from _meta sidecars and data-store timestamps.`}
    >
      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr style={{ borderBottom: "1px solid var(--v3-line-100)" }}>
              <Th>Source</Th>
              <Th>Last successful call</Th>
              <Th>Last failure</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.name} style={{ borderBottom: "1px dashed var(--v3-line-100)" }}>
                <Td><span className="v2-mono">{row.name}</span></Td>
                <Td>{formatAge(row.lastSuccess)}</Td>
                <Td>{formatAge(row.lastFailure)}</Td>
                <Td><StatusPill status={row.status} /></Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionShell>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="v2-mono px-3 py-2 text-left text-[10px] tracking-[0.16em] uppercase" style={{ color: "var(--v3-ink-400)" }}>{children}</th>;
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-3 py-2 align-middle" style={{ color: "var(--v3-ink-100)" }}>{children}</td>;
}
