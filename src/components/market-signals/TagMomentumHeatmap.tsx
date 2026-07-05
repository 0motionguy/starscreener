// TagMomentumHeatmap — top tags by real mention volume, colored by
// week-over-week velocity WHEN we have a prior-week baseline, otherwise by
// volume. Real data only: no SEED_TAGS taxonomy, and — critically — no
// fabricated percentages. A tag with no prior-week baseline shows its mention
// COUNT, never the old placeholder "+96%". Tags derive from repos.topics +
// repos.tags + repos.collectionNames. Empty payload → empty grid.
//
// Once the `mentions-daily` worker slug accumulates ≥2 weeks of history, a real
// prior-week baseline exists and the tiles switch to true w/w automatically.

import Link from "next/link";

import type { Repo } from "@/lib/types";

interface TagMomentumHeatmapProps {
  repos: Repo[];
  limit?: number;
}

interface Tile {
  tag: string;
  count: number;
  /** Real week-over-week %, or null when there's no prior-week baseline. */
  deltaPct: number | null;
}

function deriveTiles(repos: Repo[], limit: number): Tile[] {
  const total = new Map<string, number>();
  const recent = new Map<string, number>();
  const prior = new Map<string, number>();

  for (const repo of repos) {
    const tags = [...(repo.topics ?? []), ...(repo.tags ?? []), ...(repo.collectionNames ?? [])];
    const mention24h = repo.mentions?.total24h ?? repo.mentionCount24h ?? 0;
    const mention7d = repo.mentions?.total7d ?? 0;
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
      // Real w/w ONLY with a prior-week baseline; otherwise null (→ show count).
      const deltaPct = p > 0 ? clamp(Math.round(((r - p) / p) * 100), -80, 300) : null;
      return { tag, count: Math.round(count), deltaPct };
    })
    .sort((a, b) => {
      const ad = a.deltaPct ?? -1e9;
      const bd = b.deltaPct ?? -1e9;
      if (bd !== ad) return bd - ad;
      return b.count - a.count;
    });

  const rows: Tile[] = [];
  const seen = new Set<string>();
  for (const tile of derived) {
    if (seen.has(tile.tag)) continue;
    rows.push(tile);
    seen.add(tile.tag);
    if (rows.length >= limit) break;
  }
  return rows;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function bgFromDelta(deltaPct: number): string {
  if (deltaPct >= 75) return "oklch(0.65 0.20 39)";
  if (deltaPct >= 45) return "oklch(0.58 0.16 39)";
  if (deltaPct >= 15) return "oklch(0.46 0.12 45)";
  if (deltaPct >= 0) return "oklch(0.30 0.05 130)";
  if (deltaPct >= -15) return "oklch(0.24 0.05 260)";
  return "oklch(0.26 0.12 25)";
}

function bgFromCount(count: number, max: number): string {
  const t = max > 0 ? Math.min(1, count / max) : 0;
  return `oklch(${(0.26 + t * 0.32).toFixed(3)} ${(0.05 + t * 0.12).toFixed(3)} 45)`;
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
  const maxCount = tiles.reduce((m, t) => Math.max(m, t.count), 0);
  const anyReal = tiles.some((t) => t.deltaPct !== null);

  return (
    <div className="card">
      <div className="card-head">
        <h2 className="card-title">
          <b>{anyReal ? "Tag momentum" : "Top tags"}</b> · {tiles.length} tags ·{" "}
          {anyReal ? "w/w" : "by mention volume"}
        </h2>
        <span className="grow" />
        <span className="muted" style={{ fontSize: 10 }}>
          {anyReal ? "brighter = hotter" : "brighter = more mentions"}
        </span>
      </div>

      {tiles.length === 0 ? (
        <div style={{ padding: "24px 16px", textAlign: "center", fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--fg-faint)" }}>
          No tagged repos in window — spine is quiet.
        </div>
      ) : (
        <>
          <div className="heatmap-grid">
            {tiles.map((tile) => {
              const hasDelta = tile.deltaPct !== null;
              const deltaClass =
                hasDelta && tile.deltaPct! < -12 ? "dn-text" : hasDelta && tile.deltaPct! < 0 ? "faint" : "";
              return (
                <Link
                  key={tile.tag}
                  href={`/?cat=repos&topic=${encodeURIComponent(tile.tag)}`}
                  prefetch={false}
                  className="heat-cell"
                  title={
                    hasDelta
                      ? `${tile.tag} - ${tile.deltaPct! >= 0 ? "+" : ""}${tile.deltaPct}% w/w`
                      : `${tile.tag} - ${formatCount(tile.count)} mentions`
                  }
                  style={{
                    background: hasDelta ? bgFromDelta(tile.deltaPct!) : bgFromCount(tile.count, maxCount),
                    textDecoration: "none",
                  }}
                >
                  <div className="heat-cell-label">
                    <div>{labelFor(tile.tag)}</div>
                    {hasDelta ? (
                      <div className={`v ${deltaClass}`}>
                        {tile.deltaPct! >= 0 ? "+" : ""}
                        {tile.deltaPct}%
                      </div>
                    ) : (
                      <div className="v">{formatCount(tile.count)}</div>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>

          <div style={{ padding: "8px 16px 12px", display: "flex", justifyContent: "space-between", alignItems: "center", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-faint)" }}>
            <span>
              <b style={{ color: "var(--fg)" }}>{tiles.length} tags shown</b> ·{" "}
              {anyReal ? "ordered by w/w change" : "ordered by mention volume"}
            </span>
            <Link className="btn ghost sm" href="/?cat=repos&topic=agents" prefetch={false} style={{ textDecoration: "none" }}>
              All tags
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
