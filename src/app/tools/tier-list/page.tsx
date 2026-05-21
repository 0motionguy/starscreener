// /tools/tier-list — Server Component.
//
// Computes a 50-repo S/A/B/C/D tier list off the derived-repos corpus and
// renders it as a vertical board (S top, D bottom). Each tile shows the
// owner's GitHub avatar, owner/name, the composite tier score, and a 24h
// stars-Δ pill.
//
// Deep-link contract: `?seed=<owner>/<name>` (used by RepoHeroCard) drives
// the prominent "Highlighted" hero card; the matching tile in its tier row
// gets an accent ring. Unrecognised seeds are silently ignored.
//
// Tier classification (intentionally simple — produces visible spread):
//   score = starsDelta7d * 0.6
//         + starsDelta24h * 1.2
//         + crossSourceMentions * 40
// Then quintile-ish slicing on the top-50 sorted desc:
//   S = top 5%   (≈ 3 of 50)
//   A = next 10% (≈ 5 of 50)
//   B = next 20% (≈ 10 of 50)
//   C = next 30% (≈ 15 of 50)
//   D = bottom 35% (≈ 17 of 50)

import {
  getDerivedRepos,
  getDerivedRepoByFullName,
} from "@/lib/derived-repos";
import {
  refreshTrendingFromStore,
  getLastFetchedAt,
  getTrackedRepoCount,
} from "@/lib/trending";

import {
  TierHero,
  type HighlightedRepo,
} from "@/components/tools/tier-list/TierHero";
import {
  TierListBoard,
  type TierLetter,
  type TierListItem,
  type TierRow,
} from "@/components/tools/tier-list/TierListBoard";

// ISR — 10 minutes. The derived-repos corpus rebuilds every ~3h via cron,
// so a 10m revalidate keeps the page warm without burning Lambda time.
export const revalidate = 600;

export const metadata = {
  title: "Tier List — TrendingRepo",
  description:
    "Top tracked open-source repositories graded S / A / B / C / D by weekly star delta, 24h velocity, and cross-source mention pressure. Deep-link any repo to see where it ranks.",
  openGraph: {
    images: [
      { url: "/api/og/tools/tier-list", width: 1200, height: 630 },
    ],
  },
};

interface Props {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

const TIER_DEFINITIONS: Array<{
  letter: TierLetter;
  label: string;
  description: string;
  /** Cumulative fraction (top portion) of the 50-row list belonging at-or-above this tier. */
  cumulative: number;
}> = [
  { letter: "S", label: "S Tier", description: "Top 5% · breakout territory", cumulative: 0.05 },
  { letter: "A", label: "A Tier", description: "Next 10% · firing across signals", cumulative: 0.15 },
  { letter: "B", label: "B Tier", description: "Next 20% · steady climbers", cumulative: 0.35 },
  { letter: "C", label: "C Tier", description: "Next 30% · holding ground", cumulative: 0.65 },
  { letter: "D", label: "D Tier", description: "Bottom 35% · cooling or new", cumulative: 1.0 },
];

const MAX_REPOS = 50;

function computeScore(item: {
  starsDelta7d: number;
  starsDelta24h: number;
  crossSourceMentions: number;
  momentumScore?: number | null;
  stars?: number;
}): number {
  const d7 = Number.isFinite(item.starsDelta7d) ? item.starsDelta7d : 0;
  const d24 = Number.isFinite(item.starsDelta24h) ? item.starsDelta24h : 0;
  const mentions = Number.isFinite(item.crossSourceMentions)
    ? item.crossSourceMentions
    : 0;
  const liveScore = d7 * 0.6 + d24 * 1.2 + mentions * 40;
  if (liveScore > 0) return liveScore;
  const momentum = Number.isFinite(item.momentumScore ?? NaN)
    ? item.momentumScore ?? 0
    : 0;
  const stars = Number.isFinite(item.stars ?? NaN) ? item.stars ?? 0 : 0;
  return momentum + Math.log10(stars + 1);
}

function readSeed(
  raw: string | string[] | undefined,
): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (!trimmed.includes("/")) return null;
  // Defensive: reject anything that doesn't look like a GitHub owner/name.
  if (trimmed.length > 200) return null;
  return trimmed;
}

