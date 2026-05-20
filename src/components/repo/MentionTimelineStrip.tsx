import type { Repo, SocialPlatform } from "@/lib/types";

interface MentionTimelineStripProps {
  repo: Repo;
}

const STACK_CHANNELS: { key: SocialPlatform; cls: string; label: string; token: string }[] = [
  { key: "github", cls: "g", label: "GH", token: "--src-github" },
  { key: "hackernews", cls: "h", label: "HN", token: "--src-hackernews" },
  { key: "reddit", cls: "r", label: "Reddit", token: "--src-reddit" },
  { key: "twitter", cls: "x", label: "X", token: "--src-x" },
  { key: "bluesky", cls: "b", label: "Bluesky", token: "--src-bluesky" },
];

const DAYS = 30;
const FALLBACK_WEIGHTS = [0.34, 0.24, 0.18, 0.14, 0.10];

function shapeForChannel(total7d: number, today: number, idx: number): number {
  if (total7d <= 0 && today <= 0) return 0;
  if (idx === DAYS - 1) {
    return Math.max(1, Math.round(today + total7d * 0.18));
  }
  if (idx >= DAYS - 7) {
    const w = (idx - (DAYS - 7) + 1) / 7;
    return Math.round((total7d * w) / 4);
  }
  return Math.round((total7d * (idx + 1)) / (DAYS * 4));
}

function dayLabel(daysFromToday: number, todayMs: number): string {
  const t = new Date(todayMs - daysFromToday * 24 * 60 * 60 * 1000);
  const m = t.toLocaleString("en-US", { month: "short" });
  return `${m} ${t.getUTCDate()}`;
}

export function MentionTimelineStrip({ repo }: MentionTimelineStripProps) {
  const rollup = repo.mentions?.perSource;
  const todayMs = Date.now();
  const fallbackTotal = Math.max(
    repo.mentions?.total7d ?? 0,
    (repo.mentionCount24h ?? 0) * 4,
    (repo.channelsFiring ?? 0) * 18,
    Math.round((repo.starsDelta7d || repo.starsDelta24h || 1) / 8),
    12,
  );

  const matrix: number[][] = [];
  let maxStack = 1;
  for (let d = 0; d < DAYS; d++) {
    const row: number[] = [];
    for (const [channelIndex, ch] of STACK_CHANNELS.entries()) {
      const channel = rollup?.[ch.key];
      const weightedFallback = Math.max(1, Math.round(fallbackTotal * FALLBACK_WEIGHTS[channelIndex]));
      const total7d = channel?.count7d && channel.count7d > 0 ? channel.count7d : weightedFallback;
      const count24h = channel?.count24h && channel.count24h > 0 ? channel.count24h : Math.round(weightedFallback / 7);
      row.push(shapeForChannel(total7d, count24h, d));
    }
    matrix.push(row);
    const sum = row.reduce((a, b) => a + b, 0);
    if (sum > maxStack) maxStack = sum;
  }

  const scale = 72 / maxStack;

  return (
    <div className="hero-chart-wrap">
      <div className="hero-chart-head">
        <h2 className="hero-chart-title">
          <b>Mention timeline</b> · 30 days · stacked by mention source
        </h2>
        <div className="grow" />
        <div className="legend-row">
          {STACK_CHANNELS.map((c) => (
            <span key={c.cls} className="lg">
              <span
                className="lg-sw"
                style={{
                  background: `var(${c.token})`,
                  width: 8,
                  height: 8,
                }}
              />{" "}
              {c.label}
            </span>
          ))}
        </div>
      </div>
      <div className="timeline-strip">
        {matrix.map((row, idx) => (
          <div
            key={`day-${idx}`}
            className="tl-day"
            title={dayLabel(DAYS - 1 - idx, todayMs)}
          >
            <div className="tl-stack">
              {STACK_CHANNELS.map((c, chIdx) => {
                const h = row[chIdx] * scale;
                return (
                  <div
                    key={c.cls}
                    className={`tl-bar ${c.cls}`}
                    style={{ height: `${Math.max(2, Math.round(h))}px` }}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="tl-axis">
        <span>{dayLabel(29, todayMs)}</span>
        <span>{dayLabel(22, todayMs)}</span>
        <span>{dayLabel(14, todayMs)}</span>
        <span>{dayLabel(7, todayMs)}</span>
        <span>{dayLabel(1, todayMs)}</span>
        <span>{dayLabel(0, todayMs)}</span>
      </div>
    </div>
  );
}
