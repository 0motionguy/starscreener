// X402ServicesPanel — Coinbase-aligned x402 service registry.
//
// Renders top services from agentic.market (the public catalog of all
// x402-enabled APIs that AI agents can pay-per-call in USDC). Each service
// shows its real favicon, category, USDC price range, supported networks,
// endpoint count, and a click-through to the provider's docs.
//
// Lives in the /agent-commerce main column. Pairs with VirtualsAgentsPanel
// as the second "real agent commerce data source" alongside the existing
// TOOLBOX-collected x402 on-chain settlement data.

import {
  formatUsdcPrice,
  type X402Market,
} from "@/lib/agent-commerce/agentic-market";

interface X402ServicesPanelProps {
  market: X402Market;
  /** How many top services to show in the list. Default 12. */
  limit?: number;
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

function priceLabel(min: number, max: number): string {
  if (min === 0 && max === 0) return "—";
  if (min === max) return formatUsdcPrice(min);
  return `${formatUsdcPrice(min)}–${formatUsdcPrice(max)}`;
}

export function X402ServicesPanel({ market, limit = 12 }: X402ServicesPanelProps) {
  const feedHealthy = market.services.length > 0;
  // Rank by endpoint count desc, then min price asc — surfaces the
  // beefier APIs (Claude with 6 endpoints, ChatGPT with 9) first.
  const top = [...market.services]
    .sort(
      (a, b) =>
        b.endpointCount - a.endpointCount ||
        a.minPriceUsd - b.minPriceUsd,
    )
    .slice(0, limit);

  return (
    <section className="x402-panel card">
      <X402PanelStyles />

      <div className="x402-head">
        <div className="x402-title">
          <span className="slash">{"//"}</span> x402 services &middot; agentic.market
        </div>
        <span
          className={`x402-status${feedHealthy ? " live" : " cold"}`}
          title={feedHealthy ? "Data via api.agentic.market · 5m refresh" : "agentic.market API unreachable"}
        >
          <span className="dot" aria-hidden="true" />
          {feedHealthy
            ? `${market.totalServices.toLocaleString()} services · ${freshnessLabel(market.fetchedAt)}`
            : "feed down"}
        </span>
      </div>

      {feedHealthy ? (
        <>
          <div className="x402-chips">
            {market.categories.map((c) => (
              <span key={c.category} className="x402-cat-chip">
                <span className="x402-cat-name">{c.category}</span>
                <span className="x402-cat-count">{c.count}</span>
              </span>
            ))}
          </div>

          <div className="x402-list-head">
            <span>Service</span>
            <span className="tar">Endpoints</span>
            <span className="tar">USDC / call</span>
            <span>Networks</span>
          </div>
          <ul className="x402-list" role="list">
            {top.map((s) => {
              const visibleNets = s.networks.slice(0, 3);
              const overflow = s.networks.length - visibleNets.length;
              return (
                <li key={s.id} className="x402-row">
                  <a
                    href={s.providerUrl || `https://${s.domain}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="x402-link"
                    title={`${s.name} · ${s.category} · ${s.description}`}
                  >
                    <span className="x402-logo">
                      {s.logoUrl ? (
                        /* eslint-disable-next-line @next/next/no-img-element -- favicon */
                        <img
                          src={s.logoUrl}
                          alt=""
                          width={20}
                          height={20}
                          loading="lazy"
                          decoding="async"
                        />
                      ) : (
                        <span className="x402-logo-fallback">{s.name.charAt(0)}</span>
                      )}
                    </span>
                    <span className="x402-id">
                      <span className="x402-name">{s.name}</span>
                      <span className="x402-cat">
                        {s.category}
                        {s.description ? ` · ${s.description.slice(0, 60)}${s.description.length > 60 ? "…" : ""}` : ""}
                      </span>
                    </span>
                    <span className="x402-eps tar">{s.endpointCount}</span>
                    <span className="x402-price tar">
                      {priceLabel(s.minPriceUsd, s.maxPriceUsd)}
                    </span>
                    <span className="x402-nets">
                      {visibleNets.map((n) => (
                        <span key={n} className={`x402-net x402-net--${n.toLowerCase()}`}>
                          {n}
                        </span>
                      ))}
                      {overflow > 0 && (
                        <span className="x402-net x402-net--more">+{overflow}</span>
                      )}
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
          <div className="x402-foot">
            <span>
              {market.totalServices.toLocaleString()} x402-enabled services across{" "}
              {market.networks.length} networks · powered by Coinbase x402
            </span>
            <span className="grow" />
            <a
              href="https://agentic.market"
              target="_blank"
              rel="noopener noreferrer"
              className="x402-out"
            >
              Open full catalog →
            </a>
          </div>
        </>
      ) : (
        <div className="x402-empty">
          api.agentic.market unreachable. We don&apos;t fabricate services —
          try again in a minute.
        </div>
      )}
    </section>
  );
}

function X402PanelStyles() {
  return (
    <style
      dangerouslySetInnerHTML={{
        __html: `
.x402-panel {
  background: var(--surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--r-lg);
  overflow: hidden;
  margin: 14px 0;
}
.x402-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--border-subtle);
}
.x402-title {
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: var(--t-control);
  text-transform: uppercase;
  color: var(--fg-bright);
  font-weight: 600;
}
.x402-title .slash { color: var(--accent); font-weight: 700; margin-right: 6px; }
.x402-status {
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
.x402-status .dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--fg-faint);
}
.x402-status.live .dot {
  background: var(--up);
  box-shadow: 0 0 0 3px var(--up-soft);
  animation: pulse-live 1.6s ease-in-out infinite;
}
.x402-status.cold .dot { background: var(--down); }

.x402-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border-subtle);
}
.x402-cat-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  border-radius: var(--r-sm);
  background: var(--surface-2);
  border: 1px solid var(--border-subtle);
  font-family: var(--font-mono);
  font-size: 10px;
}
.x402-cat-name {
  color: var(--fg-muted);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.x402-cat-count {
  color: var(--accent);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.x402-list-head, .x402-link {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr) 80px 110px 160px;
  gap: 10px;
  align-items: center;
  padding: 8px 14px;
  font-family: var(--font-mono);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}
.x402-list-head {
  font-size: 9.5px;
  letter-spacing: var(--t-control);
  text-transform: uppercase;
  color: var(--fg-faint);
  border-bottom: 1px solid var(--border-subtle);
  font-weight: 500;
}
.x402-list-head .tar { text-align: right; }
.x402-list-head > :nth-child(1) { grid-column: 1 / span 2; }

.x402-list { list-style: none; margin: 0; padding: 0; }
.x402-row { border-bottom: 1px solid var(--border-subtle); }
.x402-row:last-child { border-bottom: 0; }
.x402-link {
  text-decoration: none;
  color: inherit;
  transition: background var(--d-fast) var(--ease);
}
.x402-link:hover { background: var(--surface-2); }

.x402-logo {
  width: 24px;
  height: 24px;
  border-radius: var(--r-xs);
  background: var(--surface-3);
  border: 1px solid var(--border-subtle);
  display: grid;
  place-items: center;
  overflow: hidden;
}
.x402-logo img {
  display: block;
  width: 16px;
  height: 16px;
}
.x402-logo-fallback {
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 700;
  color: var(--fg-bright);
}
.x402-id { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.x402-name {
  color: var(--fg-bright);
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.x402-cat {
  font-size: 9.5px;
  color: var(--fg-faint);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.x402-eps { color: var(--fg); text-align: right; }
.x402-price {
  color: var(--accent);
  font-weight: 700;
  text-align: right;
}
.x402-nets { display: inline-flex; gap: 4px; flex-wrap: wrap; }
.x402-net {
  display: inline-flex;
  align-items: center;
  padding: 1px 6px;
  border-radius: 2px;
  font-family: var(--font-mono);
  font-size: 8.5px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  border: 1px solid var(--border-subtle);
  background: var(--surface-2);
  color: var(--fg-muted);
}
.x402-net--base {
  color: var(--info);
  border-color: var(--info-soft);
  background: var(--info-soft);
}
.x402-net--solana {
  color: var(--violet);
  border-color: rgba(167,139,250,0.22);
  background: rgba(167,139,250,0.10);
}
.x402-net--polygon {
  color: var(--pink);
}
.x402-net--ethereum {
  color: var(--cyan);
}
.x402-net--more {
  color: var(--fg-faint);
}

.x402-foot {
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
.x402-foot .grow { flex: 1; }
.x402-out {
  color: var(--accent);
  text-decoration: none;
}
.x402-out:hover { text-decoration: underline; }

.x402-empty {
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
