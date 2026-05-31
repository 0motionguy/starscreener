// Ticker — global. Server component. Builds default item set from live data.
// Per-page consumers can pass their own items[] to override the default feed.

import { getTopMoversByDelta24h } from "@/lib/trending";
import { getRecentDrops } from "@/lib/recent-drops";
import Image from "next/image";

export interface TickerItem {
  tag: string;
  label: string;
  value: string;
  tone?: "up" | "down" | "flat";
  /** Optional small avatar shown before the label (e.g. repo owner). */
  imageUrl?: string;
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
            <span className="tick-tag" data-new={it.tag === "NEW" ? "" : undefined}>{it.tag}</span>
            {it.imageUrl ? (
              <Image
                className="tick-avatar"
                src={it.imageUrl}
                alt=""
                width={18}
                height={18}
                sizes="18px"
              />
            ) : null}
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

function buildNewDropItems(): TickerItem[] {
  try {
    return getRecentDrops()
      .slice(0, 3)
      .map((drop) => ({
        tag: "NEW",
        label: drop.fullName,
        value: "just dropped",
        tone: "up" as const,
        imageUrl:
          drop.avatarUrl ||
          (drop.owner
            ? `https://github.com/${encodeURIComponent(drop.owner)}.png?size=48`
            : undefined),
      }));
  } catch {
    return [];
  }
}

function buildDefaultTicker(): TickerItem[] {
  const news = buildNewDropItems();

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

  if (movers.length === 0) return news.length > 0 ? [...news, ...fallback] : fallback;

  const moverItems: TickerItem[] = movers.map((row) => {
    const v = row.starsDelta24h;
    const pretty = v >= 0 ? `+${v} stars 24h` : `${v} stars 24h`;
    const owner = row.fullName.split("/")[0] ?? "";
    return {
      tag: "REPO",
      label: row.fullName,
      value: pretty,
      tone: v >= 0 ? "up" : "down",
      // GitHub serves any owner's avatar at github.com/<owner>.png (user or
      // org); CSP img-src allows https. No stored avatar needed.
      imageUrl: owner
        ? `https://github.com/${encodeURIComponent(owner)}.png?size=48`
        : undefined,
    };
  });

  return [...news, ...moverItems];
}
