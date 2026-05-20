// /tools/compare — multi-repo head-to-head matrix.
//
// Server Component. Parses up to 6 repos from `?repos=owner1/name1,...`,
// resolves them against the derived-repos corpus, and renders a 10-metric
// table with empty "ADD REPO" slots filling out the rest. Tier letter per
// repo is computed against the same scoring used by /tools/tier-list:
// the corpus is scored + sorted desc, top-50 sliced into cumulative
// S(5%) / A(15%) / B(35%) / C(65%) / D(100%) bands, and each selected
// repo is matched against those slices. Repos outside the top-50 get a
// null tier and render the "off-list" sublabel.
//
// Empty-state (`?repos=` absent or all entries invalid) shows four
// curated preset comparisons built from the top movers by 7d star delta.

import type { Metadata } from "next";
import Link from "next/link";

import {
  getDerivedRepos,
  getDerivedRepoByFullName,
} from "@/lib/derived-repos";
import {
  getLastFetchedAt,
  refreshTrendingFromStore,
} from "@/lib/trending";
import type { Repo } from "@/lib/types";

import { CompareHero } from "@/components/tools/compare/CompareHero";
import {
  CompareTable,
  type CompareEntry,
  type TierLetter,
} from "@/components/tools/compare/CompareTable";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Compare — TrendingRepo",
  description:
    "Side-by-side comparison of up to 6 tracked open-source repos across stars, weekly and monthly velocity, cross-source mentions, category, language, first-observed date, last commit, and live S/A/B/C/D tier.",
};

interface Props {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

const MAX_REPOS = 6;
const TIER_BUCKET_LIMIT = 50;

const TIER_DEFINITIONS: Array<{ letter: TierLetter; cumulative: number }> = [
  { letter: "S", cumulative: 0.05 },
  { letter: "A", cumulative: 0.15 },
  { letter: "B", cumulative: 0.35 },
  { letter: "C", cumulative: 0.65 },
  { letter: "D", cumulative: 1.0 },
];

function parseReposParam(
  raw: string | string[] | undefined,
): string[] {
  if (raw === undefined) return [];
  const text = Array.isArray(raw) ? raw.join(",") : raw;
  if (typeof text !== "string") return [];
  return text
    .split(",")
    .map((s) => s.trim())
    .filter(
      (s) =>
        s.length > 0 &&
        s.length <= 200 &&
        s.includes("/") &&
        // Basic shape: owner/name. Reject path segments, query, anything weird.
        /^[A-Za-z0-9._\-]+\/[A-Za-z0-9._\-]+$/.test(s),
    );
}

function dedupePreserveCase(names: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const n of names) {
    const k = n.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(n);
  }
  return out;
}

function computeScore(repo: Repo, mentions: number): number {
  const d7 = Number.isFinite(repo.starsDelta7d) ? repo.starsDelta7d : 0;
  const d24 = Number.isFinite(repo.starsDelta24h) ? repo.starsDelta24h : 0;
  const liveScore = d7 * 0.6 + d24 * 1.2 + mentions * 40;
  if (liveScore > 0) return liveScore;
  const momentum = Number.isFinite(repo.momentumScore) ? repo.momentumScore : 0;
  const stars = Number.isFinite(repo.stars) ? repo.stars : 0;
  return momentum + Math.log10(stars + 1);
}

function readMentions(repo: Repo): number {
  return (
    repo.mentions?.total7d ??
    repo.mentions?.total24h ??
    repo.mentionCount24h ??
    0
  );
}

interface TierIndex {
  byFullName: Map<string, TierLetter>;
}

/**
 * Build a fullName → TierLetter map from the full derived corpus, applying
 * the same scoring + top-50 cumulative band slicing the tier-list page uses.
 * Repos outside the top-50 are absent from the map (caller treats absence
 * as null/off-list).
 */
