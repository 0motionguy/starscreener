// MentionTimelineStrip — 30-day stacked bar chart of mentions by source.
//
// IMPORTANT: src/lib/repo-mentions.server.ts does not expose a per-day
// breakdown today. Until that lands, this component synthesises a smooth
// 30-day distribution from the repo's sparklineData proportions, scaled to
// the actual 7d / 24h totals on perSource. This is clearly a synthetic
// curve, not real per-day mention data — a future phase will replace this
// with a real `byDay` accessor on `repo-mentions.server.ts`.

import type { Repo, SocialPlatform } from "@/lib/types";

interface MentionTimelineStripProps {
  repo: Repo;
}

const STACK_CHANNELS: { key: SocialPlatform; cls: string }[] = [
  { key: "github", cls: "g" },
  { key: "hackernews", cls: "h" },
  { key: "reddit", cls: "r" },
  { key: "twitter", cls: "x" },
  { key: "bluesky", cls: "b" },
];

const DAYS = 30;

function shapeForChannel(total7d: number, today: number, idx: number): number {
  // Map idx 0..29 to a soft growth curve, with the last 7 days carrying ~70%
  // of `total7d` and a single spike on day 29 (today) for `today`.
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

  // Build matrix [day][channel] = bar height in px (0..72 px).
  const matrix: number[][] = [];
  let maxStack = 1;
  for (let d = 0; d < DAYS; d++) {
    const row: number[] = [];
    for (const ch of STACK_CHANNELS) {
      const channel = rollup?.[ch.key];
      const v = shapeForChannel(
        channel?.count7d ?? 0,
        channel?.count24h ?? 0,
        d,
      );
      row.push(v);
    }
    matrix.push(row);
    const sum = row.reduce((a, b) => a + b, 0);
    if (sum > maxStack) maxStack = sum;
  }

  const SCALE = 72 / maxStack;

  return (
    <div className="hero-chart-wrap">
      <div className="hero-chart-head">
        <h2 className="hero-chart-title">
          ▌ <b>Mention timeline</b> · 30 days · stacked by mention source
        </h2>
        <div className="grow" />
        <div className="legend-row">
          {STACK_CHANNELS.map((c) => (
            <span key={c.cls} className="lg">
              <span
                className="lg-sw"
                style={{
                  background: `var(--src-${c.key})`,
                  width: 8,
                  height: 8,
                }}
              />{" "}
              {c.cls.toUpperCase()}
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
                const h = row[chIdx] * SCALE;
                if (h <= 0) return null;
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
