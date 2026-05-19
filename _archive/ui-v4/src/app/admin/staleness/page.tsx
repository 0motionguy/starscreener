// Admin — staleness sweep report.
//
// Reads data/staleness-report.json (written daily by
// scripts/sweep-staleness.mjs at 02:00 UTC via .github/workflows/sweep-staleness.yml)
// and renders one section per source listing offenders past `cadence × 2`.
//
// Auth: mirrors src/app/admin/scoring-shadow/page.tsx — cookie-session
// gate with redirect to /admin/login on miss.

import type { Metadata } from "next";
import { cookies } from "next/headers";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { redirect } from "next/navigation";

import {
  ADMIN_SESSION_COOKIE_NAME,
  verifyAdminSession,
} from "@/lib/api/admin-session";

export const metadata: Metadata = {
  title: "Admin — Staleness sweep",
  description:
    "Per-source list of records older than cadence × 2. Diagnostic; refresh is owned by the cron pipeline.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

interface StaleExample {
  id: string;
  lastRefreshedAt: string;
  ageHours: number;
}

interface SourceReport {
  slug: string;
  total: number;
  stale: number;
  thresholdHours: number;
  examples: StaleExample[];
  notes?: string[];
}

interface StalenessReport {
  generatedAt: string;
  sources: SourceReport[];
}

async function readStalenessReport(): Promise<StalenessReport | null> {
  // Read the bundled JSON directly. The sweeper writes the file at 02:00
  // UTC; the next deploy bakes it into the build output. We don't go
  // through the data-store here because the sweeper isn't (yet) a
  // dual-write source — it's a daily diagnostic, not live data.
  try {
    const path = resolve(process.cwd(), "data", "staleness-report.json");
    const txt = await readFile(path, "utf8");
    return JSON.parse(txt) as StalenessReport;
  } catch {
    return null;
  }
}

export default async function StalenessAdminPage() {
  const cookieStore = await cookies();
  const session = cookieStore.get(ADMIN_SESSION_COOKIE_NAME)?.value ?? null;
  if (!verifyAdminSession(session)) {
    redirect("/admin/login?next=/admin/staleness");
  }

  const report = await readStalenessReport();
  const totalStale = report?.sources.reduce((acc, s) => acc + s.stale, 0) ?? 0;
  const totalRecords = report?.sources.reduce((acc, s) => acc + s.total, 0) ?? 0;

  return (
    <div className="mx-auto max-w-[1400px] px-6 py-10">
      <header className="mb-8">
        <p
          className="v2-mono text-[10px] tracking-[0.22em] uppercase"
          style={{ color: "var(--v3-ink-400)" }}
        >
          Admin / Staleness Sweep
        </p>
        <h1
          className="mt-1 text-[28px] leading-tight"
          style={{ color: "var(--v3-ink-100)" }}
        >
          Records past cadence × 2
        </h1>
        <p
          className="mt-2 text-[13px] max-w-3xl"
          style={{ color: "var(--v3-ink-300)" }}
        >
          Daily 02:00 UTC sweep. Each row is one source, sorted by stale-record
          count. Examples are the worst-offending 20 entries per source. The
          report is a diagnostic — refresh is still owned by the per-source
          cron workflows. If a source is consistently red here, the workflow
          for that source is failing or running too infrequently.
        </p>
        {report ? (
          <p
            className="v2-mono mt-3 text-[10px] tracking-[0.18em] uppercase"
            style={{ color: "var(--v3-ink-400)" }}
          >
            generated {report.generatedAt} · {totalStale} stale / {totalRecords} total
          </p>
        ) : null}
      </header>

      {!report || report.sources.length === 0 ? (
        <EmptyState
          message={
            !report
              ? "No staleness report found. Run scripts/sweep-staleness.mjs (or wait for the daily 02:00 UTC workflow)."
              : "Sweep ran but reported nothing — no sources scanned."
          }
        />
      ) : (
        <div className="space-y-10">
          {report.sources.map((source) => (
            <SourceSection key={source.slug} report={source} />
          ))}
        </div>
      )}
    </div>
  );
}

function SourceSection({ report }: { report: SourceReport }) {
  const stalePct =
    report.total > 0 ? Math.round((report.stale / report.total) * 100) : 0;
  const headerColor =
    report.stale === 0
      ? "var(--v3-ink-100)"
      : stalePct >= 25
        ? "#f87171"
        : "#fbbf24";

  return (
    <section>
      <header className="mb-3 flex flex-wrap items-baseline gap-x-6 gap-y-2">
        <h2
          className="v2-mono text-[14px] tracking-[0.18em] uppercase"
          style={{ color: headerColor }}
        >
          {report.slug}
        </h2>
        <Stat
          label="Stale"
          value={`${report.stale}/${report.total}`}
        />
        <Stat label="Stale %" value={`${stalePct}%`} />
        <Stat label="Threshold" value={`${report.thresholdHours}h`} />
      </header>

      {report.notes && report.notes.length > 0 ? (
        <ul
          className="mb-3 space-y-1 text-[11px]"
          style={{ color: "var(--v3-ink-400)" }}
        >
          {report.notes.map((note, i) => (
            <li key={i}>· {note}</li>
          ))}
        </ul>
      ) : null}

      {report.examples.length === 0 ? (
        <p
          className="v2-mono text-[11px]"
          style={{ color: "var(--v3-ink-400)" }}
        >
          {report.stale === 0
            ? "All records fresh."
            : "No example offenders captured."}
        </p>
      ) : (
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
                <Th>Record</Th>
                <Th align="right">Age (hours)</Th>
                <Th align="right">Last refreshed</Th>
              </tr>
            </thead>
            <tbody>
              {report.examples.map((ex) => (
                <tr
                  key={`${report.slug}:${ex.id}`}
                  style={{ borderBottom: "1px solid var(--v3-line-050)" }}
                >
                  <Td>
                    <span
                      className="v2-mono text-[11px]"
                      style={{ color: "var(--v3-ink-100)" }}
                    >
                      {ex.id}
                    </span>
                  </Td>
                  <Td align="right">
                    <span
                      className="v2-mono text-[11px] tabular-nums"
                      style={{
                        color:
                          ex.ageHours > report.thresholdHours * 4
                            ? "#f87171"
                            : "var(--v3-ink-200)",
                      }}
                    >
                      {ex.ageHours.toFixed(1)}
                    </span>
                  </Td>
                  <Td align="right">
                    <span
                      className="v2-mono text-[10px] tracking-[0.12em]"
                      style={{ color: "var(--v3-ink-400)" }}
                    >
                      {ex.lastRefreshedAt}
                    </span>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span
        className="v2-mono text-[10px] tracking-[0.16em] uppercase"
        style={{ color: "var(--v3-ink-400)" }}
      >
        {label}
      </span>
      <span
        className="v2-mono text-[12px] tabular-nums"
        style={{ color: "var(--v3-ink-100)" }}
      >
        {value}
      </span>
    </span>
  );
}

function Th({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      className="v2-mono px-3 py-2 text-[10px] tracking-[0.18em] uppercase"
      style={{
        color: "var(--v3-ink-400)",
        textAlign: align,
        fontWeight: 400,
      }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <td
      className="px-3 py-2"
      style={{ textAlign: align }}
    >
      {children}
    </td>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div
      className="rounded-[2px] border border-dashed px-6 py-12 text-center"
      style={{
        borderColor: "var(--v3-line-100)",
        background: "var(--v3-bg-025)",
      }}
    >
      <p
        className="v2-mono text-[11px] tracking-[0.18em] uppercase"
        style={{ color: "var(--v3-ink-300)" }}
      >
        No report available
      </p>
      <p
        className="mt-2 text-[12px]"
        style={{ color: "var(--v3-ink-400)" }}
      >
        {message}
      </p>
    </div>
  );
}