function buildTierIndex(repos: Repo[]): TierIndex {
  const scored = repos
    .filter((r) => r.fullName.includes("/"))
    .map((r) => ({ repo: r, score: computeScore(r, readMentions(r)) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, TIER_BUCKET_LIMIT);

  const byFullName = new Map<string, TierLetter>();
  const total = scored.length;
  let cursor = 0;
  for (let i = 0; i < TIER_DEFINITIONS.length; i += 1) {
    const def = TIER_DEFINITIONS[i];
    const isLast = i === TIER_DEFINITIONS.length - 1;
    const endIdx = isLast
      ? total
      : Math.max(cursor, Math.round(total * def.cumulative));
    for (let j = cursor; j < endIdx; j += 1) {
      byFullName.set(scored[j].repo.fullName.toLowerCase(), def.letter);
    }
    cursor = endIdx;
  }
  return { byFullName };
}

function resolveEntries(
  fullNames: string[],
  tierIndex: TierIndex,
): CompareEntry[] {
  const out: CompareEntry[] = [];
  for (const name of fullNames) {
    const repo = getDerivedRepoByFullName(name);
    if (!repo) continue;
    const mentions7d = readMentions(repo);
    const tier = tierIndex.byFullName.get(repo.fullName.toLowerCase()) ?? null;
    const has30d = repo.starsDelta30dMissing !== true;
    const has7d = repo.starsDelta7dMissing !== true;
    const delta30d = has30d
      ? repo.starsDelta30d
      : has7d
        ? repo.starsDelta7d * 4.3
        : 0;
    out.push({
      repo,
      tier,
      mentions7d,
      delta30d,
      delta30dEstimated: !has30d && has7d,
    });
  }
  return out;
}

interface CuratedPreset {
  title: string;
  repos: string[];
  rationale: string;
}

/**
 * Build four curated preset comparisons off the top-7d movers, mixing
 * 2-up and 3-up combinations so the empty state demonstrates the range of
 * the tool. Falls through gracefully when the corpus is small.
 */
function buildCuratedPresets(repos: Repo[]): CuratedPreset[] {
  const movers = [...repos]
    .filter((r) => r.fullName.includes("/"))
    .sort((a, b) => (b.starsDelta7d ?? 0) - (a.starsDelta7d ?? 0))
    .slice(0, 8);

  const presets: CuratedPreset[] = [];
  if (movers.length >= 2) {
    presets.push({
      title: "Top two movers · this week",
      repos: [movers[0].fullName, movers[1].fullName],
      rationale: "The two highest 7-day star deltas in the tracked set.",
    });
  }
  if (movers.length >= 4) {
    presets.push({
      title: "Top four · spotlight",
      repos: movers.slice(0, 4).map((r) => r.fullName),
      rationale: "Four-way matrix across the leading week-over-week climbers.",
    });
  }
  if (movers.length >= 6) {
    presets.push({
      title: "Six-way · full stack",
      repos: movers.slice(0, 6).map((r) => r.fullName),
      rationale: "Maximum 6-column matchup. Useful for category sweeps.",
    });
  }
  // Category contrast: pair a 7d-leader with a stable-mover further down.
  if (movers.length >= 6) {
    presets.push({
      title: "Leader vs. quiet killer",
      repos: [movers[0].fullName, movers[movers.length - 1].fullName],
      rationale:
        "Top mover next to a slower climber — useful for context on velocity vs. baseline.",
    });
  }
  return presets;
}

function presetHref(preset: CuratedPreset): string {
  return `/tools/compare?repos=${preset.repos
    .map((r) => encodeURIComponent(r))
    .join(",")}`;
}

export default async function ComparePage({ searchParams }: Props) {
  await refreshTrendingFromStore();

  const params = (await searchParams) ?? {};
  const requested = dedupePreserveCase(parseReposParam(params.repos)).slice(
    0,
    MAX_REPOS,
  );

  const allRepos = getDerivedRepos();
  const tierIndex = buildTierIndex(allRepos);
  const entries = resolveEntries(requested, tierIndex);

  const fetchedAt = getLastFetchedAt();
  // Selected names = the ones we successfully resolved (so remove-links
  // stay self-consistent against the rendered table).
  const selectedFullNames = entries.map((e) => e.repo.fullName);
  const hasRepos = entries.length > 0;

  const presets = hasRepos ? [] : buildCuratedPresets(allRepos);

  return (
    <div className="cmp-page">
      <ComparePageStyles />
      <CompareHero
        selectedCount={entries.length}
        maxCount={MAX_REPOS}
        fetchedAt={fetchedAt}
        hasRepos={hasRepos}
      />

      {hasRepos ? (
        <section className="cmp-table-section" aria-label="Comparison matrix">
          <CompareTable
            entries={entries}
            maxRepos={MAX_REPOS}
            selectedFullNames={selectedFullNames}
          />
        </section>
      ) : (
        <EmptyState presets={presets} />
      )}
    </div>
  );
}

function EmptyState({ presets }: { presets: CuratedPreset[] }) {
  return (
    <section className="cmp-empty" aria-label="Suggested comparisons">
      <div className="cmp-empty-eyebrow">
        <span className="cmp-empty-eyebrow-num">{"// 01"}</span>
        <span className="cmp-empty-eyebrow-title">Suggested comparisons</span>
        <span className="cmp-empty-eyebrow-sub">
          Pick a preset or pass{" "}
          <code>?repos=owner/name,owner/name</code> in the URL.
        </span>
      </div>
      <div className="cmp-empty-grid">
        {presets.length === 0 ? (
          <div className="cmp-empty-fallback">
            <div className="cmp-empty-fallback-title">
              No repos in the comparison yet
            </div>
            <div className="cmp-empty-fallback-body">
              Pass at least two <code>owner/name</code> pairs separated by
              commas, for example{" "}
              <Link
                href="/tools/compare?repos=vercel/next.js,sveltejs/svelte"
                prefetch={false}
                className="cmp-empty-link"
              >
                /tools/compare?repos=vercel/next.js,sveltejs/svelte
              </Link>
              . You can stack up to {MAX_REPOS} repos at once.
            </div>
          </div>
        ) : (
          presets.map((preset) => (
            <Link
              key={preset.title}
              href={presetHref(preset)}
              className="cmp-preset"
              prefetch={false}
            >
              <div className="cmp-preset-head">
                <span className="cmp-preset-count">
                  {String(preset.repos.length).padStart(2, "0")}
                </span>
                <span className="cmp-preset-title">{preset.title}</span>
              </div>
              <div className="cmp-preset-repos">
                {preset.repos.map((r) => (
                  <span key={r} className="cmp-preset-repo">
                    {r}
                  </span>
                ))}
              </div>
              <div className="cmp-preset-rationale">{preset.rationale}</div>
              <div className="cmp-preset-go">open comparison →</div>
            </Link>
          ))
        )}
      </div>
    </section>
  );
}

function ComparePageStyles() {
  return (
    <style>{`
      .cmp-page {
        padding: 24px 22px 64px;
        max-width: 1500px;
        margin: 0 auto;
      }

      /* ---------- Hero ---------- */
      .cmp-hero {
        position: relative;
        padding: 0 0 22px;
        border-bottom: 1px solid var(--border-subtle);
        margin-bottom: 24px;
      }
      .cmp-hero-eyebrow {
        display: flex;
        align-items: center;
        gap: 10px;
        font-family: var(--font-mono);
        font-size: 11px;
        color: var(--fg-faint);
        letter-spacing: 0.10em;
        text-transform: uppercase;
      }
      .cmp-hero-back {
        color: var(--fg-muted);
        text-decoration: none;
        transition: color var(--d-fast) var(--ease);
      }
      .cmp-hero-back:hover { color: var(--accent); }
      .cmp-hero-sep { color: var(--surface-4); }
      .cmp-hero-eyebrow-num { color: var(--accent); font-weight: 600; }
      .cmp-hero-fresh { margin-left: auto; }
      .cmp-hero-title {
        font-family: var(--font-display);
        font-size: 48px;
        line-height: 1.0;
        margin: 12px 0 8px;
        color: var(--fg-bright);
        letter-spacing: -0.02em;
        font-weight: 700;
      }
      .cmp-hero-title-accent { color: var(--accent); }
      .cmp-hero-sub {
        color: var(--fg-muted);
        font-size: 14px;
        line-height: 1.55;
        max-width: 760px;
        margin: 0 0 22px;
      }
      .cmp-hero-meta {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 0;
        border: 1px solid var(--border-subtle);
        background: var(--surface);
      }
      .cmp-hero-stat {
        padding: 14px 18px;
        border-right: 1px solid var(--border-subtle);
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .cmp-hero-stat:last-child { border-right: none; }
      .cmp-hero-stat-label {
        font-family: var(--font-mono);
        font-size: 9.5px;
        color: var(--fg-faint);
        letter-spacing: 0.10em;
        text-transform: uppercase;
      }
      .cmp-hero-stat-value {
        font-family: var(--font-mono);
        font-size: 22px;
        color: var(--fg-bright);
        font-variant-numeric: tabular-nums;
        font-weight: 500;
      }
      .cmp-hero-stat-suffix {
        font-family: var(--font-mono);
        font-size: 11px;
        color: var(--fg-muted);
        margin-left: 4px;
        font-weight: 400;
      }

      /* ---------- Table ---------- */
      .cmp-table-section { margin-top: 8px; }
      .cmp-table-wrap {
        border: 1px solid var(--border-subtle);
        background: var(--surface);
        overflow-x: auto;
      }
      .cmp-table {
        width: 100%;
        border-collapse: collapse;
        font-family: var(--font-mono);
        font-size: 12px;
      }
      .cmp-table th, .cmp-table td {
        text-align: left;
        vertical-align: top;
        border-right: 1px solid var(--border-subtle);
        border-bottom: 1px solid var(--border-subtle);
      }
      .cmp-table th:last-child, .cmp-table td:last-child { border-right: none; }
      .cmp-table tbody tr:last-child td,
      .cmp-table tbody tr:last-child th { border-bottom: none; }
      .cmp-table tbody tr:nth-child(even) td,
      .cmp-table tbody tr:nth-child(even) th { background: var(--surface-2); }

      .cmp-th { padding: 14px 14px; background: var(--surface); }
      .cmp-th-corner {
        background: var(--surface);
        border-bottom: 1px solid var(--border-subtle);
      }
      .cmp-th-corner-label {
        display: block;
        font-family: var(--font-mono);
        font-size: 10px;
        color: var(--accent);
        letter-spacing: 0.10em;
        font-weight: 600;
        text-transform: uppercase;
      }
      .cmp-th-corner-sub {
        display: block;
        font-family: var(--font-mono);
        font-size: 10px;
        color: var(--fg-faint);
        margin-top: 3px;
      }

      .cmp-th-repo { min-width: 200px; }
      .cmp-th-repo-row {
        display: flex;
        align-items: center;
        gap: 10px;
        min-width: 0;
      }
      .cmp-th-repo-logo {
        width: 36px;
        height: 36px;
        border-radius: 6px;
        background: var(--surface-3);
        object-fit: cover;
        flex-shrink: 0;
      }
      .cmp-th-repo-logo--monogram {
        display: grid;
        place-items: center;
        font-family: var(--font-display);
        font-size: 16px;
        font-weight: 700;
        color: var(--fg-bright);
      }
      .cmp-th-repo-meta {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .cmp-th-repo-name {
        text-decoration: none;
        font-family: var(--font-display);
        font-size: 13.5px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        display: flex;
        align-items: baseline;
        gap: 2px;
      }
      .cmp-th-repo-owner { color: var(--fg-muted); font-weight: 400; }
      .cmp-th-repo-slash { color: var(--surface-4); margin: 0 2px; }
      .cmp-th-repo-repo {
        color: var(--fg-bright);
        font-weight: 600;
      }
      .cmp-th-repo-tags {
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
        align-items: center;
      }
      .cmp-th-repo-stars {
        font-family: var(--font-mono);
        font-size: 10.5px;
        color: var(--accent);
        font-weight: 600;
        font-variant-numeric: tabular-nums;
      }
      .cmp-th-repo-tag {
        font-family: var(--font-mono);
        font-size: 9.5px;
        color: var(--fg-muted);
        text-transform: uppercase;
        letter-spacing: 0.08em;
        padding: 2px 6px;
        background: var(--surface-2);
        border: 1px solid var(--border-subtle);
      }
      .cmp-th-repo-foot {
        margin-top: 10px;
        display: flex;
        justify-content: flex-end;
      }
      .cmp-th-repo-remove {
        font-family: var(--font-mono);
        font-size: 10px;
        color: var(--fg-faint);
        letter-spacing: 0.08em;
        text-decoration: none;
        text-transform: uppercase;
        padding: 2px 6px;
        border: 1px solid var(--border-subtle);
        background: var(--surface-2);
        transition: color var(--d-fast) var(--ease),
                    border-color var(--d-fast) var(--ease);
      }
      .cmp-th-repo-remove:hover {
        color: var(--accent);
        border-color: var(--accent);
      }

      .cmp-th-empty {
        background: repeating-linear-gradient(
          45deg,
          var(--surface) 0,
          var(--surface) 8px,
          var(--surface-2) 8px,
          var(--surface-2) 16px
        );
        min-width: 180px;
      }
      .cmp-th-empty-body {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 5px;
        padding: 6px 0;
      }
      .cmp-th-empty-index {
        font-family: var(--font-mono);
        font-size: 9.5px;
        color: var(--fg-faint);
        letter-spacing: 0.10em;
        font-weight: 600;
      }
      .cmp-th-empty-cta {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-family: var(--font-display);
        font-size: 13px;
        color: var(--fg-bright);
        font-weight: 600;
        letter-spacing: 0.02em;
        padding: 6px 10px;
        background: var(--surface);
        border: 1px dashed var(--border);
      }
      .cmp-th-empty-plus {
        color: var(--accent);
        font-size: 14px;
        line-height: 1;
      }
      .cmp-th-empty-help {
        font-family: var(--font-mono);
        font-size: 10px;
        color: var(--fg-muted);
        text-decoration: none;
        letter-spacing: 0.04em;
      }
      .cmp-th-empty-help:hover { color: var(--accent); }
      .cmp-th-empty-hint {
        font-family: var(--font-mono);
        font-size: 9.5px;
        color: var(--fg-faint);
      }
      .cmp-th-empty-hint code,
      .cmp-empty-fallback-body code,
      .cmp-empty-eyebrow-sub code {
        font-family: var(--font-mono);
        font-size: 10px;
        color: var(--fg);
        background: var(--surface-3);
        padding: 0 4px;
        border-radius: 2px;
      }

      .cmp-row-label {
        padding: 14px 16px;
        background: var(--surface-2);
        font-family: var(--font-mono);
        text-align: left;
      }
      .cmp-row-label-main {
        display: block;
        font-size: 12.5px;
        color: var(--fg-bright);
        font-weight: 600;
        letter-spacing: 0.02em;
      }
      .cmp-row-label-sub {
        display: block;
        font-size: 9.5px;
        color: var(--fg-faint);
        letter-spacing: 0.10em;
        text-transform: uppercase;
        margin-top: 3px;
      }

      .cmp-cell {
        padding: 14px 14px;
        font-variant-numeric: tabular-nums;
        min-width: 180px;
      }
      .cmp-cell-empty {
        background: repeating-linear-gradient(
          45deg,
          var(--surface) 0,
          var(--surface) 8px,
          var(--surface-2) 8px,
          var(--surface-2) 16px
        ) !important;
        text-align: center;
      }
      .cmp-cell-empty-dash {
        font-family: var(--font-mono);
        font-size: 14px;
        color: var(--fg-faint);
      }
      .cmp-cell-body {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .cmp-cell-value {
        font-family: var(--font-mono);
        font-size: 15px;
        color: var(--fg-bright);
        font-weight: 600;
        letter-spacing: -0.005em;
      }
      .cmp-cell-value-mono { font-weight: 500; }
      .cmp-cell-sub {
        font-family: var(--font-mono);
        font-size: 10px;
        color: var(--fg-muted);
        letter-spacing: 0.04em;
      }
      .cmp-cell-est {
        font-size: 9px;
        color: var(--fg-faint);
        text-transform: uppercase;
        letter-spacing: 0.10em;
        font-weight: 400;
        margin-left: 4px;
      }

      /* ---------- Empty state ---------- */
      .cmp-empty {
        margin-top: 8px;
      }
      .cmp-empty-eyebrow {
        display: flex;
        align-items: baseline;
        gap: 12px;
        margin-bottom: 16px;
        flex-wrap: wrap;
      }
      .cmp-empty-eyebrow-num {
        font-family: var(--font-mono);
        font-size: 11px;
        color: var(--accent);
        font-weight: 600;
        letter-spacing: 0.10em;
      }
      .cmp-empty-eyebrow-title {
        font-family: var(--font-display);
        font-size: 15px;
        color: var(--fg-bright);
        font-weight: 600;
      }
      .cmp-empty-eyebrow-sub {
        font-family: var(--font-mono);
        font-size: 11px;
        color: var(--fg-muted);
        margin-left: auto;
      }
      .cmp-empty-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
      }
      .cmp-preset {
        display: flex;
        flex-direction: column;
        gap: 10px;
        padding: 18px 20px;
        background: var(--surface);
        border: 1px solid var(--border-subtle);
        text-decoration: none;
        transition: border-color var(--d-fast) var(--ease),
                    transform var(--d-fast) var(--ease);
      }
      .cmp-preset:hover {
        border-color: var(--accent);
        transform: translateY(-1px);
      }
      .cmp-preset-head {
        display: flex;
        align-items: baseline;
        gap: 10px;
      }
      .cmp-preset-count {
        font-family: var(--font-mono);
        font-size: 11px;
        color: var(--accent);
        font-weight: 700;
        letter-spacing: 0.10em;
      }
      .cmp-preset-title {
        font-family: var(--font-display);
        font-size: 15.5px;
        color: var(--fg-bright);
        font-weight: 600;
      }
      .cmp-preset-repos {
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
      }
      .cmp-preset-repo {
        font-family: var(--font-mono);
        font-size: 11px;
        color: var(--fg);
        padding: 2px 7px;
        background: var(--surface-2);
        border: 1px solid var(--border-subtle);
      }
      .cmp-preset-rationale {
        font-family: var(--font-mono);
        font-size: 11.5px;
        color: var(--fg-muted);
        line-height: 1.5;
      }
      .cmp-preset-go {
        font-family: var(--font-mono);
        font-size: 10.5px;
        color: var(--accent);
        letter-spacing: 0.06em;
        margin-top: auto;
      }
      .cmp-empty-fallback {
        grid-column: 1 / -1;
        padding: 28px 24px;
        background: var(--surface);
        border: 1px dashed var(--border);
      }
      .cmp-empty-fallback-title {
        font-family: var(--font-display);
        font-size: 16px;
        color: var(--fg-bright);
        font-weight: 600;
        margin-bottom: 6px;
      }
      .cmp-empty-fallback-body {
        font-family: var(--font-mono);
        font-size: 12px;
        color: var(--fg-muted);
        line-height: 1.6;
      }
      .cmp-empty-link {
        color: var(--accent);
        text-decoration: none;
      }
      .cmp-empty-link:hover { text-decoration: underline; }

      /* ---------- Responsive ---------- */
      @media (max-width: 900px) {
        .cmp-hero-title { font-size: 36px; }
        .cmp-hero-meta { grid-template-columns: 1fr; }
        .cmp-hero-stat { border-right: none; border-bottom: 1px solid var(--border-subtle); }
        .cmp-hero-stat:last-child { border-bottom: none; }
        .cmp-empty-grid { grid-template-columns: 1fr; }
      }
    `}</style>
  );
}
