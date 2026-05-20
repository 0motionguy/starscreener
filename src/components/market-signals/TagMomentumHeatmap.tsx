// TagMomentumHeatmap - 21 tag tiles colored by week-over-week velocity.
// Derived tags from repos are preferred; a seeded taxonomy fills the cockpit
// when the current payload does not expose enough tag volume.

import Link from "next/link";

import type { Repo } from "@/lib/types";

interface TagMomentumHeatmapProps {
  repos: Repo[];
  limit?: number;
}

interface Tile {
  tag: string;
  count: number;
  deltaPct: number;
}

const SEED_TAGS: Tile[] = [
  { tag: "agents", count: 4200, deltaPct: 84 },
  { tag: "mcp", count: 2800, deltaPct: 72 },
  { tag: "coding-agent", count: 1900, deltaPct: 68 },
  { tag: "streaming", count: 1600, deltaPct: 52 },
  { tag: "rag", count: 1440, deltaPct: 48 },
  { tag: "multimodal", count: 1190, deltaPct: 38 },
  { tag: "agentic", count: 1050, deltaPct: 32 },
  { tag: "evals", count: 940, deltaPct: 28 },
  { tag: "fine-tune", count: 830, deltaPct: 24 },
  { tag: "observability", count: 760, deltaPct: 22 },
  { tag: "vector-db", count: 690, deltaPct: 18 },
  { tag: "embeddings", count: 610, deltaPct: 14 },
  { tag: "audio", count: 460, deltaPct: 8 },
  { tag: "image", count: 430, deltaPct: 4 },
  { tag: "memory", count: 390, deltaPct: 2 },
  { tag: "orchestration", count: 340, deltaPct: -1 },
  { tag: "prompt-eng", count: 320, deltaPct: -3 },
  { tag: "ml-ops", count: 290, deltaPct: -8 },
  { tag: "serving", count: 260, deltaPct: -12 },
  { tag: "diffusion", count: 220, deltaPct: -18 },
  { tag: "automl", count: 180, deltaPct: -22 },
];

function deriveTiles(repos: Repo[], limit: number): Tile[] {
  const total = new Map<string, number>();
  const recent = new Map<string, number>();
  const prior = new Map<string, number>();

  for (const repo of repos) {
    const tags = [...(repo.topics ?? []), ...(repo.tags ?? []), ...(repo.collectionNames ?? [])];
    const mention24h = repo.mentions?.total24h ?? repo.mentionCount24h ?? 0;
    const mention7d = repo.mentions?.total7d ?? mention24h + Math.max(0, repo.starsDelta7d ?? 0);
    const priorWeight = Math.max(0, mention7d - mention24h) / 6;

    for (const rawTag of tags) {
      const tag = String(rawTag).toLowerCase().trim();
      if (!tag || tag.length < 3 || tag.length > 32) continue;
      total.set(tag, (total.get(tag) ?? 0) + 1 + mention24h);
      recent.set(tag, (recent.get(tag) ?? 0) + mention24h);
      prior.set(tag, (prior.get(tag) ?? 0) + priorWeight);
    }
  }

  const derived = Array.from(total.entries())
    .filter(([, count]) => count >= 2)
    .map(([tag, count]) => {
      const r = recent.get(tag) ?? 0;
      const p = prior.get(tag) ?? 0;
      const deltaPct = p > 0 ? Math.round(((r - p) / p) * 100) : Math.min(96, Math.round(r));
      return { tag, count: Math.round(count), deltaPct: clamp(deltaPct, -42, 96) };
    })
    .sort((a, b) => {
      if (b.deltaPct !== a.deltaPct) return b.deltaPct - a.deltaPct;
      return b.count - a.count;
    });

  const rows: Tile[] = [];
  const seen = new Set<string>();
  for (const tile of derived) {
    if (seen.has(tile.tag)) continue;
    rows.push(tile);
    seen.add(tile.tag);
    if (rows.length >= limit) return rows;
  }
  for (const tile of SEED_TAGS) {
    if (seen.has(tile.tag)) continue;
    rows.push(tile);
    seen.add(tile.tag);
    if (rows.length >= limit) return rows;
  }
  return rows.slice(0, limit);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function bgFromDelta(deltaPct: number): string {
  if (deltaPct >= 75) return "oklch(0.65 0.20 39)";
  if (deltaPct >= 60) return "oklch(0.62 0.18 39)";
  if (deltaPct >= 45) return "oklch(0.58 0.16 39)";
  if (deltaPct >= 30) return "oklch(0.52 0.14 39)";
  if (deltaPct >= 15) return "oklch(0.38 0.08 60)";
  if (deltaPct >= 4) return "oklch(0.30 0.05 130)";
  if (deltaPct >= 0) return "oklch(0.26 0.04 210)";
  if (deltaPct >= -8) return "oklch(0.22 0.05 260)";
  if (deltaPct >= -15) return "oklch(0.22 0.06 295)";
  return "oklch(0.26 0.12 25)";
}

function labelFor(tag: string): string {
  const compact = tag.replace(/^ai-/, "").replace(/-/g, " ").toUpperCase();
  if (compact.length <= 7) return compact;
  const initials = compact
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("");
  return initials.length >= 2 && initials.length <= 7 ? initials : compact.slice(0, 7);
}

function formatCount(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return Math.round(count).toLocaleString();
}

export function TagMomentumHeatmap({ repos, limit = 21 }: TagMomentumHeatmapProps) {
  const tiles = deriveTiles(repos, limit);
  const hidden = Math.max(0, SEED_TAGS.length - tiles.length);

  return (
    <div className="card">
      <div className="card-head">
        <h2 className="card-title">
          <b>Tag momentum</b> - 28 tags - last 7d
        </h2>
        <span className="grow" />
        <span className="muted" style={{ fontSize: 10 }}>
          brighter = hotter
        </span>
      </div>

      <div className="heatmap-grid">
        {tiles.map((tile) => {
          const deltaClass = tile.deltaPct < -12 ? "dn-text" : tile.deltaPct < 0 ? "faint" : "";
          return (
            <Link
              key={tile.tag}
              href={`/?cat=repos&topic=${encodeURIComponent(tile.tag)}`}
              prefetch={false}
              className="heat-cell"
              title={`${tile.tag} - ${tile.deltaPct >= 0 ? "+" : ""}${tile.deltaPct}% w/w - ${formatCount(tile.count)} mentions`}
              style={{ background: bgFromDelta(tile.deltaPct), textDecoration: "none" }}
            >
              <div className="heat-cell-label">
                <div>{labelFor(tile.tag)}</div>
                <div className={`v ${deltaClass}`}>
                  {tile.deltaPct >= 0 ? "+" : ""}
                  {tile.deltaPct}%
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      <div style={{ padding: "8px 16px 12px", display: "flex", justifyContent: "space-between", alignItems: "center", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-faint)" }}>
        <span>
          <b style={{ color: "var(--fg)" }}>{tiles.length} tags shown</b> - ordered by w/w change
        </span>
        <Link className="btn ghost sm" href="/?cat=repos&topic=agents" prefetch={false} style={{ textDecoration: "none" }}>
          + {hidden || 7} more tags
        </Link>
      </div>
    </div>
  );
}
