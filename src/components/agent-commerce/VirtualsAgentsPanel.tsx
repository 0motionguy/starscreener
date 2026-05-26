// VirtualsAgentsPanel — top Virtuals Protocol AI agents on Base.
//
// Lives in the /agent-commerce main column. Renders the top N tokenized
// AI agents from api.virtuals.io with their real S3-hosted logos,
// USD-converted market caps (mcapInVirtual × VIRTUAL price from CoinGecko),
// holder counts, 24h price change, and 24h volume.
//
// Each row links to the agent's virtuals.io profile + the Base contract
// on Basescan. No fabricated data — empty state when the API is down.

import {
  formatVirtualHolders,
  formatVirtualMcap,
  type VirtualAgent,
} from "@/lib/agent-commerce/virtuals";

interface VirtualsAgentsPanelProps {
  agents: VirtualAgent[];
}

function formatPct(pct: number): string {
  if (!Number.isFinite(pct) || pct === 0) return "—";
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
}

function freshnessLabel(fetchedAt: string | null): string {
  if (!fetchedAt) return "—";
  const t = Date.parse(fetchedAt);
  if (!Number.isFinite(t)) return "—";
  const minutes = Math.max(0, Math.round((Date.now() - t) / 60_000));
  if (minutes === 0) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.round(minutes / 60)}h ago`;
}

export function VirtualsAgentsPanel({ agents }: VirtualsAgentsPanelProps) {
  const feedHealthy = agents.length > 0;
  const fetchedAt = agents[0]?.fetchedAt ?? null;

  return (
    <section className="virtuals-panel card">
      <VirtualsPanelStyles />

      <div className="virtuals-head">
        <div className="virtuals-title">
          <span className="slash">{"//"}</span> Virtuals Protocol &middot; top on-Base agents
        </div>
        <span
          className={`virtuals-status${feedHealthy ? " live" : " cold"}`}
          title={feedHealthy ? "Data via api.virtuals.io · 5m refresh" : "Virtuals.io API unreachable"}
        >
          <span className="dot" aria-hidden="true" />
          {feedHealthy ? `live · ${freshnessLabel(fetchedAt)}` : "feed down"}
        </span>
      </div>

      {feedHealthy ? (
        <>
          <div className="virtuals-grid-head">
            <span>Agent</span>
            <span className="tar">Market cap</span>
            <span className="tar">Holders</span>
            <span className="tar">24h Δ</span>
            <span className="tar">Vol 24h (V)</span>
          </div>
          <ul className="virtuals-list" role="list">
            {agents.map((a, i) => {
              const sign = a.priceChangePct24h >= 0 ? "up" : "dn";
              return (
                <li key={a.id} className="virtuals-row">
                  <a
                    href={a.virtualsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="virtuals-link"
                    title={`${a.name} · ${a.category} · ${a.chain}`}
                  >
                    <span className="vr-rank">{String(i + 1).padStart(2, "0")}</span>
                    <span className="vr-logo">
                      {a.imageUrl ? (
                        /* eslint-disable-next-line @next/next/no-img-element -- S3 CDN, no Image optimization */
                        <img
                          src={a.imageUrl}
                          alt=""
                          width={28}
                          height={28}
                          loading="lazy"
                          decoding="async"
                        />
                      ) : (
                        <span className="vr-logo-fallback">{a.name.charAt(0)}</span>
                      )}
                    </span>
                    <span className="vr-id">
                      <span className="vr-name">{a.name}</span>
                      <span className="vr-sym">
                        ${a.symbol} · {a.category}
                      </span>
                    </span>
                    <span className="vr-mcap tar">
                      {formatVirtualMcap(a.mcapUsd, a.mcapInVirtual)}
                    </span>
                    <span className="vr-holders tar">
                      {formatVirtualHolders(a.holderCount)}
                    </span>
                    <span className={`vr-change tar ${sign}`}>
                      {formatPct(a.priceChangePct24h)}
                    </span>
                    <span className="vr-vol tar">
                      {a.volume24h > 0
                        ? `${(a.volume24h / 1000).toFixed(1)}K`
                        : "—"}
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
          <div className="virtuals-foot">
            <span>Source api.virtuals.io · USD mcap via CoinGecko VIRTUAL price</span>
            <span className="grow" />
            <a
              href="https://app.virtuals.io"
              target="_blank"
              rel="noopener noreferrer"
              className="virtuals-out"
            >
              Open full registry →
            </a>
          </div>
        </>
      ) : (
        <div className="virtuals-empty">
          api.virtuals.io unreachable. We don&apos;t fabricate agents — try
          again in a minute.
        </div>
      )}
    </section>
  );
}

function VirtualsPanelStyles() {
  return (
    <style
      dangerouslySetInnerHTML={{
        __html: `
