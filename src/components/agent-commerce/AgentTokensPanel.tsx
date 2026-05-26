// AgentTokensPanel — right-rail card on /agent-commerce.
//
// Pattern matches /funding's AIStocksPanel: top-of-rail live tokens with
// real prices + real logos. Data is the SAME fetchAgentTokens() call the
// gainers/losers tables consume — one network round-trip per page.
//
// Tokens are sorted by market cap descending so the rail reads as
// "biggest AI-agent / agent-commerce projects by capitalization". The
// market list is curated in src/lib/agent-commerce/live-tokens.ts and
// includes Bittensor, Virtuals, ai16z, ARKM, Numerai, etc. — anything
// CoinGecko returns; missing tokens drop silently (no fabrication).

import {
  formatTokenChange,
  formatTokenMarketCap,
  formatTokenPrice,
  type AgentToken,
} from "@/lib/agent-commerce/live-tokens";

interface AgentTokensPanelProps {
  tokens: AgentToken[];
}

function freshnessLabel(fetchedAt: string | null): string {
  if (!fetchedAt) return "live feed unavailable";
  const t = Date.parse(fetchedAt);
  if (!Number.isFinite(t)) return "live feed unavailable";
  const minutes = Math.max(0, Math.round((Date.now() - t) / 60_000));
  if (minutes === 0) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  return `${hours}h ago`;
}

export function AgentTokensPanel({ tokens }: AgentTokensPanelProps) {
  const fetchedAt = tokens[0]?.fetchedAt ?? null;
  const feedHealthy = tokens.length > 0;
  const sorted = [...tokens].sort((a, b) => b.marketCapUsd - a.marketCapUsd);

  return (
    <div className="ac-tokens-panel">
      <AgentTokensPanelStyles />

      <div className="ac-tokens-head">
        <div className="ac-tokens-title">
          <span className="slash">{"//"}</span>
          <span>Agent tokens</span>
        </div>
        <span
          className={`ac-tokens-status${feedHealthy ? " live" : " cold"}`}
          title={feedHealthy ? "Quotes via CoinGecko · 5m refresh" : "Quote feed unreachable"}
        >
          <span className="dot" aria-hidden="true" />
          {feedHealthy ? `live · ${freshnessLabel(fetchedAt)}` : "feed down"}
        </span>
      </div>

      <div className="ac-tokens-section-label">
        By market cap · {sorted.length} tracked
      </div>

      {feedHealthy ? (
        <ul className="ac-tokens-list" role="list">
          {sorted.map((t) => {
            const sign = t.changePct24h >= 0 ? "up" : "dn";
            return (
              <li key={t.id} className="ac-token-row">
                <a
                  href={`https://www.coingecko.com/en/coins/${encodeURIComponent(t.id)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ac-token-link"
                  title={`${t.name} · ${t.category} · ${formatTokenMarketCap(t.marketCapUsd)} mcap`}
                >
                  <span className="ac-token-logo">
                    {/* eslint-disable-next-line @next/next/no-img-element -- CoinGecko CDN */}
                    <img
                      src={t.logoUrl}
                      alt=""
                      width={20}
                      height={20}
                      loading="lazy"
                      decoding="async"
                    />
                  </span>
                  <span className="ac-token-id">
                    <span className="ac-token-symbol">{t.symbol}</span>
                    <span className="ac-token-cat">{t.category}</span>
                  </span>
                  <span className="ac-token-price">{formatTokenPrice(t.priceUsd)}</span>
                  <span className={`ac-token-change ${sign}`}>
                    {formatTokenChange(t.changePct24h)}
                  </span>
                </a>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="ac-tokens-empty">
          CoinGecko feed unreachable. We don&apos;t fabricate prices &mdash;
          try again in a minute.
        </div>
      )}

      <div className="ac-tokens-foot">
        <span>Prices CoinGecko · 5m refresh</span>
        <span className="grow" />
        <span className="faint">tap row → CoinGecko chart</span>
      </div>
    </div>
  );
}

function AgentTokensPanelStyles() {
  return (
    <style
      dangerouslySetInnerHTML={{
        __html: `
.ac-tokens-panel {
  background: var(--surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--r-lg);
  padding: 14px 14px 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 14px;
}

.ac-tokens-head {
  display: flex;
  align-items: center;
  gap: 10px;
}
.ac-tokens-title {
  display: inline-flex;
  align-items: baseline;
  gap: 8px;
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: var(--t-control);
  text-transform: uppercase;
  color: var(--fg-bright);
  font-weight: 600;
}
.ac-tokens-title .slash {
  color: var(--accent);
  font-weight: 700;
}
.ac-tokens-status {
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
.ac-tokens-status .dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--fg-faint);
}
.ac-tokens-status.live .dot {
  background: var(--up);
  box-shadow: 0 0 0 3px var(--up-soft);
  animation: pulse-live 1.6s ease-in-out infinite;
}
.ac-tokens-status.cold .dot { background: var(--down); }

.ac-tokens-section-label {
  font-family: var(--font-mono);
  font-size: 9.5px;
  letter-spacing: var(--t-control);
  text-transform: uppercase;
  color: var(--fg-subtle);
  font-weight: 600;
}

.ac-tokens-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  border-top: 1px solid var(--border-subtle);
}
.ac-token-row { border-bottom: 1px solid var(--border-subtle); }
.ac-token-row:last-child { border-bottom: 0; }

.ac-token-link {
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr) 70px 60px;
  gap: 8px;
  align-items: center;
  padding: 7px 4px;
  text-decoration: none;
  color: inherit;
  font-family: var(--font-mono);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  transition: background var(--d-fast) var(--ease);
}
.ac-token-link:hover { background: var(--surface-2); }
.ac-token-logo {
  width: 20px;
  height: 20px;
  display: grid;
  place-items: center;
  background: var(--surface-3);
  border-radius: 4px;
  overflow: hidden;
}
.ac-token-logo img {
  display: block;
  width: 20px;
  height: 20px;
  object-fit: contain;
}
.ac-token-id {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}
.ac-token-symbol {
  font-weight: 700;
  color: var(--fg-bright);
  letter-spacing: -0.01em;
}
.ac-token-cat {
  font-size: 9.5px;
  color: var(--fg-faint);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ac-token-price {
  text-align: right;
  color: var(--fg);
  font-weight: 500;
}
.ac-token-change {
  text-align: right;
  font-weight: 700;
  font-size: 10.5px;
}
.ac-token-change.up { color: var(--up); }
.ac-token-change.dn { color: var(--down); }

.ac-tokens-empty {
  padding: 16px;
  text-align: center;
  font-family: var(--font-mono);
  font-size: 10.5px;
  color: var(--fg-faint);
  border: 1px dashed var(--border-subtle);
  border-radius: var(--r-md);
}

.ac-tokens-foot {
  display: flex;
  align-items: center;
  gap: 6px;
  padding-top: 4px;
  font-family: var(--font-mono);
  font-size: 9.5px;
  color: var(--fg-faint);
  letter-spacing: 0.04em;
}
.ac-tokens-foot .faint { color: var(--fg-disabled); }
.ac-tokens-foot .grow { flex: 1; }
`,
      }}
    />
  );
}
