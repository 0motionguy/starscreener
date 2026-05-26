// /tools/compare — multi-repo star-history comparison.
//
// Server Component. Layout:
//
//   1. CompareHero — sticky chrome (eyebrow / title / KPI strip).
//   2. CompareSearchPicker — paste / search for repos to add.
//   3. CompareChipSelector — chip row of selected repos + add-repo CTA.
//   4. CompareChartGallery — the same StarChart that powers /tools/star-history,
//      rendering 1-6 repos as overlaid cumulative-stars lines with the
//      13 ECharts themes + window + scale controls.
//
// Parses up to 6 repos from `?repos=owner1/name1,...`, resolves them
// against the derived-repos corpus, and hands them to the chart.
//
// Default view (`?repos=` absent or all entries invalid) opens the top
// curated comparison built from the largest 7d movers.

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

import { CompareChartGallery } from "@/components/tools/compare/CompareChartGallery";
import { CompareChipSelector } from "@/components/tools/compare/CompareChipSelector";
import { CompareHero } from "@/components/tools/compare/CompareHero";
import { CompareSearchPicker } from "@/components/tools/compare/CompareSearchPicker";
import { CompareTrayBridge } from "@/components/tools/compare/CompareTrayBridge";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Compare — TrendingRepo",
  description:
    "Side-by-side comparison of up to 6 tracked open-source repos: stars, velocity, mentions, mention matrix, normalized star-activity overlay, and a Why X over Y narrative.",
  openGraph: {
    images: [
      { url: "/api/og/tools/compare", width: 1200, height: 630 },
    ],
  },
};

interface Props {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

const MAX_REPOS = 6;

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

function resolveRepos(fullNames: string[]): Repo[] {
  const out: Repo[] = [];
  for (const name of fullNames) {
    const repo = getDerivedRepoByFullName(name);
    if (repo) out.push(repo);
  }
  return out;
}

interface CuratedPreset {
  title: string;
  repos: string[];
  rationale: string;
}

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
  const presets = buildCuratedPresets(allRepos);
  const repoList = resolveRepos(requested);

  const fetchedAt = getLastFetchedAt();
  const selectedFullNames = repoList.map((r) => r.fullName);
  const selectedIds = repoList.map((r) => r.id);
  const hasRepos = repoList.length > 0;

  return (
    <div className="cmp-page">
      <ComparePageStyles />
      <CompareTrayBridge
        selectedFullNames={selectedFullNames}
        selectedIds={selectedIds}
      />
      <CompareHero
        selectedCount={repoList.length}
        maxCount={MAX_REPOS}
        fetchedAt={fetchedAt}
        hasRepos={hasRepos}
      />

      <CompareSearchPicker
        selectedFullNames={selectedFullNames}
        maxRepos={MAX_REPOS}
        variant={hasRepos ? "compact" : "hero"}
      />

      {hasRepos ? (
        <>
          <CompareChipSelector
            repos={repoList}
            selectedFullNames={selectedFullNames}
            maxRepos={MAX_REPOS}
          />

          <CompareChartGallery repos={repoList} />
        </>
      ) : (
        <CompareFallback presets={presets} />
      )}
    </div>
  );
}