export default async function TierListPage({ searchParams }: Props) {
  await refreshTrendingFromStore();

  const params = (await searchParams) ?? {};
  const seed = readSeed(params.seed);

  const allRepos = getDerivedRepos();

  // Filter to repos that have any movement data + a real fullName, score them,
  // and keep the top MAX_REPOS by score. crossSourceMentions is read off the
  // unified rollup; absent rollup falls back to mentionCount24h so cold-start
  // doesn't zero everything.
  const candidates: TierListItem[] = allRepos
    .filter((repo) => repo.fullName.includes("/"))
    .map((repo) => {
      const mentions =
        repo.mentions?.total7d ??
        repo.mentions?.total24h ??
        repo.mentionCount24h ??
        0;
      const item: TierListItem = {
        fullName: repo.fullName,
        name: repo.name,
        owner: repo.owner,
        score: computeScore({
          starsDelta7d: repo.starsDelta7d,
          starsDelta24h: repo.starsDelta24h,
          crossSourceMentions: mentions,
          momentumScore: repo.momentumScore,
          stars: repo.stars,
        }),
        starsDelta7d: repo.starsDelta7d,
        starsDelta24h: repo.starsDelta24h,
        crossSourceMentions: mentions,
        categoryId: repo.categoryId,
        language: repo.language,
      };
      return item;
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_REPOS);

  // Slice candidates into S/A/B/C/D using cumulative fractions.
  const total = candidates.length;
  const rows: TierRow[] = [];
  let cursor = 0;
  for (let i = 0; i < TIER_DEFINITIONS.length; i += 1) {
    const def = TIER_DEFINITIONS[i];
    const isLast = i === TIER_DEFINITIONS.length - 1;
    const endIdx = isLast ? total : Math.max(cursor, Math.round(total * def.cumulative));
    const slice = candidates.slice(cursor, endIdx);
    rows.push({
      letter: def.letter,
      label: def.label,
      description: def.description,
      items: slice,
    });
    cursor = endIdx;
  }

  // Resolve the seed against the top-50 first; if not present in the list,
  // fall back to a lookup against the full derived corpus so the highlight
  // hero still shows something useful (with rank "off-list").
  let highlighted: HighlightedRepo | null = null;
  if (seed) {
    for (const row of rows) {
      const idx = row.items.findIndex(
        (item) => item.fullName.toLowerCase() === seed.toLowerCase(),
      );
      if (idx >= 0) {
        const item = row.items[idx];
        const rank =
          rows
            .slice(0, rows.indexOf(row))
            .reduce((sum, r) => sum + r.items.length, 0) + idx + 1;
        highlighted = { item, tier: row.letter, rank };
        break;
      }
    }
    if (!highlighted) {
      const repo = getDerivedRepoByFullName(seed);
      if (repo) {
        const mentions =
          repo.mentions?.total7d ??
          repo.mentions?.total24h ??
          repo.mentionCount24h ??
          0;
        const item: TierListItem = {
          fullName: repo.fullName,
          name: repo.name,
          owner: repo.owner,
          score: computeScore({
            starsDelta7d: repo.starsDelta7d,
            starsDelta24h: repo.starsDelta24h,
            crossSourceMentions: mentions,
            momentumScore: repo.momentumScore,
            stars: repo.stars,
          }),
          starsDelta7d: repo.starsDelta7d,
          starsDelta24h: repo.starsDelta24h,
          crossSourceMentions: mentions,
          categoryId: repo.categoryId,
          language: repo.language,
        };
        highlighted = { item, tier: "D", rank: 0 };
      }
    }
  }

  const fetchedAt = getLastFetchedAt();
  const trackedCount = getTrackedRepoCount();

  const highlightedFullName = highlighted?.item.fullName ?? null;

  return (
    <div className="tier-list-page">
      <TierListPageStyles />
      <TierHero
        repoCount={total}
        trackedCount={trackedCount}
        fetchedAt={fetchedAt}
        rows={rows}
        highlighted={highlighted}
      />
      <TierListBoard
        rows={rows}
        highlightedFullName={highlightedFullName}
      />
    </div>
  );
}

// All styles inlined — keeps the page self-contained without touching
// public/shell.css (forbidden by the task) and without introducing a
// global stylesheet just for one route.
function TierListPageStyles() {
  return (
    <style>{`
      .tier-list-page {
        padding: 24px 22px 64px;
        max-width: 1500px;
        margin: 0 auto;
      }

      /* ---------- Hero ---------- */
      .tier-hero {
        position: relative;
        padding: 0 0 22px;
        border-bottom: 1px solid var(--border-subtle);
        margin-bottom: 24px;
      }
      .tier-hero-eyebrow {
        display: flex;
        align-items: center;
        gap: 10px;
        font-family: var(--font-mono);
        font-size: 11px;
        color: var(--fg-faint);
        letter-spacing: 0.10em;
        text-transform: uppercase;
      }
      .tier-hero-back {
        color: var(--fg-muted);
        text-decoration: none;
        transition: color var(--d-fast) var(--ease);
      }
      .tier-hero-back:hover { color: var(--accent); }
      .tier-hero-sep { color: var(--surface-4); }
      .tier-hero-eyebrow-num {
        color: var(--accent);
        font-weight: 600;
      }
      .tier-hero-fresh {
        margin-left: auto;
      }

      .tier-hero-title {
        font-family: var(--font-display);
        font-size: 48px;
        line-height: 1.0;
        margin: 12px 0 8px;
        color: var(--fg-bright);
        letter-spacing: -0.02em;
        font-weight: 700;
      }
      .tier-hero-title-accent {
        color: var(--accent);
      }
      .tier-hero-sub {
        color: var(--fg-muted);
        font-size: 14px;
        line-height: 1.55;
        max-width: 720px;
        margin: 0 0 22px;
      }
      .tier-hero-stats {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 0;
        border: 1px solid var(--border-subtle);
        background: var(--surface);
      }
      .tier-stat {
        padding: 14px 18px;
        border-right: 1px solid var(--border-subtle);
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .tier-stat:last-child { border-right: none; }
      .tier-stat-label {
        font-family: var(--font-mono);
        font-size: 9.5px;
        color: var(--fg-faint);
        letter-spacing: 0.10em;
        text-transform: uppercase;
      }
      .tier-stat-value {
        font-family: var(--font-mono);
        font-size: 22px;
        color: var(--fg-bright);
        font-variant-numeric: tabular-nums;
        font-weight: 500;
      }
      .tier-stat-suffix {
        font-family: var(--font-mono);
        font-size: 11px;
        color: var(--fg-muted);
        margin-left: 4px;
        font-weight: 400;
      }

      /* ---------- Highlighted seed card ---------- */
      .tier-highlight {
        position: relative;
        margin-top: 22px;
        padding: 18px 20px;
        border: 1px solid var(--accent-border, rgba(255, 107, 53, 0.4));
        background:
          linear-gradient(180deg, var(--accent-wash) 0%, transparent 100%),
          var(--surface);
        overflow: hidden;
      }
      .tier-highlight-glow {
        position: absolute;
        inset: -1px;
        pointer-events: none;
        background: radial-gradient(
          400px circle at 0% 0%,
          var(--accent-glow) 0%,
          transparent 60%
        );
        opacity: 0.35;
      }
      .tier-highlight-eyebrow {
        position: relative;
        display: flex;
        align-items: center;
        gap: 10px;
        font-family: var(--font-mono);
        font-size: 10px;
        color: var(--fg-faint);
        letter-spacing: 0.10em;
        text-transform: uppercase;
        margin-bottom: 10px;
      }
      .tier-highlight-eyebrow-tag {
        background: var(--accent);
        color: var(--bg);
        padding: 2px 7px;
        font-weight: 700;
        letter-spacing: 0.10em;
      }
      .tier-highlight-eyebrow-rank {
        color: var(--accent);
      }
      .tier-highlight-row {
        position: relative;
        display: flex;
        align-items: center;
        gap: 14px;
      }
      .tier-highlight-logo {
        width: 64px;
        height: 64px;
        border-radius: 8px;
        background: var(--surface-3);
        object-fit: cover;
        flex-shrink: 0;
      }
      .tier-highlight-logo--monogram {
        display: grid;
        place-items: center;
        font-family: var(--font-display);
        font-size: 28px;
        font-weight: 700;
        color: var(--fg-bright);
      }
      .tier-highlight-meta {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .tier-highlight-name {
        font-family: var(--font-mono);
        font-size: 18px;
        text-decoration: none;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .tier-highlight-owner { color: var(--fg-muted); }
      .tier-highlight-slash { color: var(--surface-4); margin: 0 2px; }
      .tier-highlight-repo {
        color: var(--fg-bright);
        font-weight: 600;
      }
      .tier-highlight-tags {
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
      }
      .tier-highlight-tag {
        font-family: var(--font-mono);
        font-size: 9.5px;
        color: var(--fg-muted);
        text-transform: uppercase;
        letter-spacing: 0.08em;
        padding: 2px 6px;
        background: var(--surface-2);
        border: 1px solid var(--border-subtle);
      }
      .tier-highlight-badge {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 0;
        padding: 8px 14px;
        min-width: 64px;
        color: var(--bg);
        border-radius: 4px;
        flex-shrink: 0;
      }
      .tier-highlight-badge-letter {
        font-family: var(--font-display);
        font-size: 28px;
        font-weight: 800;
        line-height: 1;
      }
      .tier-highlight-badge-label {
        font-family: var(--font-mono);
        font-size: 8.5px;
        letter-spacing: 0.10em;
        text-transform: uppercase;
        margin-top: 2px;
        opacity: 0.7;
      }
      .tier-highlight-breakdown {
        position: relative;
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 0;
        margin-top: 16px;
        border-top: 1px solid var(--border-subtle);
        padding-top: 12px;
      }
      .tier-highlight-stat {
        display: flex;
        flex-direction: column;
        gap: 3px;
        border-right: 1px solid var(--border-subtle);
        padding: 0 14px;
      }
      .tier-highlight-stat:first-child { padding-left: 0; }
      .tier-highlight-stat:last-child {
        border-right: none;
        padding-right: 0;
      }
      .tier-highlight-stat-name {
        font-family: var(--font-mono);
        font-size: 9px;
        color: var(--fg-faint);
        letter-spacing: 0.10em;
        text-transform: uppercase;
      }
      .tier-highlight-stat-value {
        font-family: var(--font-mono);
        font-size: 18px;
        font-variant-numeric: tabular-nums;
        font-weight: 500;
      }

      /* ---------- Board ---------- */
      .tier-list-board {
        display: flex;
        flex-direction: column;
        border: 1px solid var(--border-subtle);
      }
      .tier-row {
        display: flex;
        align-items: stretch;
        min-height: 116px;
        border-bottom: 1px solid var(--border-subtle);
        background: var(--surface);
      }
      .tier-row:last-child { border-bottom: none; }
      .tier-row:nth-child(even) { background: var(--surface-2); }

      .tier-bezel {
        flex-shrink: 0;
        width: 92px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 4px;
        font-family: var(--font-display);
        font-weight: 800;
        border-right: 1px solid var(--border-subtle);
      }
      .tier-letter {
        font-size: 44px;
        line-height: 0.9;
      }
      .tier-count {
        font-family: var(--font-mono);
        font-size: 10px;
        opacity: 0.7;
        letter-spacing: 0.08em;
        font-weight: 600;
      }

      .tier-body {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 12px 14px;
      }
      .tier-head {
        display: flex;
        align-items: baseline;
        gap: 10px;
      }
      .tier-label {
        font-family: var(--font-display);
        font-size: 13px;
        font-weight: 600;
        color: var(--fg-bright);
        letter-spacing: 0.04em;
      }
      .tier-desc {
        font-family: var(--font-mono);
        font-size: 10.5px;
        color: var(--fg-faint);
        text-transform: uppercase;
        letter-spacing: 0.06em;
      }
      .tier-empty {
        font-family: var(--font-mono);
        font-size: 11px;
        color: var(--fg-faint);
        font-style: italic;
        padding: 6px 0;
      }
      .tier-tiles {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }

      /* ---------- Tiles ---------- */
      .tier-tile {
        display: flex;
        flex-direction: column;
        gap: 8px;
        width: 196px;
        padding: 10px 12px;
        background: var(--surface);
        border: 1px solid var(--border-subtle);
        text-decoration: none;
        transition: border-color var(--d-fast) var(--ease),
                    transform var(--d-fast) var(--ease),
                    background var(--d-fast) var(--ease);
      }
      .tier-row:nth-child(even) .tier-tile {
        background: var(--surface);
      }
      .tier-tile:hover {
        border-color: var(--accent);
        transform: translateY(-1px);
      }
      .tier-tile--highlight {
        border-color: var(--accent);
        box-shadow: 0 0 0 1px var(--accent), 0 0 24px var(--accent-soft);
        background:
          linear-gradient(180deg, var(--accent-wash) 0%, transparent 100%),
          var(--surface);
      }
      .tier-tile-head {
        display: flex;
        align-items: center;
        gap: 10px;
        min-width: 0;
      }
      .tier-tile-logo {
        width: 36px;
        height: 36px;
        border-radius: 6px;
        background: var(--surface-3);
        object-fit: cover;
        flex-shrink: 0;
      }
      .tier-tile-logo--monogram {
        display: grid;
        place-items: center;
        font-family: var(--font-display);
        font-size: 16px;
        font-weight: 700;
        color: var(--fg-bright);
      }
      .tier-tile-id {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        line-height: 1.2;
      }
      .tier-tile-owner {
        font-family: var(--font-display);
        font-size: 10.5px;
        color: var(--fg-muted);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .tier-tile-name {
        font-family: var(--font-display);
        font-size: 13px;
        color: var(--fg-bright);
        font-weight: 600;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .tier-tile-stats {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 6px;
        font-family: var(--font-mono);
        font-variant-numeric: tabular-nums;
      }
      .tier-tile-score {
        font-size: 13px;
        color: var(--fg-bright);
        font-weight: 600;
        letter-spacing: 0.02em;
      }
      .tier-tile-delta {
        font-size: 11px;
        padding: 1px 6px;
        border-radius: 1px;
        font-weight: 600;
      }
      .tier-tile-delta--up {
        color: var(--up);
        background: var(--up-soft);
      }
      .tier-tile-delta--down {
        color: var(--accent);
        background: var(--accent-soft);
      }
      .tier-tile-delta--flat {
        color: var(--fg-muted);
        background: var(--surface-3);
      }

      /* ---------- Responsive ---------- */
      @media (max-width: 900px) {
        .tier-hero-title { font-size: 36px; }
        .tier-hero-stats { grid-template-columns: repeat(2, 1fr); }
        .tier-stat:nth-child(2) { border-right: none; }
        .tier-stat:nth-child(-n+2) { border-bottom: 1px solid var(--border-subtle); }
        .tier-highlight-breakdown { grid-template-columns: repeat(2, 1fr); gap: 12px 0; }
        .tier-highlight-stat:nth-child(2) { border-right: none; }
        .tier-row { flex-direction: column; }
        .tier-bezel {
          width: 100%;
          flex-direction: row;
          gap: 10px;
          padding: 8px 12px;
          border-right: none;
          border-bottom: 1px solid var(--border-subtle);
          justify-content: flex-start;
        }
        .tier-letter { font-size: 28px; }
        .tier-tile { width: 100%; }
      }
    `}</style>
  );
}
