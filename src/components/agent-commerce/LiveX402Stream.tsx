// LiveX402Stream — real-time x402 settlement chart.
//
// Polls /api/agent-commerce/live-x402 every 15s for the latest Base
// BlockScout snapshot. Renders:
//   - Big "tx/hour" counter that animates + a +N delta indicator each poll
//   - 60-minute mini-area chart of per-minute tx counts
//   - Top 5 latest tx feed with facilitator + age
//   - Pulse dot in the header confirming the connection is live
//
// All client-side. Server provides the initial render via the API route;
// after mount the component takes over and ticks autonomously.

"use client";

import { useCallback, useEffect, useState } from "react";

import type {
  LiveX402PerMinute,
  LiveX402Snapshot,
} from "@/lib/agent-commerce/live-x402";

const POLL_INTERVAL_MS = 15_000;
const ENDPOINT = "/api/agent-commerce/live-x402";

interface LiveX402StreamProps {
  /** Initial server-rendered snapshot to avoid a blank flash. Optional. */
  initial?: LiveX402Snapshot | null;
}

function formatCount(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return Math.round(n).toLocaleString();
}

function relativeAge(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "—";
  const seconds = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function shortHash(h: string): string {
  if (!h) return "—";
  return `${h.slice(0, 6)}…${h.slice(-4)}`;
}

export function LiveX402Stream({ initial }: LiveX402StreamProps) {
  const [snapshot, setSnapshot] = useState<LiveX402Snapshot | null>(initial ?? null);
  const [delta, setDelta] = useState<number>(0);
  const [deltaSignedAt, setDeltaSignedAt] = useState<number>(0);
  const [pollCount, setPollCount] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState<number>(0); // forces re-renders for relative-age labels

  const poll = useCallback(async () => {
    try {
      const res = await fetch(ENDPOINT, { cache: "no-store" });
      if (!res.ok) {
        setError(`HTTP ${res.status}`);
        return;
      }
      const next = (await res.json()) as LiveX402Snapshot;
      setSnapshot((prev) => {
        if (prev) {
          const d = next.totalLastHour - prev.totalLastHour;
          if (d !== 0) {
            setDelta(d);
            setDeltaSignedAt(Date.now());
          }
        }
        return next;
      });
      setPollCount((c) => c + 1);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "fetch failed");
    }
  }, []);

  // Initial fetch + polling
  useEffect(() => {
    poll();
    const id = window.setInterval(poll, POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [poll]);

  // Tick every second to keep relative-time labels fresh
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  const showDelta = delta !== 0 && Date.now() - deltaSignedAt < 5000;
  const lastUpdated = snapshot ? relativeAge(snapshot.fetchedAt) : "—";
  const _ = tick; // referenced for stale-closure dep

  return (
    <section className="lx-stream card">
      <LiveX402Styles />

      <div className="lx-head">
        <div className="lx-title">
          <span className="slash">{"//"}</span> Live x402 settlements &middot; Base
        </div>
        <span className={`lx-status${snapshot?.healthy ? " live" : " cold"}`}>
          <span className="dot" aria-hidden="true" />
          {snapshot?.healthy
            ? `polling 15s · last update ${lastUpdated} ago`
            : error
              ? `feed error · ${error}`
              : "connecting…"}
        </span>
      </div>

      {snapshot ? (
        <>
          <div className="lx-headline">
            <div className="lx-headline-main">
              <span className="lx-count">{formatCount(snapshot.totalLastHour)}</span>
              <span className="lx-count-unit">tx / hour</span>
              {showDelta && (
                <span className={`lx-delta ${delta > 0 ? "up" : "dn"}`}>
                  {delta > 0 ? "+" : ""}
                  {delta} new
                </span>
              )}
            </div>
            <div className="lx-headline-meta">
              <span>
                <b>{formatCount(snapshot.totalLast24h)}</b> · 24h
              </span>
              <span>
                <b>{formatCount(snapshot.totalObserved)}</b> · observed
              </span>
              <span>
                <b>{pollCount}</b> · polls
              </span>
            </div>
          </div>

          <div className="lx-chart-wrap">
            <MiniChart points={snapshot.perMinute} />
          </div>

          <div className="lx-grid">
            <div className="lx-facilitators">
              <div className="lx-section-label">Last hour · by facilitator</div>
              {Object.keys(snapshot.perFacilitatorLastHour).length === 0 ? (
                <div className="lx-empty-row">No tx in last hour.</div>
              ) : (
                Object.entries(snapshot.perFacilitatorLastHour)
                  .sort((a, b) => b[1] - a[1])
                  .map(([name, count]) => (
                    <div key={name} className="lx-fac-row">
                      <span className="lx-fac-name">{name}</span>
                      <span className="lx-fac-count">{count}</span>
                    </div>
                  ))
              )}
            </div>

            <div className="lx-feed">
              <div className="lx-section-label">Latest activity</div>
              {snapshot.latestTxs.length === 0 ? (
                <div className="lx-empty-row">No recent tx surfaced.</div>
              ) : (
                snapshot.latestTxs.slice(0, 5).map((tx) => (
                  <a
                    key={tx.hash}
                    href={`https://base.blockscout.com/tx/${tx.hash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="lx-tx-row"
                  >
                    <span className="lx-tx-hash">{shortHash(tx.hash)}</span>
                    <span className="lx-tx-fac">{tx.facilitator}</span>
                    <span className="lx-tx-age">{relativeAge(tx.timestamp)} ago</span>
                  </a>
                ))
              )}
            </div>
          </div>

          <div className="lx-foot">
            <span>Source · Base BlockScout v2 · 24 facilitator addresses polled</span>
            <span className="grow" />
            <span className="faint">15s server cache · 15s client poll</span>
          </div>
        </>
      ) : (
        <div className="lx-loading">Connecting to Base BlockScout…</div>
      )}
    </section>
  );
}

function MiniChart({ points }: { points: LiveX402PerMinute[] }) {
  if (points.length === 0) return null;
  const W = 1000;
  const H = 90;
  const PAD = { top: 6, right: 6, bottom: 14, left: 6 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const maxCount = Math.max(1, ...points.map((p) => p.count));
  const xAt = (i: number) =>
    PAD.left + (i / Math.max(1, points.length - 1)) * innerW;
  const yAt = (v: number) => PAD.top + innerH * (1 - v / maxCount);

  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${xAt(i).toFixed(2)},${yAt(p.count).toFixed(2)}`)
    .join(" ");
  const areaPath = `${linePath} L${xAt(points.length - 1).toFixed(2)},${PAD.top + innerH} L${xAt(0).toFixed(2)},${PAD.top + innerH} Z`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-label="Tx per minute, last 60 min">
      <defs>
        <linearGradient id="lx-area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--up)" stopOpacity="0.45" />
          <stop offset="100%" stopColor="var(--up)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill="url(#lx-area)" />
      <path
        d={linePath}
        fill="none"
        stroke="var(--up)"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <circle
        cx={xAt(points.length - 1)}
        cy={yAt(points[points.length - 1].count)}
        r="3.5"
        fill="var(--up)"
        stroke="var(--bg)"
        strokeWidth="1.5"
      >
        <animate attributeName="r" values="3.5;5;3.5" dur="1.6s" repeatCount="indefinite" />
      </circle>
      <g fontFamily="var(--font-mono)" fontSize="9" fill="var(--fg-faint)">
        <text x={PAD.left} y={H - 2}>-60m</text>
        <text x={W - PAD.right} y={H - 2} textAnchor="end">now</text>
      </g>
    </svg>
  );
}

function LiveX402Styles() {
  return (
    <style
      dangerouslySetInnerHTML={{
        __html: `
.lx-stream {
  background: var(--surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--r-lg);
  overflow: hidden;
  margin: 14px 0;
}
.lx-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--border-subtle);
}
.lx-title {
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: var(--t-control);
  text-transform: uppercase;
  color: var(--fg-bright);
  font-weight: 600;
}
.lx-title .slash { color: var(--up); font-weight: 700; margin-right: 6px; }
.lx-status {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-family: var(--font-mono);
  font-size: 9.5px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--fg-faint);
}
.lx-status .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--fg-faint); }
.lx-status.live .dot {
  background: var(--up);
  box-shadow: 0 0 0 3px var(--up-soft);
  animation: pulse-live 1.6s ease-in-out infinite;
}
.lx-status.cold .dot { background: var(--down); }

.lx-headline {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 14px;
  border-bottom: 1px solid var(--border-subtle);
  flex-wrap: wrap;
}
.lx-headline-main {
  display: inline-flex;
  align-items: baseline;
  gap: 10px;
}
.lx-count {
  font-family: var(--font-mono);
  font-size: 32px;
  font-weight: 700;
  color: var(--up);
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
}
.lx-count-unit {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--fg-faint);
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.lx-delta {
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 700;
  padding: 3px 8px;
  border-radius: var(--r-xs);
  letter-spacing: 0.04em;
  animation: lx-flash 0.6s ease-out;
}
.lx-delta.up { background: var(--up-soft); color: var(--up); }
.lx-delta.dn { background: var(--down-soft); color: var(--down); }
@keyframes lx-flash {
  0% { transform: scale(1.4); opacity: 0; }
  60% { transform: scale(1); opacity: 1; }
  100% { transform: scale(1); opacity: 1; }
}

.lx-headline-meta {
  display: inline-flex;
  gap: 16px;
  margin-left: auto;
  font-family: var(--font-mono);
  font-size: 10.5px;
  color: var(--fg-faint);
}
.lx-headline-meta b { color: var(--fg-bright); font-weight: 600; }

.lx-chart-wrap {
  padding: 8px 14px;
  border-bottom: 1px solid var(--border-subtle);
}
.lx-chart-wrap svg { width: 100%; height: auto; max-height: 110px; display: block; }

.lx-grid {
  display: grid;
  grid-template-columns: 1fr 1.4fr;
  gap: 1px;
  background: var(--border-subtle);
}
.lx-facilitators, .lx-feed {
  background: var(--surface);
  padding: 12px 14px;
}
.lx-section-label {
  font-family: var(--font-mono);
  font-size: 9.5px;
  letter-spacing: var(--t-control);
  text-transform: uppercase;
  color: var(--fg-subtle);
  margin-bottom: 8px;
  font-weight: 600;
}

.lx-fac-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 0;
  font-family: var(--font-mono);
  font-size: 11px;
}
.lx-fac-name { color: var(--fg); }
.lx-fac-count {
  color: var(--up);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.lx-tx-row {
  display: grid;
  grid-template-columns: 100px minmax(0, 1fr) 60px;
  gap: 8px;
  padding: 4px 0;
  font-family: var(--font-mono);
  font-size: 11px;
  text-decoration: none;
  color: inherit;
}
.lx-tx-row:hover { color: var(--up); }
.lx-tx-hash { color: var(--fg); }
.lx-tx-fac { color: var(--fg-muted); }
.lx-tx-age {
  color: var(--fg-faint);
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.lx-empty-row {
  font-family: var(--font-mono);
  font-size: 10.5px;
  color: var(--fg-faint);
  padding: 4px 0;
}

.lx-loading {
  padding: 32px 16px;
  text-align: center;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--fg-faint);
}

.lx-foot {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px 10px;
  border-top: 1px solid var(--border-subtle);
  font-family: var(--font-mono);
  font-size: 9.5px;
  color: var(--fg-faint);
  letter-spacing: 0.04em;
}
.lx-foot .grow { flex: 1; }
.lx-foot .faint { color: var(--fg-disabled); }

@media (max-width: 700px) {
  .lx-grid { grid-template-columns: 1fr; }
  .lx-headline-meta { margin-left: 0; }
}
`,
      }}
    />
  );
}