function CompareFallback({ presets }: { presets: CuratedPreset[] }) {
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
              Comparison presets are warming
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
              . You can stack up to 6 repos at once.
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

      /* ---------- Hero (unchanged from wave-1) ---------- */
      .cmp-hero {
        position: relative;
        padding: 0 0 22px;
        border-bottom: 1px solid var(--border-subtle);
        margin-bottom: 18px;
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
        flex-wrap: wrap;
      }
      .cmp-hero-back { color: var(--fg-muted); text-decoration: none; transition: color var(--motion-fast) var(--ease); }
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
        border-radius: var(--r-md);
        overflow: hidden;
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
        font-size: 10px;
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

      /* ---------- Search picker ---------- */
      .cmp-pick {
        position: relative;
        margin: 0 0 14px;
      }
      .cmp-pick.is-hero {
        margin: 8px 0 20px;
        padding: 22px 22px 18px;
        background:
          radial-gradient(120% 90% at 0% 0%, color-mix(in oklab, var(--accent) 10%, transparent) 0%, transparent 60%),
          var(--surface);
        border: 1px solid var(--border-subtle);
        border-radius: var(--r-lg);
      }
      .cmp-pick-eyebrow {
        display: flex;
        align-items: baseline;
        gap: 10px;
        margin: 0 0 10px;
        flex-wrap: wrap;
      }
      .cmp-pick-eyebrow-num {
        font-family: var(--font-mono);
        font-size: 11px;
        color: var(--accent);
        letter-spacing: 0.10em;
        font-weight: 600;
      }
      .cmp-pick-eyebrow-title {
        font-family: var(--font-display);
        font-size: 15px;
        color: var(--fg-bright);
        font-weight: 600;
      }
      .cmp-pick-eyebrow-meta {
        margin-left: auto;
        font-family: var(--font-mono);
        font-size: 10.5px;
        color: var(--fg-faint);
      }
      .cmp-pick-field {
        position: relative;
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 0 8px 0 12px;
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: var(--r-md);
        transition:
          border-color var(--motion-fast) var(--ease),
          background var(--motion-fast) var(--ease),
          box-shadow var(--motion-fast) var(--ease);
      }
      .cmp-pick.is-hero .cmp-pick-field {
        padding: 4px 8px 4px 14px;
        border-radius: var(--r-lg);
        background: var(--surface-2);
      }
      .cmp-pick-field:focus-within {
        border-color: var(--accent);
        box-shadow: 0 0 0 3px color-mix(in oklab, var(--accent) 22%, transparent);
      }
      .cmp-pick-field.is-open { border-color: var(--accent); }
      .cmp-pick-field.is-full { opacity: 0.65; }
      .cmp-pick-icon {
        display: grid;
        place-items: center;
        color: var(--fg-muted);
        flex: 0 0 auto;
      }
      .cmp-pick-input {
        flex: 1 1 auto;
        min-width: 0;
        background: transparent;
        border: 0;
        outline: none;
        color: var(--fg-bright);
        font-family: var(--font-display);
        font-size: 14.5px;
        padding: 12px 0;
        letter-spacing: -0.005em;
      }
      .cmp-pick.is-hero .cmp-pick-input {
        font-size: 17px;
        padding: 16px 0;
      }
      .cmp-pick-input::placeholder {
        color: var(--fg-faint);
        font-weight: 400;
      }
      .cmp-pick-input::-webkit-search-cancel-button { display: none; }
      .cmp-pick-clear {
        display: grid;
        place-items: center;
        width: 28px;
        height: 28px;
        background: transparent;
        border: 0;
        color: var(--fg-muted);
        border-radius: var(--r-xs);
        cursor: pointer;
        transition: all var(--motion-fast) var(--ease);
      }
      .cmp-pick-clear:hover {
        color: var(--down);
        background: var(--down-soft);
      }
      .cmp-pick-kbd {
        font-family: var(--font-mono);
        font-size: 10px;
        color: var(--fg-faint);
        padding: 3px 6px;
        background: var(--surface-3);
        border: 1px solid var(--border-subtle);
        border-radius: 4px;
        letter-spacing: 0.04em;
      }
      .cmp-pick-pop {
        position: absolute;
        z-index: 60;
        left: 0;
        right: 0;
        top: calc(100% + 6px);
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: var(--r-md);
        box-shadow: 0 12px 32px -8px rgba(0, 0, 0, 0.45);
        overflow: hidden;
      }
      .cmp-pick.is-hero .cmp-pick-pop { border-radius: var(--r-lg); }
      .cmp-pick-state {
        padding: 16px 14px;
        font-family: var(--font-mono);
        font-size: 12px;
        color: var(--fg-muted);
        text-align: center;
      }
      .cmp-pick-state-err { color: var(--down); }
      .cmp-pick-state b { color: var(--fg-bright); font-weight: 600; }
      .cmp-pick-list {
        list-style: none;
        margin: 0;
        padding: 4px;
        max-height: 360px;
        overflow-y: auto;
      }
      .cmp-pick-row {
        width: 100%;
        display: grid;
        grid-template-columns: auto 1fr auto auto auto;
        align-items: center;
        gap: 10px;
        padding: 9px 10px;
        background: transparent;
        border: 0;
        color: var(--fg-bright);
        text-align: left;
        cursor: pointer;
        border-radius: var(--r-xs);
        transition: background var(--motion-fast) var(--ease);
      }
      .cmp-pick-row.is-active {
        background: color-mix(in oklab, var(--accent) 12%, transparent);
      }
      .cmp-pick-row.is-already {
        opacity: 0.55;
        cursor: not-allowed;
      }
      .cmp-pick-row:disabled { cursor: not-allowed; }
      .cmp-pick-row-avatar {
        width: 22px; height: 22px;
        display: grid; place-items: center;
        flex: 0 0 22px;
      }
      .cmp-pick-row-mono {
        width: 22px; height: 22px;
        display: grid; place-items: center;
        background: var(--surface-3);
        color: var(--fg-faint);
        font-family: var(--font-mono);
        font-size: 9px;
        font-weight: 700;
        border-radius: 3px;
      }
      .cmp-pick-row-name {
        font-family: var(--font-mono);
        font-size: 12.5px;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .cmp-pick-row-owner { color: var(--fg-muted); }
      .cmp-pick-row-repo { color: var(--fg-bright); font-weight: 600; }
      .cmp-pick-row-lang {
        font-family: var(--font-mono);
        font-size: 10px;
        color: var(--fg-muted);
        text-transform: uppercase;
        letter-spacing: 0.08em;
        padding: 2px 6px;
        background: var(--surface-2);
        border: 1px solid var(--border-subtle);
        border-radius: var(--r-xs);
      }
      .cmp-pick-row-stars {
        font-family: var(--font-mono);
        font-size: 11px;
        color: var(--accent);
        font-variant-numeric: tabular-nums;
        font-weight: 600;
      }
      .cmp-pick-row-cta {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        font-family: var(--font-mono);
        font-size: 10.5px;
        color: var(--accent);
        text-transform: uppercase;
        letter-spacing: 0.06em;
        padding: 4px 8px;
        background: color-mix(in oklab, var(--accent) 14%, transparent);
        border-radius: var(--r-xs);
      }
      .cmp-pick-row.is-already .cmp-pick-row-cta {
        color: var(--up);
        background: var(--up-soft);
      }
      .cmp-pick-foot {
        display: flex;
        align-items: center;
        gap: 14px;
        padding: 8px 12px;
        background: var(--surface-2);
        font-family: var(--font-mono);
        font-size: 10px;
        color: var(--fg-faint);
        letter-spacing: 0.06em;
        text-transform: uppercase;
        border-top: 1px solid var(--border-subtle);
      }
      .cmp-pick-foot-right { margin-left: auto; color: var(--fg-muted); }

      /* ---------- Chip selector ---------- */
      .cmp-chip-clear-all {
        margin-left: auto;
        display: inline-flex;
        align-items: center;
        gap: 4px;
        font-family: var(--font-mono);
        font-size: 10.5px;
        color: var(--fg-muted);
        text-decoration: none;
        padding: 3px 8px;
        border-radius: var(--r-xs);
        letter-spacing: 0.06em;
        text-transform: uppercase;
        transition: all var(--motion-fast) var(--ease);
      }
      .cmp-chip-clear-all:hover {
        color: var(--down);
        background: var(--down-soft);
      }
      .cmp-chip-hint kbd {
        font-family: var(--font-mono);
        font-size: 9.5px;
        color: var(--fg);
        background: var(--surface-3);
        border: 1px solid var(--border-subtle);
        padding: 1px 5px;
        border-radius: 3px;
        margin: 0 2px;
      }

      /* button-shaped add-slot (was an anchor) keeps same styling */
      button.cmp-chip-add {
        cursor: pointer;
        font-family: var(--font-mono);
        appearance: none;
      }

      .cmp-chip-bar {
        display: flex;
        flex-direction: column;
        gap: 10px;
        padding: 12px 14px;
        background: var(--surface);
        border: 1px solid var(--border-subtle);
        border-radius: var(--r-lg);
        margin-bottom: 16px;
      }
      .cmp-chip-head {
        display: flex;
        align-items: baseline;
        gap: 10px;
      }
      .cmp-chip-eyebrow {
        font-family: var(--font-mono);
        font-size: 11px;
        color: var(--accent);
        letter-spacing: 0.10em;
        font-weight: 600;
      }
      .cmp-chip-count {
        font-family: var(--font-mono);
        font-size: 10.5px;
        color: var(--fg-faint);
      }
      .cmp-chip-count b { color: var(--fg); font-weight: 500; }
      .cmp-chip-row {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }
      .cmp-chip-pill {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 6px 8px 6px 6px;
        background: var(--surface-2);
        border: 1px solid var(--border-subtle);
        border-radius: var(--r-xs);
      }
      .cmp-chip-avatar {
        width: 18px;
        height: 18px;
        display: grid;
        place-items: center;
        flex: 0 0 18px;
      }
      .cmp-chip-mono {
        width: 18px; height: 18px;
        display: grid; place-items: center;
        background: var(--surface-3);
        color: var(--fg-faint);
        font-family: var(--font-mono);
        font-size: 8px;
        font-weight: 600;
        border-radius: var(--r-xs);
      }
      .cmp-chip-name {
        font-family: var(--font-mono);
        font-size: 11.5px;
        color: var(--fg-bright);
        text-decoration: none;
        white-space: nowrap;
        max-width: 240px;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .cmp-chip-name:hover { color: var(--accent); }
      .cmp-chip-owner { color: var(--fg-muted); }
      .cmp-chip-remove {
        display: inline-grid;
        place-items: center;
        width: 18px;
        height: 18px;
        color: var(--fg-faint);
        text-decoration: none;
        border-radius: var(--r-xs);
        transition: all var(--motion-fast) var(--ease);
      }
      .cmp-chip-remove:hover {
        color: var(--down);
        background: var(--down-soft);
      }
      .cmp-chip-add {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        padding: 6px 10px;
        background: transparent;
        border: 1px dashed var(--border);
        border-radius: var(--r-xs);
        color: var(--accent);
        font-family: var(--font-mono);
        font-size: 11px;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        text-decoration: none;
        transition: all var(--motion-fast) var(--ease);
      }
      .cmp-chip-add:hover {
        background: var(--accent-wash);
        border-color: var(--accent);
        color: var(--accent-hover);
      }
      .cmp-chip-hint {
        font-family: var(--font-mono);
        font-size: 10px;
        color: var(--fg-faint);
        letter-spacing: 0.04em;
      }
      .cmp-chip-hint code {
        background: var(--surface-3);
        padding: 0 4px;
        border-radius: 2px;
        color: var(--fg);
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
        border-radius: var(--r-lg);
        text-decoration: none;
        transition: border-color var(--motion-fast) var(--ease),
                    transform var(--motion-fast) var(--ease);
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
        border-radius: var(--r-xs);
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
        border-radius: var(--r-lg);
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
