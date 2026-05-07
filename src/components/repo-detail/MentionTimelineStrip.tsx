// // 03 MENTIONS — 14-day bar timeline strip rendered above the tab bar.
//
// Buckets the rendered MentionItem[] by UTC day for the last 14 days and
// renders a small horizontal bar chart, color-coded by the dominant source
// in each bucket. The tallest bucket gets a label call-out (mockup shows
// "HN FRONT-PAGE · APR 12"). When no mentions exist, renders a thin empty
// strip rather than vanishing entirely so the section still has visual
// anchoring.
//
// Pure server component. No interactivity.

import type { JSX } from "react";
import {
  MENTION_SOURCE_COLORS,
  MENTION_SOURCE_LABELS,
  type MentionItem,
  type MentionSource,
} from "./MentionMeta";

interface MentionTimelineStripProps {
  mentions: MentionItem[];
  /** Window size in days. Defaults to 14 to match the mockup. */
  windowDays?: number;
}

interface DayBucket {
  /** YYYY-MM-DD (UTC). */
  date: string;
  count: number;
  topSource: MentionSource | null;
  /** Sample mention used for the call-out label. */
  sampleTitle?: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function utcDateString(t: number): string {
  const d = new Date(t);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function bucketByDay(
  mentions: MentionItem[],
  windowDays: number,
): DayBucket[] {
  const now = Date.now();
  const buckets = new Map<
    string,
    { count: number; perSource: Map<MentionSource, number>; sample?: string }
  >();
  for (let i = 0; i < windowDays; i++) {
    buckets.set(utcDateString(now - i * DAY_MS), {
      count: 0,
      perSource: new Map(),
    });
  }
  for (const m of mentions) {
    const t = Date.parse(m.createdAt);
    if (!Number.isFinite(t)) continue;
    if (now - t > windowDays * DAY_MS) continue;
    const key = utcDateString(t);
    const bucket = buckets.get(key);
    if (!bucket) continue;
    bucket.count += 1;
    bucket.perSource.set(
      m.source,
      (bucket.perSource.get(m.source) ?? 0) + 1,
    );
    if (!bucket.sample) bucket.sample = m.title;
  }
  // Newest-rightmost — iterate the window forward in time.
  const out: DayBucket[] = [];
  for (let i = windowDays - 1; i >= 0; i--) {
    const date = utcDateString(now - i * DAY_MS);
    const b = buckets.get(date)!;
    let topSource: MentionSource | null = null;
    let topCount = 0;
    for (const [src, c] of b.perSource) {
      if (c > topCount) {
        topCount = c;
        topSource = src;
      }
    }
    out.push({
      date,
      count: b.count,
      topSource,
      sampleTitle: b.sample,
    });
  }
  return out;
}

function calloutLabel(b: DayBucket): string | null {
  if (!b.topSource) return null;
  const sourceLabel = MENTION_SOURCE_LABELS[b.topSource].toUpperCase();
  const dt = new Date(`${b.date}T00:00:00Z`);
  const monthShort = dt.toLocaleString("en-US", {
    month: "short",
    timeZone: "UTC",
  }).toUpperCase();
  const day = dt.getUTCDate();
  return `${sourceLabel} · ${monthShort} ${day}`;
}

export function MentionTimelineStrip({
  mentions,
  windowDays = 14,
}: MentionTimelineStripProps): JSX.Element {
  const buckets = bucketByDay(mentions, windowDays);
  const max = Math.max(1, ...buckets.map((b) => b.count));
  const total = mentions.length;
  let peakIdx = -1;
  let peakCount = 0;
  for (let i = 0; i < buckets.length; i++) {
    if (buckets[i].count > peakCount) {
      peakCount = buckets[i].count;
      peakIdx = i;
    }
  }
  const peak = peakIdx >= 0 ? buckets[peakIdx] : null;
  const peakLabel = peak && peak.count > 0 ? calloutLabel(peak) : null;
  const recent7 = buckets
    .slice(-7)
    .reduce((acc, b) => acc + b.count, 0);

  return (
    <div className="mention-timeline-strip" aria-label={`Mentions in the last ${windowDays} days`}>
      <header className="mts-head">
        <span className="mts-eyebrow">{"// MENTIONS · "}{windowDays}D</span>
        {peakLabel ? (
          <span className="mts-callout" style={{ color: peak?.topSource ? MENTION_SOURCE_COLORS[peak.topSource] : undefined }}>
            ▲ {peakLabel}
          </span>
        ) : null}
        <span className="mts-spacer" />
        <span className="mts-totals">
          {total} total <b className="mts-recent">+{recent7}</b> 7d
        </span>
      </header>
      <div className="mts-bars" role="presentation">
        {buckets.map((b, i) => {
          const heightPct = b.count === 0 ? 6 : Math.max(8, Math.round((b.count / max) * 100));
          const color = b.topSource
            ? MENTION_SOURCE_COLORS[b.topSource]
            : "var(--v3-line-200, rgba(255,255,255,0.16))";
          const isPeak = i === peakIdx && peakCount > 0;
          const title =
            b.count === 0
              ? `${b.date} — no mentions`
              : `${b.date} — ${b.count} mention${b.count === 1 ? "" : "s"}${
                  b.sampleTitle ? `\n${b.sampleTitle.slice(0, 80)}` : ""
                }`;
          return (
            <span
              key={b.date}
              className={`mts-bar ${isPeak ? "peak" : ""}`}
              title={title}
              style={{
                height: `${heightPct}%`,
                background: color,
                opacity: b.count === 0 ? 0.16 : 1,
              }}
            />
          );
        })}
      </div>
      <style>{`
        .mention-timeline-strip {
          display: flex;
          flex-direction: column;
          gap: 6px;
          padding: 10px 12px;
          border: 1px solid var(--v3-line-100, rgba(255,255,255,0.08));
          border-radius: 3px;
          background: var(--v3-bg-050, rgba(255,255,255,0.025));
        }
        .mts-head {
          display: flex;
          align-items: center;
          gap: 10px;
          font-family: var(--font-geist-mono, monospace);
          font-size: 10px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--v3-ink-300, rgba(255,255,255,0.7));
        }
        .mts-eyebrow { color: var(--v3-ink-300); }
        .mts-callout {
          font-size: 9px;
          letter-spacing: 0.12em;
          color: var(--v3-acc);
        }
        .mts-spacer { flex: 1; }
        .mts-totals { color: var(--v3-ink-400, rgba(255,255,255,0.55)); }
        .mts-recent { color: var(--sig-green, #22c55e); font-weight: 600; }
        .mts-bars {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(0, 1fr));
          grid-auto-flow: column;
          align-items: end;
          gap: 4px;
          height: 40px;
          padding: 4px 0 0;
        }
        .mts-bar {
          display: block;
          width: 100%;
          min-height: 2px;
          border-radius: 1px;
          transition: opacity 120ms;
        }
        .mts-bar.peak {
          box-shadow: 0 0 0 1px var(--v3-acc, #ffcb05);
        }
      `}</style>
    </div>
  );
}

export default MentionTimelineStrip;
