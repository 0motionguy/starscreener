// Ticker — global. Server component. Builds default item set from live data.
// Per-page consumers can pass their own items[] to override the default feed.

import { getTopMoversByDelta24h } from "@/lib/trending";

export interface TickerItem {
  tag: string;
  label: string;
  value: string;
  tone?: "up" | "down" | "flat";
}

interface TickerProps {
  items?: TickerItem[];
}

export function Ticker({ items }: TickerProps) {
  const feed = items && items.length > 0 ? items : buildDefaultTicker();
  // Duplicate for seamless 70s scroll loop.
  const doubled = [...feed, ...feed];

  return (
    <div className="ticker">
      <div className="ticker-tape">
        {doubled.map((it, i) => (
          <span className="tick" key={`${it.label}-${i}`}>
            <span className="tick-tag">{it.tag}</span>
            <b>{it.label}</b>
            <span className={tone(it.tone)}>{it.value}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function tone(t: TickerItem["tone"]): string {
  if (t === "down") return "delta-fl";
  if (t === "flat") return "delta-fl";
  return "delta-up";
}

function buildDefaultTicker(): TickerItem[] {
  let movers: { fullName: string; starsDelta24h: number }[] = [];
  try {
    movers = getTopMoversByDelta24h(5).map((row) => ({
      fullName: row.fullName,
      starsDelta24h: row.starsDelta24h,
    }));
  } catch {
    movers = [];
  }

  const fallback: TickerItem[] = [
    { tag: "PIPE", label: "TrendingRepo", value: "LIVE · 30 mention sources", tone: "up" },
  ];

  if (movers.length === 0) return fallback;

  return movers.map((row) => {
    const v = row.starsDelta24h;
    const pretty = v >= 0 ? `+${v} ★ 24h` : `${v} ★ 24h`;
    return {
      tag: "REPO",
      label: row.fullName,
      value: pretty,
      tone: v >= 0 ? "up" : "down",
    };
  });
}
