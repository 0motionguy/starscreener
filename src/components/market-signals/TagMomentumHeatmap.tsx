// TagMomentumHeatmap — grid of tag tiles colored by w/w volume delta.
// 21-28 tiles arranged in a CSS auto-fit grid. Background uses OKLCH so
// the warm-to-cool spectrum stays perceptually uniform.
//
// Tags are synthesized from the top-N most-common topics across the
// derived repos when `src/lib/signals/tag-momentum.ts` doesn't have
// usable cross-source SignalItem[] yet (the consensus pipeline is
// scheduled but not wired into the page render today). Each tile shows
// tag · count · trend arrow; the entire tile is a link to the trending
// hub pre-filtered by that topic.

import Link from "next/link";

import type { Repo } from "@/lib/types";

interface TagMomentumHeatmapProps {
  repos: Repo[];
  /** Target tile count. Tries to fit into ~4×7 grid. */
  limit?: number;
}

interface Tile {
  tag: string;
  count: number;
  delta: number; // -1..+1 normalized
  trend: "hot" | "warm" | "cool";
}

function deriveTiles(repos: Repo[], limit: number): Tile[] {
  const counts = new Map<string, number>();
  const recent = new Map<string, number>();
  const prior = new Map<string, number>();

  // Use 24h vs 7d-24h proxy as "recent vs prior" weight because per-tag
  // hourly data isn't wired into this page yet. Each repo contributes its
  // total mentions weight to each of its topic tags.
  for (const r of repos) {
    const tags = [
      ...(r.topics ?? []),
      ...(r.tags ?? []),
      ...(r.collectionNames ?? []),
    ];
    const m24 = r.mentions?.total24h ?? r.mentionCount24h ?? 0;
    const m7 = r.mentions?.total7d ?? m24;
    const priorWeight = Math.max(0, m7 - m24) / 6; // distribute 7d-24h across 6 prior days
    for (const t of tags) {
      const lo = (t ?? "").toLowerCase().trim();
      if (!lo || lo.length < 3 || lo.length > 32) continue;
      counts.set(lo, (counts.get(lo) ?? 0) + 1 + m24);
      recent.set(lo, (recent.get(lo) ?? 0) + m24);
      prior.set(lo, (prior.get(lo) ?? 0) + priorWeight);
    }
  }

  const ranked = Array.from(counts.entries())
    .filter(([, v]) => v >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);

  // Find max delta magnitude for normalization
  let maxAbs = 0;
  const rawDeltas: Array<{ tag: string; count: number; raw: number }> = [];
  for (const [tag, count] of ranked) {
    const r24 = recent.get(tag) ?? 0;
    const p = prior.get(tag) ?? 0;
    const raw = r24 - p;
    rawDeltas.push({ tag, count, raw });
    maxAbs = Math.max(maxAbs, Math.abs(raw));
  }

  return rawDeltas.map(({ tag, count, raw }) => {
    const delta = maxAbs > 0 ? raw / maxAbs : 0;
    const trend: Tile["trend"] = delta >= 0.4 ? "hot" : delta >= 0 ? "warm" : "cool";
    return { tag, count, delta, trend };
  });
}

/** Map normalized delta (-1..+1) onto an OKLCH background. */
function bgFromDelta(delta: number): string {
  // Hot (positive delta): orange (oklch ~ 75% 0.18 50)
  // Warm (mid-positive):  amber (oklch ~ 65% 0.12 70)
  // Cool (negative):      teal-blue (oklch ~ 55% 0.06 220)
  if (delta >= 0.55) return "oklch(74% 0.20 50)";
  if (delta >= 0.25) return "oklch(70% 0.16 60)";
  if (delta >= 0) return "oklch(60% 0.10 80)";
  if (delta >= -0.25) return "oklch(52% 0.07 200)";
  if (delta >= -0.55) return "oklch(46% 0.06 220)";
  return "oklch(40% 0.05 230)";
}

function fgFromDelta(delta: number): string {
  // Lighter copy on cool tiles so they remain readable on the dark canvas.
  return delta >= 0 ? "#0c0a0a" : "rgba(255,255,255,0.94)";
}

export function TagMomentumHeatmap({ repos, limit = 28 }: TagMomentumHeatmapProps) {
  const tiles = deriveTiles(repos, limit);

  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border-subtle)",
        borderRadius: "var(--r-1)",
        padding: 14,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: 10,
        }}
      >
        <div>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9.5,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "var(--fg-faint)",
            }}
          >
            // 03 · tag momentum · w/w
          </span>
          <h2
            style={{
              fontSize: 15,
              color: "var(--fg-bright)",
              fontWeight: 600,
              marginTop: 4,
            }}
          >
            What's moving
          </h2>
        </div>
        <span
          style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-faint)" }}
        >
          {tiles.length} tiles
        </span>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))",
          gap: 4,
        }}
      >
        {tiles.map((t) => {
          const arrow = t.delta > 0.05 ? "▲" : t.delta < -0.05 ? "▼" : "▶";
          return (
            <Link
              key={t.tag}
              href={`/?cat=repos&topic=${encodeURIComponent(t.tag)}`}
              prefetch={false}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 4,
                padding: "10px 10px 9px",
                background: bgFromDelta(t.delta),
                color: fgFromDelta(t.delta),
                borderRadius: "var(--r-1)",
                textDecoration: "none",
                minHeight: 64,
              }}
            >
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  lineHeight: 1.2,
                  fontWeight: 500,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {t.tag}
              </span>
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 9,
                  letterSpacing: "0.10em",
                  textTransform: "uppercase",
                  opacity: 0.78,
                }}
              >
                {t.count.toLocaleString()} · {arrow} {(t.delta * 100).toFixed(0)}%
              </span>
            </Link>
          );
        })}
        {tiles.length === 0 && (
          <div
            style={{
              gridColumn: "1 / -1",
              padding: "24px 12px",
              textAlign: "center",
              color: "var(--fg-faint)",
              fontFamily: "var(--font-mono)",
              fontSize: 11,
            }}
          >
            No tag data yet — waiting on first scoring pass.
          </div>
        )}
      </div>
    </div>
  );
}
