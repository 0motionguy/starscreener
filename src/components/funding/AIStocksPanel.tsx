// AIStocksPanel — right-rail card on /funding showing live AI public-stock
// quotes plus a real OHLC candlestick for the lead ticker (the actual
// "live chart" — AURORA-themed bklit candles, honest Yahoo daily data).
//
// 2026-05-23: pre-IPO content moved out of this panel into the new
// PreIPOSection (lives under SectorHeatmap in the main column). This panel
// is now focused: live regular-market quotes for the curated AI ticker
// list, fetched server-side from Yahoo Finance's v8 chart endpoint
// (no auth, 60-second revalidate). Failure renders an honest empty state —
// no fabricated prices.
//
// Future websocket upgrade: turn this into a thin server shell + a
// client island that subscribes to /api/stocks/stream for live ticks.

import { TradingViewCandles } from "@/components/charts/TradingViewCandles";
import {
  fetchPublicAiStocks,
  formatChangePct,
  formatPrice,
  type PublicStock,
} from "@/lib/ai-stocks";

interface AIStocksPanelProps {
  /** Optional override — pass a function returning stocks for tests. */
  loader?: () => Promise<PublicStock[]>;
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

export async function AIStocksPanel({ loader }: AIStocksPanelProps = {}) {
  const stocks = await (loader ?? fetchPublicAiStocks)();
  const fetchedAt = stocks[0]?.fetchedAt ?? null;
  const feedHealthy = stocks.length > 0;
  // Lead candlestick — first curated ticker with enough real OHLC history
  // (curated order puts NVDA first). No candles → no chart, no fabrication.
  const lead = stocks.find((s) => (s.candles?.length ?? 0) >= 10) ?? null;

  return (
    <div className="ai-stocks-panel">
      <AIStocksPanelStyles />

      <div className="ai-stocks-head">
        <div className="ai-stocks-title">
          <span className="slash">{"//"}</span>
          <span>AI stocks</span>
        </div>
        <span
          className={`ai-stocks-status${feedHealthy ? " live" : " cold"}`}
          title={feedHealthy ? "Quotes via Yahoo Finance · 60s refresh" : "Quote feed unreachable"}
        >
          <span className="dot" aria-hidden="true" />
          {feedHealthy ? `live · ${freshnessLabel(fetchedAt)}` : "feed down"}
        </span>
      </div>

      {lead ? (
        <div className="ai-stocks-chart">
          <div className="ai-stocks-chart-label">
            <span className="tk">{lead.ticker}</span>
            <span className="mode">daily candles · 3mo · Yahoo OHLC</span>
          </div>
          <TradingViewCandles
            data={lead.candles}
            height={150}
            currency={lead.currency}
            ariaLabel={`${lead.ticker} daily OHLC candles, last 3 months`}
          />
        </div>
      ) : null}

      <div className="ai-stocks-section-label">
        Public · {stocks.length} tickers
      </div>
      {feedHealthy ? (
        <ul className="ai-stocks-list" role="list">
          {stocks.map((s) => {
            const sign = s.changePct >= 0 ? "up" : "dn";
            const range = s.fiftyTwoWeekHigh > 0
              ? Math.max(0, Math.min(100, ((s.price - s.fiftyTwoWeekLow) / Math.max(0.001, s.fiftyTwoWeekHigh - s.fiftyTwoWeekLow)) * 100))
              : null;
            return (
              <li key={s.ticker} className="ai-stock-row">
                <a
                  href={`https://finance.yahoo.com/quote/${encodeURIComponent(s.ticker)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="stock-link"
                  title={`${s.name} · ${s.exchange || s.currency} · click for chart`}
                >
                  <span className="stock-ticker">{s.ticker}</span>
                  <span className="stock-name">{s.blurb}</span>
                  <span className="stock-price">{formatPrice(s.price, s.currency)}</span>
                  <span className={`stock-change ${sign}`}>{formatChangePct(s.changePct)}</span>
                </a>
                {range !== null && (
                  <div
                    className="stock-range"
                    title={`52-week range: ${formatPrice(s.fiftyTwoWeekLow, s.currency)} → ${formatPrice(s.fiftyTwoWeekHigh, s.currency)}`}
                  >
                    <span className="stock-range-bar">
                      <span
                        className="stock-range-mark"
                        style={{ left: `${range.toFixed(1)}%` }}
                      />
                    </span>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="ai-stocks-empty">
          Live quote feed unreachable. We don&apos;t fabricate prices — try
          again in a minute, or check Yahoo Finance directly.
        </div>
      )}

      <div className="ai-stocks-foot">
        <span>Quotes Yahoo Finance · 60s refresh</span>
        <span className="grow" />
        <span className="faint">Pre-IPO valuations sourced per row</span>
      </div>
    </div>
  );
}

function AIStocksPanelStyles() {
  return (
    <style
      dangerouslySetInnerHTML={{
        __html: `
.ai-stocks-panel {
  background: var(--surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--r-lg);
  padding: 14px 14px 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 14px;
}

.ai-stocks-head {
  display: flex;
  align-items: center;
  gap: 10px;
}
.ai-stocks-title {
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
.ai-stocks-title .slash {
  color: var(--accent);
  font-weight: 700;
}
.ai-stocks-status {
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
.ai-stocks-status .dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--fg-faint);
}
.ai-stocks-status.live .dot {
  background: var(--up);
  box-shadow: 0 0 0 3px var(--up-soft);
  animation: pulse-live 1.6s ease-in-out infinite;
}
.ai-stocks-status.cold .dot { background: var(--down); }

.ai-stocks-chart {
  border: 1px solid var(--border-subtle);
  border-radius: var(--r-md);
  background: var(--surface-2);
  padding: 8px 6px 2px;
}
.ai-stocks-chart-label {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 0 4px 4px;
  font-family: var(--font-mono);
}
.ai-stocks-chart-label .tk {
  font-size: 11px;
  font-weight: 700;
  color: var(--fg-bright);
}
.ai-stocks-chart-label .mode {
  font-size: 9.5px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--fg-faint);
}

.ai-stocks-section-label {
  font-family: var(--font-mono);
  font-size: 9.5px;
  letter-spacing: var(--t-control);
  text-transform: uppercase;
  color: var(--fg-subtle);
  padding-top: 4px;
  font-weight: 600;
}

.ai-stocks-preipo {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.preipo-card {
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr);
  gap: 10px;
  padding: 10px;
  background: var(--surface-2);
  border: 1px solid var(--border-subtle);
  border-radius: var(--r-md);
  position: relative;
  overflow: hidden;
}
.preipo-card::before {
  content: "";
  position: absolute;
  inset: 0 0 auto;
  height: 2px;
  background: linear-gradient(90deg, var(--accent), transparent);
}
.preipo-mark {
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  background: var(--surface-3);
  border-radius: var(--r-sm);
  flex-shrink: 0;
}
.preipo-letter {
  font-family: var(--font-mono);
  font-size: 14px;
  font-weight: 700;
  color: var(--fg-bright);
}
.preipo-body { min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.preipo-line-1 { display: flex; align-items: center; gap: 8px; }
.preipo-name {
  font-family: var(--font-mono);
  font-size: 12.5px;
  color: var(--fg-bright);
  font-weight: 600;
}
.preipo-badge {
  font-family: var(--font-mono);
  font-size: 9px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  padding: 2px 6px;
  border-radius: var(--r-xs);
  font-weight: 600;
  white-space: nowrap;
}
.preipo-badge.tone-accent { background: var(--accent-soft); color: var(--accent); border: 1px solid rgba(255,107,53,0.32); }
.preipo-badge.tone-warn { background: var(--warning-soft); color: var(--warning); }
.preipo-badge.tone-info { background: var(--info-soft); color: var(--info); }
.preipo-badge.tone-faint { background: var(--surface-3); color: var(--fg-subtle); border: 1px solid var(--border-subtle); }
.preipo-blurb {
  font-size: 11px;
  color: var(--fg-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.preipo-line-3 {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-family: var(--font-mono);
  font-size: 10.5px;
}
.preipo-val { color: var(--accent); font-weight: 700; font-size: 13px; }
.preipo-source { color: var(--fg-faint); font-size: 9.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.ai-stocks-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  border-top: 1px solid var(--border-subtle);
}
.ai-stock-row {
  border-bottom: 1px solid var(--border-subtle);
}
.ai-stock-row:last-child { border-bottom: 0; }
.stock-link {
  display: grid;
  grid-template-columns: 50px minmax(0, 1fr) 64px 56px;
  gap: 8px;
  align-items: baseline;
  padding: 7px 4px;
  text-decoration: none;
  color: inherit;
  font-family: var(--font-mono);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  transition: background var(--d-fast) var(--ease);
}
.stock-link:hover { background: var(--surface-2); }
.stock-ticker {
  font-weight: 700;
  color: var(--fg-bright);
  letter-spacing: -0.01em;
}
.stock-name {
  font-size: 10px;
  color: var(--fg-faint);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.stock-price {
  text-align: right;
  color: var(--fg);
  font-weight: 500;
}
.stock-change {
  text-align: right;
  font-weight: 700;
  font-size: 10.5px;
}
.stock-change.up { color: var(--up); }
.stock-change.dn { color: var(--down); }

.stock-range {
  padding: 0 4px 6px;
}
.stock-range-bar {
  display: block;
  position: relative;
  height: 2px;
  background: var(--surface-3);
  border-radius: 999px;
  overflow: visible;
}
.stock-range-mark {
  position: absolute;
  top: 50%;
  width: 4px;
  height: 8px;
  background: var(--accent);
  border-radius: 1px;
  transform: translate(-50%, -50%);
}

.ai-stocks-empty {
  padding: 16px;
  text-align: center;
  font-family: var(--font-mono);
  font-size: 10.5px;
  color: var(--fg-faint);
  border: 1px dashed var(--border-subtle);
  border-radius: var(--r-md);
}

.ai-stocks-foot {
  display: flex;
  align-items: center;
  gap: 6px;
  padding-top: 4px;
  font-family: var(--font-mono);
  font-size: 9.5px;
  color: var(--fg-faint);
  letter-spacing: 0.04em;
}
.ai-stocks-foot .faint { color: var(--fg-disabled); }
.ai-stocks-foot .grow { flex: 1; }
`,
      }}
    />
  );
}
