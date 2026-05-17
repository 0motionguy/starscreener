// Agent Commerce — composite score histogram + top-10 bars.
//
// V4 rebuild: drops the hand-rolled inline-styled rows for the histogram and
// reuses the .funding-bars chrome pattern (same one /funding uses) for the
// top-10 leaderboard. All colors come from v4 tokens.

import Link from "next/link";

import { Card, CardBody, CardHeader } from "@/components/ui/Card";

import type { AgentCommerceItem, AgentCommerceStats } from "@/lib/agent-commerce/types";

interface ScoreBucket {
  label: string;
  min: number;
  max: number;
  color: string;
  count: number;
}

function buildBuckets(items: AgentCommerceItem[]): ScoreBucket[] {
  const buckets: ScoreBucket[] = [
    { label: "80–100", min: 80, max: 100, color: "var(--v4-money)", count: 0 },
    { label: "60–79", min: 60, max: 79, color: "var(--v4-blue)", count: 0 },
    { label: "40–59", min: 40, max: 59, color: "var(--v4-amber)", count: 0 },
    { label: "20–39", min: 20, max: 39, color: "var(--v4-acc)", count: 0 },
    { label: "0–19", min: 0, max: 19, color: "var(--v4-ink-400)", count: 0 },
  ];
  for (const item of items) {
    const s = item.scores.composite;
    for (const b of buckets) {
      if (s >= b.min && s <= b.max) {
        b.count++;
        break;
      }
    }
  }
  return buckets;
}

interface ScoreDistributionGridProps {
  items: AgentCommerceItem[];
  topByScore: AgentCommerceItem[];
  stats: AgentCommerceStats;
}

export function ScoreDistributionGrid({
  items,
  topByScore,
  stats,
}: ScoreDistributionGridProps) {
  const buckets = buildBuckets(items);
  const maxBucket = Math.max(...buckets.map((b) => b.count), 1);
  const topMax = Math.max(...topByScore.map((i) => i.scores.composite), 1);

  return (
    <div className="grid">
      <Card className="col-8">
        <CardHeader showCorner right={<span>{stats.totalItems} indexed</span>}>
          Top 10 · composite bars
        </CardHeader>
        <CardBody>
          <div className="funding-bars" aria-label="Composite leaderboard">
            {topByScore.slice(0, 10).map((item, idx) => {
              const width = Math.max(
                4,
                (item.scores.composite / topMax) * 100,
              );
              return (
                <Link
                  href={`/agent-commerce/${item.slug}`}
                  className="funding-bar"
                  key={item.id}
                >
                  <span className="idx">
                    {String(idx + 1).padStart(2, "0")}
                  </span>
                  <span className="track">
                    <i style={{ width: `${width}%` }} />
                  </span>
                  <span className="amt">
                    {item.scores.composite}
                    <span className="ac-bar-name">{item.name}</span>
                  </span>
                </Link>
              );
            })}
          </div>
        </CardBody>
      </Card>
      <Card className="col-4">
        <CardHeader showCorner right={<span>histogram</span>}>
          Score buckets
        </CardHeader>
        <CardBody>
          {buckets.map((b) => {
            const width = Math.round((b.count / maxBucket) * 100);
            return (
              <div className="ac-score-row" key={b.label}>
                <span
                  className="ac-score-row__pip"
                  style={{ background: b.color }}
                  aria-hidden
                />
                <span className="ac-score-row__label">{b.label}</span>
                <span className="ac-score-row__count">{b.count}</span>
                <span className="ac-score-row__track" aria-hidden>
                  <i
                    style={{
                      width: `${width}%`,
                      background: b.color,
                    }}
                  />
                </span>
              </div>
            );
          })}
        </CardBody>
      </Card>
    </div>
  );
}
