// Agent Commerce — token-economy boards.
//
// CoinGecko-enriched token data: top by mcap + 24h gainers. V4 rebuild —
// every previously-inline color now lives behind a v4 token (positive/negative
// rails for direction, violet for the token symbol, amber for mcap, ink-400
// for rank). Returns `null` when there are no tokens to render so the page
// doesn't ship an empty section.

import Link from "next/link";

import { Card, CardBody, CardHeader } from "@/components/ui/Card";

import type { AgentCommerceItem } from "@/lib/agent-commerce/types";

interface TokenEconomyBoardsProps {
  items: AgentCommerceItem[];
}

function fmtMcap(value: number): string {
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  return `$${(value / 1e6).toFixed(0)}M`;
}

function fmtChange(pct: number): string {
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
}

export function TokenEconomyBoards({ items }: TokenEconomyBoardsProps) {
  const tokenItems = items.filter((i) => i.live?.tokenSymbol);
  if (tokenItems.length === 0) return null;

  const topByMcap = tokenItems
    .slice()
    .sort(
      (a, b) =>
        (b.live?.marketCapUsd ?? 0) - (a.live?.marketCapUsd ?? 0),
    )
    .slice(0, 8);

  const topGainers = tokenItems
    .filter((i) => Number.isFinite(i.live?.priceChange24hPct))
    .slice()
    .sort(
      (a, b) =>
        (b.live?.priceChange24hPct ?? 0) -
        (a.live?.priceChange24hPct ?? 0),
    )
    .slice(0, 8);

  return (
    <div className="grid">
      <Card className="col-6">
        <CardHeader showCorner right={<span>by mcap</span>}>
          Top agent tokens
        </CardHeader>
        <CardBody>
          {topByMcap.map((item, idx) => {
            const mcap = item.live?.marketCapUsd ?? 0;
            const change = item.live?.priceChange24hPct ?? 0;
            const positive = change >= 0;
            return (
              <Link
                key={item.id}
                href={`/agent-commerce/${item.slug}`}
                className="ac-token-row"
              >
                <span className="ac-token-row__rank">
                  {String(idx + 1).padStart(2, "0")}
                </span>
                <span className="ac-token-row__symbol">
                  ${item.live?.tokenSymbol}
                </span>
                <span className="ac-token-row__name">{item.name}</span>
                <span className="ac-token-row__mcap">{fmtMcap(mcap)}</span>
                <span
                  className={`ac-token-row__change ${positive ? "is-up" : "is-down"}`}
                >
                  {fmtChange(change)}
                </span>
              </Link>
            );
          })}
        </CardBody>
      </Card>
      <Card className="col-6">
        <CardHeader showCorner right={<span>24h gainers</span>}>
          Top movers
        </CardHeader>
        <CardBody>
          {topGainers.map((item, idx) => {
            const change = item.live?.priceChange24hPct ?? 0;
            const positive = change >= 0;
            return (
              <Link
                key={item.id}
                href={`/agent-commerce/${item.slug}`}
                className="ac-token-row ac-token-row--gainer"
              >
                <span className="ac-token-row__rank">
                  {String(idx + 1).padStart(2, "0")}
                </span>
                <span className="ac-token-row__symbol">
                  ${item.live?.tokenSymbol}
                </span>
                <span className="ac-token-row__name">{item.name}</span>
                <span
                  className={`ac-token-row__change ${positive ? "is-up" : "is-down"}`}
                >
                  {fmtChange(change)}
                </span>
              </Link>
            );
          })}
        </CardBody>
      </Card>
    </div>
  );
}