.virtuals-panel {
  background: var(--surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--r-lg);
  overflow: hidden;
  margin: 14px 0;
}
.virtuals-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--border-subtle);
}
.virtuals-title {
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: var(--t-control);
  text-transform: uppercase;
  color: var(--fg-bright);
  font-weight: 600;
}
.virtuals-title .slash { color: var(--accent); font-weight: 700; margin-right: 6px; }
.virtuals-status {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-family: var(--font-mono);
  font-size: 9.5px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--fg-faint);
}
.virtuals-status .dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--fg-faint);
}
.virtuals-status.live .dot {
  background: var(--up);
  box-shadow: 0 0 0 3px var(--up-soft);
  animation: pulse-live 1.6s ease-in-out infinite;
}
.virtuals-status.cold .dot { background: var(--down); }

.virtuals-grid-head, .virtuals-link {
  display: grid;
  grid-template-columns: 32px 36px minmax(0, 1fr) 100px 70px 70px 80px;
  gap: 10px;
  align-items: center;
  padding: 8px 14px;
  font-family: var(--font-mono);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}
.virtuals-grid-head {
  font-size: 9.5px;
  letter-spacing: var(--t-control);
  text-transform: uppercase;
  color: var(--fg-faint);
  border-bottom: 1px solid var(--border-subtle);
  font-weight: 500;
}
.virtuals-grid-head .tar { text-align: right; }
.virtuals-grid-head > :nth-child(1) { grid-column: 1 / span 3; }

.virtuals-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.virtuals-row { border-bottom: 1px solid var(--border-subtle); }
.virtuals-row:last-child { border-bottom: 0; }
.virtuals-link {
  text-decoration: none;
  color: inherit;
  transition: background var(--d-fast) var(--ease);
}
.virtuals-link:hover { background: var(--surface-2); }

.vr-rank {
  color: var(--fg-faint);
  font-weight: 600;
  text-align: right;
}
.vr-logo {
  width: 28px;
  height: 28px;
  border-radius: var(--r-sm);
  background: var(--surface-3);
  border: 1px solid var(--border-subtle);
  display: grid;
  place-items: center;
  overflow: hidden;
}
.vr-logo img {
  display: block;
  width: 28px;
  height: 28px;
  object-fit: cover;
}
.vr-logo-fallback {
  font-family: var(--font-mono);
  font-size: 13px;
  font-weight: 700;
  color: var(--fg-bright);
}
.vr-id { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.vr-name {
  color: var(--fg-bright);
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.vr-sym {
  font-size: 9.5px;
  color: var(--cyan);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.vr-mcap, .vr-holders, .vr-change, .vr-vol {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.vr-mcap.tar, .vr-holders.tar, .vr-change.tar, .vr-vol.tar { text-align: right; }
.vr-mcap { color: var(--accent); font-weight: 700; }
.vr-holders { color: var(--fg); }
.vr-change.up { color: var(--up); font-weight: 700; }
.vr-change.dn { color: var(--down); font-weight: 700; }
.vr-vol { color: var(--fg-muted); }

.virtuals-foot {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px 10px;
  font-family: var(--font-mono);
  font-size: 9.5px;
  color: var(--fg-faint);
  letter-spacing: 0.04em;
  border-top: 1px solid var(--border-subtle);
}
.virtuals-foot .grow { flex: 1; }
.virtuals-out {
  color: var(--accent);
  text-decoration: none;
}
.virtuals-out:hover { text-decoration: underline; }

.virtuals-empty {
  padding: 24px 16px;
  text-align: center;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--fg-faint);
}
`,
      }}
    />
  );
}
