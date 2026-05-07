// Admin — cross-source sweep cost (last 7 days).
//
// The orchestrator's meta sidecar (data/_meta/cross-source-mentions.json) only
// stores the latest snapshot, so for a 7-day rollup we stream the durable
// per-event log at data/repo-mentions-detail.jsonl and bucket events by source
// channel. Costs are estimated from the verified 2026-05 Apify/Tavily price
// table; non-Apify/non-Tavily channels are free.
//
// Auth: cookie-session gate, mirroring src/app/admin/staleness/page.tsx —
// redirect to /admin/login on miss.

import type { Metadata } from "next";
import { cookies } from "next/headers";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { resolve } from "node:path";
import { createInterface } from "node:readline";
import { redirect } from "next/navigation";

import {
  ADMIN_SESSION_COOKIE_NAME,
  verifyAdminSession,
} from "@/lib/api/admin-session";

export const metadata: Metadata = {
  title: "Admin — Sweep cost (7d)",
  description:
    "Cumulative cost of the cross-source mentions sweep over the last 7 days, broken down by Apify actor / channel.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1_000;

/** Per-event cost ($/event) for paid channels. Free channels omitted. */
const TWITTER_DEFAULT_COST_USD_PER_EVENT = 0.0004; // $0.40 / 1k tweets
const TAVILY_COST_USD_PER_REQUEST = 0.005; // $0.005 / search

/** Channel order in the table — paid channels first, then free. */
const CHANNEL_ORDER = [
  "twitter",
  "tavily",
  "reddit",
  "hackernews",
  "bluesky",
  "devto",
  "lobsters",
  "producthunt",
] as const;
type Channel = (typeof CHANNEL_ORDER)[number];

interface ChannelStats {
  channel: string;
  events: number;
  uniqueScans: number;
  costUsd: number;
}

interface SweepCostReport {
  generatedAt: string;
  windowStart: string;
  windowEnd: string;
  totalEvents: number;
  channels: ChannelStats[];
  totalCostUsd: number;
  twitterCostPerEventUsd: number;
  twitterCostOverrideActive: boolean;
  twitterActor: string;
  jsonlMissing: boolean;
  malformedLines: number;
}

/**
 * Resolve twitter $/event from env. APIFY_TWITTER_ACTOR_COST_USD is documented
 * as "dollars per 1000", so we divide by 1000. Bad values fall back to default.
 */
function resolveTwitterCostPerEvent(): {
  costPerEvent: number;
  overrideActive: boolean;
} {
  const raw = process.env.APIFY_TWITTER_ACTOR_COST_USD;
  if (typeof raw === "string" && raw.trim().length > 0) {
    const parsed = Number.parseFloat(raw.trim());
    if (Number.isFinite(parsed) && parsed >= 0) {
      return { costPerEvent: parsed / 1000, overrideActive: true };
    }
  }
  return {
    costPerEvent: TWITTER_DEFAULT_COST_USD_PER_EVENT,
    overrideActive: false,
  };
}

interface RawEvent {
  source?: unknown;
  observedAt?: unknown;
  scanRunId?: unknown;
  fullName?: unknown;
}

async function buildReport(): Promise<SweepCostReport> {
  const now = Date.now();
  const cutoff = now - SEVEN_DAYS_MS;
  const path = resolve(process.cwd(), "data", "repo-mentions-detail.jsonl");

  const { costPerEvent: twitterCostPerEvent, overrideActive } =
    resolveTwitterCostPerEvent();
  const twitterActor =
    process.env.APIFY_TWITTER_ACTOR ?? "apidojo~tweet-scraper";

  // Per-channel event count + per-channel set of unique (scanRunId|fullName)
  // pairs. Tavily costs are per-request, approximated as one request per
  // (scan, repo) pair.
  const eventsByChannel = new Map<string, number>();
  const tavilyScanRepoPairs = new Set<string>();
  let totalEvents = 0;
  let malformedLines = 0;
  let jsonlMissing = false;

  try {
    await stat(path);
  } catch {
    jsonlMissing = true;
  }

  if (!jsonlMissing) {
    const rl = createInterface({
      input: createReadStream(path, { encoding: "utf8" }),
      crlfDelay: Infinity,
    });

    for await (const line of rl) {
      const trimmed = line.trim();
      if (trimmed.length === 0) continue;
      let parsed: RawEvent;
      try {
        parsed = JSON.parse(trimmed) as RawEvent;
      } catch {
        malformedLines += 1;
        continue;
      }
      const source = typeof parsed.source === "string" ? parsed.source : null;
      const observedAt =
        typeof parsed.observedAt === "string" ? parsed.observedAt : null;
      if (!source || !observedAt) {
        malformedLines += 1;
        continue;
      }
      const observedMs = Date.parse(observedAt);
      if (!Number.isFinite(observedMs) || observedMs < cutoff) continue;

      totalEvents += 1;
      eventsByChannel.set(source, (eventsByChannel.get(source) ?? 0) + 1);

      if (source === "tavily") {
        const scanRunId =
          typeof parsed.scanRunId === "string" ? parsed.scanRunId : "";
        const fullName =
          typeof parsed.fullName === "string" ? parsed.fullName : "";
        if (scanRunId && fullName) {
          tavilyScanRepoPairs.add(`${scanRunId}|${fullName}`);
        }
      }
    }
  }

  // Build the row set: every observed channel + every channel in CHANNEL_ORDER
  // (so the table shows zero-rows for known-but-empty channels too).
  const seen = new Set<string>([
    ...eventsByChannel.keys(),
    ...CHANNEL_ORDER,
  ]);
  const channels: ChannelStats[] = [];
  for (const channel of seen) {
    const events = eventsByChannel.get(channel) ?? 0;
    let costUsd = 0;
    let uniqueScans = 0;
    if (channel === "twitter") {
      costUsd = events * twitterCostPerEvent;
    } else if (channel === "tavily") {
      uniqueScans = tavilyScanRepoPairs.size;
      // For tavily we charge per unique (scan, repo) pair, not per event.
      // But tavily events are a fan-out of the search results, so the cost
      // is keyed on scan-repo pairs only.
      costUsd = uniqueScans * TAVILY_COST_USD_PER_REQUEST;
    }
    channels.push({ channel, events, uniqueScans, costUsd });
  }
  channels.sort((a, b) => {
    const ai = (CHANNEL_ORDER as readonly string[]).indexOf(a.channel);
    const bi = (CHANNEL_ORDER as readonly string[]).indexOf(b.channel);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return a.channel.localeCompare(b.channel);
  });

  const totalCostUsd = channels.reduce((acc, c) => acc + c.costUsd, 0);

  return {
    generatedAt: new Date(now).toISOString(),
    windowStart: new Date(cutoff).toISOString(),
    windowEnd: new Date(now).toISOString(),
    totalEvents,
    channels,
    totalCostUsd,
    twitterCostPerEventUsd: twitterCostPerEvent,
    twitterCostOverrideActive: overrideActive,
    twitterActor,
    jsonlMissing,
    malformedLines,
  };
}

function formatUsd(n: number): string {
  if (n === 0) return "$0.0000";
  if (n < 0.01) return `$${n.toFixed(4)}`;
  if (n < 1) return `$${n.toFixed(3)}`;
  return `$${n.toFixed(2)}`;
}

function formatPct(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (n === 0) return "0%";
  if (n < 0.1) return "<0.1%";
  return `${n.toFixed(1)}%`;
}

export default async function SweepCostAdminPage() {
  const cookieStore = await cookies();
  const session = cookieStore.get(ADMIN_SESSION_COOKIE_NAME)?.value ?? null;
  if (!verifyAdminSession(session)) {
    redirect("/admin/login?next=/admin/sweep-cost");
  }

  const report = await buildReport();
  const monthlyProjectionUsd = (report.totalCostUsd * 30) / 7;

  return (
    <div className="mx-auto max-w-[1100px] px-6 py-10 font-mono">
      <header className="mb-8">
        <p
          className="text-[10px] tracking-[0.22em] uppercase"
          style={{ color: "var(--v4-ink-300)" }}
        >
          {"// SWEEP COST · 7d"}
        </p>
        <h1
          className="mt-1 text-[28px] leading-tight"
          style={{ color: "var(--v4-ink-100)" }}
        >
          Cross-source mentions — cumulative cost
        </h1>
        <p
          className="mt-2 text-[13px] max-w-3xl"
          style={{ color: "var(--v4-ink-200)" }}
        >
          Streamed from{" "}
          <code style={{ color: "var(--v4-ink-100)" }}>
            data/repo-mentions-detail.jsonl
          </code>
          . Twitter cost is estimated per-event from the configured Apify actor
          rate; Tavily cost is per unique (scan, repo) pair (one search per repo
          per scan). All other channels are free.
        </p>
        <p
          className="mt-3 text-[10px] tracking-[0.18em] uppercase"
          style={{ color: "var(--v4-ink-300)" }}
        >
          generated {report.generatedAt} · window {report.windowStart} →{" "}
          {report.windowEnd}
        </p>
      </header>

      {report.jsonlMissing ? (
        <EmptyState message="data/repo-mentions-detail.jsonl not found. Run the cross-source mentions sweep first." />
      ) : (
        <>
          {!report.twitterCostOverrideActive ? (
            <Banner>
              Twitter cost defaulted to{" "}
              <strong>${(TWITTER_DEFAULT_COST_USD_PER_EVENT * 1000).toFixed(2)}/1k</strong>{" "}
              events. To override, set{" "}
              <code style={{ color: "var(--v4-ink-100)" }}>
                APIFY_TWITTER_ACTOR_COST_USD
              </code>{" "}
              (dollars per 1000) — e.g.{" "}
              <code style={{ color: "var(--v4-ink-100)" }}>0.15</code> for
              xquik,{" "}
              <code style={{ color: "var(--v4-ink-100)" }}>0.40</code> for
              apidojo,{" "}
              <code style={{ color: "var(--v4-ink-100)" }}>0.20</code> for
              get-leads.
            </Banner>
          ) : null}

          <div
            className="overflow-x-auto rounded-[2px] border"
            style={{
              borderColor: "var(--v4-line-100)",
              background: "var(--v4-bg-025)",
            }}
          >
            <table
              className="w-full text-[12px]"
              style={{ borderCollapse: "collapse" }}
            >
              <thead>
                <tr style={{ borderBottom: "1px solid var(--v4-line-100)" }}>
                  <Th>Channel</Th>
                  <Th align="right">Events</Th>
                  <Th align="right">Cost (USD)</Th>
                  <Th align="right">% of total</Th>
                </tr>
              </thead>
              <tbody>
                {report.channels.map((row) => {
                  const pct =
                    report.totalCostUsd > 0
                      ? (row.costUsd / report.totalCostUsd) * 100
                      : 0;
                  return (
                    <tr
                      key={row.channel}
                      style={{ borderBottom: "1px solid var(--v4-line-100)" }}
                    >
                      <Td>
                        <span
                          className="text-[11px] tracking-[0.12em] uppercase"
                          style={{ color: "var(--v4-ink-100)" }}
                        >
                          {row.channel}
                        </span>
                        {row.channel === "tavily" && row.uniqueScans > 0 ? (
                          <span
                            className="ml-2 text-[10px]"
                            style={{ color: "var(--v4-ink-300)" }}
                          >
                            ({row.uniqueScans} unique scan-repo pairs)
                          </span>
                        ) : null}
                      </Td>
                      <Td align="right">
                        <span
                          className="text-[11px] tabular-nums"
                          style={{ color: "var(--v4-ink-200)" }}
                        >
                          {row.events.toLocaleString("en-US")}
                        </span>
                      </Td>
                      <Td align="right">
                        <span
                          className="text-[11px] tabular-nums"
                          style={{
                            color:
                              row.costUsd > 0
                                ? "var(--v4-ink-100)"
                                : "var(--v4-ink-300)",
                          }}
                        >
                          {row.costUsd > 0 ? formatUsd(row.costUsd) : "free"}
                        </span>
                      </Td>
                      <Td align="right">
                        <span
                          className="text-[11px] tabular-nums"
                          style={{ color: "var(--v4-ink-300)" }}
                        >
                          {formatPct(pct)}
                        </span>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <Td>
                    <span
                      className="text-[10px] tracking-[0.18em] uppercase"
                      style={{ color: "var(--v4-ink-300)" }}
                    >
                      Total
                    </span>
                  </Td>
                  <Td align="right">
                    <span
                      className="text-[11px] tabular-nums"
                      style={{ color: "var(--v4-ink-100)" }}
                    >
                      {report.totalEvents.toLocaleString("en-US")}
                    </span>
                  </Td>
                  <Td align="right">
                    <span
                      className="text-[11px] tabular-nums"
                      style={{ color: "var(--v4-ink-100)" }}
                    >
                      {formatUsd(report.totalCostUsd)}
                    </span>
                  </Td>
                  <Td align="right">
                    <span
                      className="text-[11px] tabular-nums"
                      style={{ color: "var(--v4-ink-300)" }}
                    >
                      100%
                    </span>
                  </Td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="mt-8 grid gap-6 sm:grid-cols-2">
            <Card title="Projection">
              <Row label="7-day cost" value={formatUsd(report.totalCostUsd)} />
              <Row
                label="Projected monthly (×30/7)"
                value={formatUsd(monthlyProjectionUsd)}
              />
              <Row
                label="Twitter $/event"
                value={`$${report.twitterCostPerEventUsd.toFixed(5)} (${(
                  report.twitterCostPerEventUsd * 1000
                ).toFixed(2)}/1k)`}
              />
              <Row
                label="Apify actor"
                value={report.twitterActor}
                mono
              />
            </Card>
            <Card title="Kill-switch reference">
              <p
                className="text-[11px] leading-relaxed"
                style={{ color: "var(--v4-ink-200)" }}
              >
                Per-channel disable env vars (not yet wired — for reference
                only):
              </p>
              <ul
                className="mt-2 space-y-1 text-[11px]"
                style={{ color: "var(--v4-ink-200)" }}
              >
                <li>
                  · <code style={{ color: "var(--v4-ink-100)" }}>SWEEP_DISABLE_TWITTER=1</code>
                </li>
                <li>
                  · <code style={{ color: "var(--v4-ink-100)" }}>SWEEP_DISABLE_TAVILY=1</code>
                </li>
                <li>
                  · <code style={{ color: "var(--v4-ink-100)" }}>SWEEP_DISABLE_REDDIT=1</code>
                </li>
                <li>
                  · <code style={{ color: "var(--v4-ink-100)" }}>SWEEP_DISABLE_HACKERNEWS=1</code>
                </li>
                <li>
                  · <code style={{ color: "var(--v4-ink-100)" }}>SWEEP_DISABLE_BLUESKY=1</code>
                </li>
                <li>
                  · <code style={{ color: "var(--v4-ink-100)" }}>SWEEP_DISABLE_DEVTO=1</code>
                </li>
                <li>
                  · <code style={{ color: "var(--v4-ink-100)" }}>SWEEP_DISABLE_LOBSTERS=1</code>
                </li>
                <li>
                  · <code style={{ color: "var(--v4-ink-100)" }}>SWEEP_DISABLE_PRODUCTHUNT=1</code>
                </li>
              </ul>
            </Card>
          </div>

          {report.malformedLines > 0 ? (
            <p
              className="mt-6 text-[10px] tracking-[0.18em] uppercase"
              style={{ color: "#fbbf24" }}
            >
              warning · {report.malformedLines} malformed JSONL lines skipped
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}

function Banner({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="mb-6 rounded-[2px] border px-4 py-3 text-[11px] leading-relaxed"
      style={{
        borderColor: "var(--v4-line-100)",
        background: "var(--v4-bg-025)",
        color: "var(--v4-ink-200)",
      }}
    >
      {children}
    </div>
  );
}

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className="rounded-[2px] border p-4"
      style={{
        borderColor: "var(--v4-line-100)",
        background: "var(--v4-bg-025)",
      }}
    >
      <h2
        className="mb-3 text-[10px] tracking-[0.22em] uppercase"
        style={{ color: "var(--v4-ink-300)" }}
      >
        {title}
      </h2>
      <div className="space-y-1.5">{children}</div>
    </section>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span
        className="text-[10px] tracking-[0.18em] uppercase"
        style={{ color: "var(--v4-ink-300)" }}
      >
        {label}
      </span>
      <span
        className={`text-[11px] tabular-nums ${mono ? "font-mono" : ""}`}
        style={{ color: "var(--v4-ink-100)" }}
      >
        {value}
      </span>
    </div>
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
      className="px-3 py-2 text-[10px] tracking-[0.18em] uppercase"
      style={{
        color: "var(--v4-ink-300)",
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
    <td className="px-3 py-2" style={{ textAlign: align }}>
      {children}
    </td>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div
      className="rounded-[2px] border border-dashed px-6 py-12 text-center"
      style={{
        borderColor: "var(--v4-line-100)",
        background: "var(--v4-bg-025)",
      }}
    >
      <p
        className="text-[11px] tracking-[0.18em] uppercase"
        style={{ color: "var(--v4-ink-200)" }}
      >
        No data
      </p>
      <p
        className="mt-2 text-[12px]"
        style={{ color: "var(--v4-ink-300)" }}
      >
        {message}
      </p>
    </div>
  );
}
