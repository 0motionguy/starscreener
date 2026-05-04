"use client";

import { KeyRound } from "lucide-react";

import type { AdminPoolStateResponse, GithubPoolRow } from "@/app/api/admin/pool-state/route";
import { formatAge, formatDateTime, SectionShell, StatusPill } from "./PoolAnomalies";

export function GithubPoolSection({
  data,
}: {
  data: AdminPoolStateResponse["github"];
}) {
  return (
    <SectionShell
      eyebrow="B / GitHub Token Pool"
      title="GitHub rotation"
      status={data.health}
      summary={
        <>
          {data.totalConfigured} configured key(s). Idle threshold is 12h. Only fingerprints are shown.
        </>
      }
    >
      <div className="grid gap-3 md:grid-cols-3">
        <Stat label="Configured" value={String(data.totalConfigured)} />
        <Stat label="Requests 24h" value={String(data.rows.reduce((sum, row) => sum + row.requests24h, 0))} />
        <Stat label="Quarantined" value={String(data.rows.filter((row) => row.quarantine.active).length)} />
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr style={{ borderBottom: "1px solid var(--v3-line-100)" }}>
              <Th>Key</Th>
              <Th align="right">Requests</Th>
              <Th align="right">Remaining</Th>
              <Th>Quarantine</Th>
              <Th>Last used</Th>
              <Th>Operation</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row) => <GithubRow key={row.fingerprint} row={row} />)}
          </tbody>
        </table>
      </div>
    </SectionShell>
  );
}

function GithubRow({ row }: { row: GithubPoolRow }) {
  return (
    <tr style={{ borderBottom: "1px dashed var(--v3-line-100)" }}>
      <Td>
        <span className="inline-flex items-center gap-2">
          <KeyRound size={14} aria-hidden="true" />
          <span className="v2-mono">{row.fingerprint}</span>
        </span>
      </Td>
      <Td align="right">{row.requests24h}</Td>
      <Td align="right">{row.lastRateLimitRemaining ?? "-"}</Td>
      <Td>{row.quarantine.active ? `${row.quarantine.reason ?? "unknown"} until ${formatDateTime(row.quarantine.until)}` : "-"}</Td>
      <Td>{formatAge(row.lastCallAt)}</Td>
      <Td>{row.lastOperation ?? "-"}</Td>
      <Td><StatusPill status={row.idle ? "RED" : row.status} label={row.idle ? "IDLE" : row.status} /></Td>
    </tr>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[2px] border p-3" style={{ borderColor: "var(--v3-line-100)", background: "var(--v3-bg-050)" }}>
      <p className="v2-mono text-[10px] tracking-[0.16em] uppercase" style={{ color: "var(--v3-ink-400)" }}>{label}</p>
      <p className="mt-1 text-[20px] tabular-nums" style={{ color: "var(--v3-ink-100)" }}>{value}</p>
    </div>
  );
}

function Th({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "right" }) {
  return <th className="v2-mono px-3 py-2 text-[10px] tracking-[0.16em] uppercase" style={{ color: "var(--v3-ink-400)", textAlign: align }}>{children}</th>;
}

function Td({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "right" }) {
  return <td className="px-3 py-2 align-middle tabular-nums" style={{ color: "var(--v3-ink-100)", textAlign: align }}>{children}</td>;
}
