// /tools/top-10 — TODAY's trending top 10.
//
// 2026-05-25: stripped the date-archive UI per operator call. The page now
// renders ONE thing — today's live top 10 sorted by absolute 7-day star
// gain. No date nav, no past-date snapshots, no empty-state panel. If
// historical browsing comes back later, the snapshots in Redis are still
// being written (cron-side untouched); only the UI surface was removed.

import { Top10Board } from "@/components/tools/top-10/Top10Board";
import { Top10BuilderClient } from "@/components/tools/top-10/Top10BuilderClient";
import { Top10ShareSection } from "@/components/tools/top-10/Top10ShareSection";
import { buildCustomBundleFromSlugs } from "@/lib/top10/build-custom-bundle";
import { getDerivedRepoByFullName } from "@/lib/derived-repos";
import { resolveBundle } from "@/lib/top10/resolve-bundle";
import { lastFetchedAt } from "@/lib/trending";
import { todayUtcDate } from "@/lib/top10/snapshots";
import {
  CATEGORY_META,
  TOP10_CATEGORIES,
  type Top10Bundle,
  type Top10Category,
} from "@/lib/top10/types";
import type { Repo } from "@/lib/types";

// force-dynamic so each request reads fresh live deltas from the spine.
// Was `revalidate = 600` but that caused 10-min HTML staleness vs the OG
// share card (force-dynamic): the row would say +300 while the OG preview
// rendered +130 from current data. Both surfaces must read fresh together.
export const dynamic = "force-dynamic";

interface Props {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

// Per-request metadata. Always points at the live OG card (no ?date= —
// the OG route ignores past-date requests now). `?my=` is forwarded so
// custom-list shares unfurl with the right slugs.
export async function generateMetadata({ searchParams }: Props) {
  const params = (await searchParams) ?? {};
  const activeCategory = resolveCategoryParam(params.cat);
  const myParam = typeof params.my === "string" ? params.my : null;
  const ogQuery = new URLSearchParams({
    cat: activeCategory,
    aspect: "h",
    theme: "dark",
  });
  if (myParam) ogQuery.set("my", myParam);
  const ogUrl = `/api/og/top10?${ogQuery.toString()}`;
  return {
    title: "Top 10 — TrendingRepo",
    description:
      "Today's 10 trending GitHub repos, ranked by absolute 7-day star gain. Build your own list and share it on X.",
    alternates: { canonical: "/tools/top-10" },
    openGraph: {
      images: [{ url: ogUrl, width: 1200, height: 675 }],
    },
    twitter: {
      card: "summary_large_image" as const,
      images: [ogUrl],
    },
  };
}

// ---- Helpers ---------------------------------------------------------------

function resolveCategoryParam(
  raw: string | string[] | undefined,
): Top10Category {
  if (typeof raw !== "string") return "repos";
  const lower = raw.toLowerCase() as Top10Category;
  return (TOP10_CATEGORIES as readonly string[]).includes(lower)
    ? lower
    : "repos";
}

// Compose a rich multi-line tweet body listing all 10 repos with a short
// description and a github.com/<slug> URL — pattern lifted from the
// AI-Twitter "今週のリポジトリ10選" tweets the user pointed at. The
// twitter intent URL accepts long text; X Premium users post directly,
// non-Premium users can trim or post just the canonical URL (still
// pre-loaded above the body by buildShareToXUrl).
function buildTop10ShareText({
  items,
  reposBySlug,
  dateLabel,
  isCustom,
}: {
  items: Array<{ rank: number; slug: string; description?: string | null }>;
  reposBySlug: Map<string, Repo>;
  dateLabel: string;
  isCustom: boolean;
}): string {
  const lines: string[] = [];
  lines.push(
    isCustom
      ? "My Top 10 trending GitHub repos:"
      : `The 10 trending GitHub repos for ${dateLabel}:`,
  );
  lines.push("");

  for (const item of items.slice(0, 10)) {
    const repo = reposBySlug.get(item.slug.toLowerCase());
    const rawDesc = (repo?.description ?? item.description ?? "").trim();
    const desc =
      rawDesc && rawDesc !== "—"
        ? rawDesc.length > 90
          ? `${rawDesc.slice(0, 87).trimEnd()}…`
          : rawDesc
        : null;

    lines.push(`${item.rank}. ${item.slug}`);
    if (desc) lines.push(desc);
    lines.push(`github.com/${item.slug}`);
    lines.push("");
  }

  // Trim the trailing blank line — buildShareToXUrl already inserts spacing
  // around the body, hashtags, and via-handle.
  return lines.join("\n").trim();
}

// ---- Page ------------------------------------------------------------------

export default async function Top10ArchivePage({ searchParams }: Props) {
  const today = todayUtcDate();
  const params = (await searchParams) ?? {};
  const activeCategory = resolveCategoryParam(params.cat);

  // `?my=slug1,slug2,…` lets a user share their own composed top 10. When
  // present, the main board renders THAT list (order preserved) instead of
  // the live bundle. Misses (typos, deleted repos) are silently dropped.
  const myParam = typeof params.my === "string" ? params.my : null;
  const mySlugs = myParam
    ? myParam
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 10)
    : [];

  // Two paths only: custom (?my=) OR today's live ranking. No more date
  // archive — past dates were misleading without per-day baked data.
  const active: Top10Bundle =
    mySlugs.length > 0
      ? buildCustomBundleFromSlugs(mySlugs, "7d")
      : await resolveBundle(
          activeCategory,
          CATEGORY_META[activeCategory].defaultWindow,
        );

  // Build the live-Repo lookup for the active board.
  const reposBySlug = new Map<string, Repo>();
  for (const item of active.items) {
    try {
      const repo = getDerivedRepoByFullName(item.slug);
      if (repo) reposBySlug.set(item.slug.toLowerCase(), repo);
    } catch {
      // Derived spine missing on cold Lambda — row falls back to snapshot.
    }
  }

  const pagePath =
    mySlugs.length > 0
      ? `/tools/top-10?my=${encodeURIComponent(mySlugs.join(","))}`
      : `/tools/top-10`;
  const shareText = buildTop10ShareText({
    items: active.items,
    reposBySlug,
    dateLabel: today,
    isCustom: mySlugs.length > 0,
  });

  return (
    <div
      className="t10-page"
      style={{ padding: "24px 22px 32px", maxWidth: 1500, margin: "0 auto" }}
    >
      <Top10PageStyles />

      <header className="t10-hero">
        <p className="t10-hero-eyebrow">
          <span className="slash">{"//"}</span> trendingrepo · top 10
        </p>
        <h1 className="t10-hero-title">
          {mySlugs.length > 0
            ? "Your Top 10 GitHub repos"
            : "Today's Top 10 trending GitHub repos"}
        </h1>
        <p className="t10-hero-sub">
          {mySlugs.length > 0
            ? "Composed list — share the link, the receiver sees the same 10."
            : "Ranked by absolute 7-day star gain. Live data, refreshed every cron pass."}
        </p>
      </header>

      {activeCategory !== "repos" ? (
        <div className="t10-cat-banner" role="status" aria-live="polite">
          <span className="t10-cat-banner-eyebrow">
            <span className="slash">{"//"}</span> Viewing
          </span>
          <span className="t10-cat-banner-title">
            Top 10 · {CATEGORY_META[activeCategory].label}
          </span>
          <span className="t10-cat-banner-blurb">
            {CATEGORY_META[activeCategory].blurb}
          </span>
          <a href={`/tools/top-10`} className="t10-cat-banner-reset">
            ← Back to Repos
          </a>
        </div>
      ) : null}

      <div className="t10-layout">
        <div className="t10-layout-main">
          <Top10Board
            bundle={active}
            reposBySlug={reposBySlug}
            lastUpdatedAt={lastFetchedAt}
          />
        </div>
        <div className="t10-layout-side">
          <Top10ShareSection
            activeDate={today}
            category={activeCategory}
            pagePath={pagePath}
            shareText={shareText}
          />
        </div>
      </div>

      <Top10BuilderClient initialSlugs={mySlugs} />
    </div>
  );
}

// ---- Local styles ----------------------------------------------------------

function Top10PageStyles() {
  return (
    <style>{`
      .t10-page { color: var(--fg); }

      /* ---- Two-column layout: board + share rail ---- */
      .t10-layout {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 360px;
        gap: 22px;
        align-items: start;
      }
      .t10-layout-main { min-width: 0; }
      .t10-layout-side {
        position: sticky;
        top: calc(var(--topbar-h, 56px) + 16px);
        align-self: start;
      }
      @media (max-width: 1280px) {
        .t10-layout { grid-template-columns: minmax(0, 1fr) 320px; gap: 18px; }
      }
      @media (max-width: 1100px) {
        .t10-layout { grid-template-columns: 1fr; }
        .t10-layout-side { position: static; }
      }

      /* ---- Hero ---- */
      .t10-hero { padding: 8px 0 18px; }
      .t10-hero-row {
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 18px;
        align-items: end;
      }
      .t10-eyebrow {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        font-family: var(--font-mono);
        font-size: 10.5px;
        letter-spacing: 0.10em;
        text-transform: uppercase;
        margin-bottom: 6px;
      }
      .t10-eyebrow-tag {
        background: var(--accent);
        color: var(--bg);
        padding: 2px 7px;
        border-radius: 1px;
        font-weight: 700;
      }
      .t10-eyebrow-sub { color: var(--fg-faint); }
      .t10-title {
        font-size: 26px;
        line-height: 1.15;
        color: var(--fg-bright);
        font-weight: 500;
        margin: 0;
        letter-spacing: -0.01em;
      }

      .t10-nav {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .t10-arrow {
        display: inline-grid;
        place-items: center;
        width: 30px;
        height: 30px;
        background: var(--surface);
        border: 1px solid var(--border-subtle);
        border-radius: 1px;
        color: var(--fg);
        font-family: var(--font-mono);
        font-size: 14px;
        text-decoration: none;
        transition: all var(--d-fast) var(--ease);
        user-select: none;
      }
      .t10-arrow:hover { background: var(--surface-3); color: var(--fg-bright); border-color: var(--border); }
      .t10-arrow-off { color: var(--fg-faint); opacity: 0.4; cursor: not-allowed; }
      .t10-date {
        font-size: 22px;
        color: var(--fg-bright);
        font-variant-numeric: tabular-nums;
        letter-spacing: 0.02em;
        padding: 0 4px;
      }
      .t10-jump-today {
        margin-left: 8px;
        font-family: var(--font-mono);
        font-size: 10.5px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--accent);
        text-decoration: none;
        padding: 4px 8px;
        border: 1px solid var(--accent-border, var(--border));
        border-radius: 1px;
        transition: all var(--d-fast) var(--ease);
      }
      .t10-jump-today:hover { background: var(--accent-soft, var(--surface-3)); }

      /* ---- 7-day pill strip ---- */
      .t10-pills {
        display: grid;
        grid-template-columns: repeat(7, minmax(0, 1fr));
        gap: 6px;
        margin: 14px 0 22px;
      }
      .t10-pill {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 2px;
        padding: 10px 6px;
        background: var(--surface);
        border: 1px solid var(--border-subtle);
        border-radius: 1px;
        text-decoration: none;
        color: var(--fg-muted);
        transition: all var(--d-fast) var(--ease);
      }
      .t10-pill:hover { background: var(--surface-3); color: var(--fg-bright); border-color: var(--border); }
      .t10-pill.on {
        background: var(--accent-soft, var(--surface-3));
        border-color: var(--accent);
        color: var(--fg-bright);
      }
      .t10-pill.today .t10-pill-day { color: var(--accent); }
      .t10-pill.empty { opacity: 0.55; }
      .t10-pill-day {
        font-family: var(--font-mono);
        font-size: 10.5px;
        letter-spacing: 0.08em;
        font-weight: 600;
      }
      .t10-pill-iso {
        font-family: var(--font-mono);
        font-size: 10px;
        color: var(--fg-faint);
        font-variant-numeric: tabular-nums;
      }
      .t10-pill.on .t10-pill-iso { color: var(--fg); }

      /* ---- Board ---- */
      .t10-board { display: flex; flex-direction: column; gap: 22px; }
      .t10-rows {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 1px;
        background: var(--border-subtle);
        border: 1px solid var(--border-subtle);
        border-radius: var(--r-md);
        overflow: hidden;
      }
      .t10-row,
      .t10-row-head {
        display: grid;
        grid-template-columns:
          44px 36px minmax(0, 1.4fr)
          78px 78px 100px
          130px minmax(180px, 1fr);
        align-items: center;
        gap: 14px;
        padding: 10px 16px;
        background: var(--surface);
        transition: background var(--d-fast) var(--ease);
      }
      .t10-row-head {
        padding: 8px 16px;
        background: var(--surface-2);
      }
      .t10-row-head span {
        font-family: var(--font-mono);
        font-size: 10px;
        letter-spacing: 0.15em;
        text-transform: uppercase;
        color: var(--fg-faint);
      }
      .t10-row-head .t10-h-d24,
      .t10-row-head .t10-h-d7d,
      .t10-row-head .t10-h-stars {
        text-align: right;
      }
      .t10-row-head .t10-h-mentions { text-align: left; }
      .t10-row:hover { background: var(--surface-2); }
      .t10-row.top3 {
        background: linear-gradient(to right, var(--accent-wash) 0%, var(--surface) 22%);
        box-shadow: inset 2px 0 0 var(--accent);
      }

      .t10-rank {
        display: flex;
        align-items: baseline;
        justify-content: flex-start;
      }
      .t10-rank-num {
        font-family: var(--font-mono);
        font-size: 22px;
        font-variant-numeric: tabular-nums;
        font-weight: 600;
        color: var(--fg-faint);
        letter-spacing: -0.02em;
      }
      .t10-row.top3 .t10-rank-num { color: var(--accent); font-size: 26px; }

      /* Hide the "live on X" suffix inside MentionCell on this surface — the
         row already shows source pips + count, the verbal label is noise. */
      .t10-row .ms-top { display: none; }

      .t10-avatar { width: 32px; height: 32px; display: grid; place-items: center; }
      .t10-logo {
        width: 32px;
        height: 32px;
        border-radius: 1px;
        object-fit: cover;
        background: var(--surface-3);
      }
      .t10-logo-fallback {
        width: 32px;
        height: 32px;
        border-radius: 1px;
        display: grid;
        place-items: center;
        font-family: var(--font-mono);
        font-size: 14px;
        font-weight: 700;
        color: var(--bg);
      }

      .t10-id { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
      .t10-id-top {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        min-width: 0;
        max-width: 100%;
      }
      .t10-id-link {
        text-decoration: none;
        color: inherit;
        font-family: var(--font-mono);
        font-size: 13px;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .t10-id-link:hover .t10-name { color: var(--accent); }
      .t10-owner { color: var(--fg-muted); }
      .t10-slash { color: var(--fg-faint); padding: 0 2px; }
      .t10-name { color: var(--fg-bright); font-weight: 500; }

      /* ---- Sparkline column ---- */
      .t10-spark-cell {
        display: flex;
        align-items: center;
        justify-content: center;
        height: 22px;
        min-width: 70px;
      }
      .t10-spark-cell .spark {
        height: 22px;
        width: 100%;
        max-width: 90px;
      }
      .t10-spark-empty {
        color: var(--fg-faint);
        font-family: var(--font-mono);
        font-size: 14px;
        opacity: 0.5;
      }

      /* Per-row delta cells (24h + 7d) — naked numbers, right-aligned to
         match the header labels. Color inherits from .t10-delta-* tags. */
      .t10-d24,
      .t10-d7d {
        font-family: var(--font-mono);
        font-size: 13px;
        font-variant-numeric: tabular-nums;
        text-align: right;
        white-space: nowrap;
      }

      .t10-stars { display: flex; align-items: center; gap: 6px; justify-content: flex-end; }
      .t10-star-icon { color: var(--accent); }
      .t10-stars-num {
        font-family: var(--font-mono);
        font-size: 13px;
        color: var(--fg-bright);
        font-variant-numeric: tabular-nums;
      }
      .t10-delta {
        font-family: var(--font-mono);
        font-size: 10.5px;
        font-variant-numeric: tabular-nums;
      }
      .t10-delta-up { color: var(--up); }
      .t10-delta-down { color: var(--down); }
      .t10-delta-flat { color: var(--fg-faint); }
      .t10-delta-unknown { color: var(--fg-faint); opacity: 0.6; }

      .t10-mentions { min-width: 0; overflow: hidden; }
      .t10-mentions-empty { font-family: var(--font-mono); font-size: 11px; color: var(--fg-faint); }

      /* ---- Live OG image preview (theme + size driven) ---- */
      .t10-og-preview {
        width: 100%;
        background: var(--surface-2);
        border: 1px solid var(--border-subtle);
        border-radius: var(--r-md);
        overflow: hidden;
        position: relative;
      }
      .t10-og-preview img {
        display: block;
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      /* ---- Stats area: TOP 1 hero + side stats ---- */
      .t10-stats-grid {
        display: grid;
        grid-template-columns: minmax(0, 1.7fr) minmax(240px, 1fr);
        gap: 14px;
        margin-top: 16px;
      }
      .t10-stats-side {
        display: grid;
        grid-template-rows: repeat(2, 1fr);
        gap: 1px;
        background: var(--border-subtle);
        border: 1px solid var(--border-subtle);
        border-radius: var(--r-md);
        overflow: hidden;
        margin: 0;
      }

      .t10-champion {
        background:
          radial-gradient(120% 140% at 0% 0%, var(--accent-wash) 0%, transparent 55%),
          var(--surface);
        border: 1px solid var(--accent-border, var(--border));
        border-radius: var(--r-md);
        padding: 22px 24px;
        display: flex;
        flex-direction: column;
        gap: 16px;
        position: relative;
        box-shadow: inset 3px 0 0 var(--accent);
      }
      .t10-champion-eyebrow {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        font-family: var(--font-mono);
        font-size: 11px;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: var(--fg-faint);
      }
      .t10-champion-badge {
        background: var(--accent);
        color: var(--bg);
        font-weight: 700;
        padding: 3px 8px;
        border-radius: 2px;
        letter-spacing: 0.1em;
      }
      .t10-champion-label .slash { color: var(--accent); margin-right: 4px; }

      .t10-champion-body {
        display: grid;
        grid-template-columns: 64px minmax(0, 1fr) auto;
        gap: 18px;
        align-items: center;
        text-decoration: none;
        color: inherit;
      }
      .t10-champion-body:hover .t10-champion-repo { color: var(--accent); }

      .t10-champion-avatar {
        width: 64px;
        height: 64px;
        border-radius: 4px;
        display: grid;
        place-items: center;
        overflow: hidden;
        background: var(--surface-3);
      }
      .t10-champion-logo {
        width: 64px;
        height: 64px;
        object-fit: cover;
        border-radius: 4px;
        display: block;
      }
      .t10-champion-letter {
        font-family: var(--font-mono);
        font-size: 28px;
        font-weight: 700;
        color: var(--bg);
      }
      .t10-champion-text {
        display: flex;
        flex-direction: column;
        gap: 6px;
        min-width: 0;
      }
      .t10-champion-name {
        font-family: var(--font-mono);
        font-size: 22px;
        line-height: 1.15;
        font-weight: 500;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .t10-champion-owner { color: var(--fg-muted); }
      .t10-champion-slash { color: var(--fg-faint); padding: 0 4px; }
      .t10-champion-repo { color: var(--fg-bright); font-weight: 600; }
      .t10-champion-desc {
        font-size: 13px;
        color: var(--fg-muted);
        line-height: 1.5;
        max-width: 60ch;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }
      .t10-champion-numbers {
        display: flex;
        align-items: baseline;
        gap: 14px;
        flex-wrap: wrap;
        font-family: var(--font-mono);
      }
      .t10-champion-stars {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: 17px;
        color: var(--fg-bright);
        font-weight: 600;
        font-variant-numeric: tabular-nums;
      }
      .t10-champion-star-icon { color: var(--accent); }
      .t10-champion-delta {
        font-size: 15px;
        font-variant-numeric: tabular-nums;
      }
      .t10-champion-delta.dim {
        font-size: 12.5px;
        opacity: 0.75;
      }
      .t10-champion-delta-unit {
        font-size: 10.5px;
        color: var(--fg-faint);
        letter-spacing: 0.06em;
        text-transform: uppercase;
        margin-left: 2px;
      }
      .t10-champion-spark {
        display: flex;
        align-items: center;
        width: 140px;
        height: 48px;
      }
      .t10-champion-spark .spark {
        width: 100%;
        height: 100%;
      }

      @media (max-width: 1100px) {
        .t10-stats-grid {
          grid-template-columns: 1fr;
        }
        .t10-stats-side {
          grid-template-rows: none;
          grid-template-columns: repeat(2, 1fr);
        }
        .t10-champion-body {
          grid-template-columns: 56px minmax(0, 1fr);
        }
        .t10-champion-spark { display: none; }
      }

      .t10-meta-cell {
        background: var(--surface);
        padding: 12px 14px;
        display: flex;
        flex-direction: column;
        gap: 3px;
      }
      .t10-meta-cell dt {
        font-family: var(--font-mono);
        font-size: 9.5px;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: var(--fg-faint);
        margin: 0;
        font-weight: 500;
      }
      .t10-meta-cell dd {
        font-family: var(--font-mono);
        font-size: 17px;
        color: var(--fg-bright);
        font-variant-numeric: tabular-nums;
        margin: 0;
        font-weight: 500;
        letter-spacing: -0.01em;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .t10-meta-cell dd.hot { color: var(--heat-explosive, var(--accent)); }
      .t10-meta-cell dd.cold { color: var(--fg-faint); }
      .t10-meta-cell .sub {
        font-family: var(--font-mono);
        font-size: 10px;
        color: var(--fg-subtle);
        margin-top: 1px;
        letter-spacing: 0.06em;
      }
      /* Freshness cell — color the value by tone so a stale pipeline is
         visually loud. live=green, warm=brand, cold=faint. */
      .t10-meta-fresh.tone-live dd { color: var(--up, #22c55e); }
      .t10-meta-fresh.tone-warn dd { color: var(--accent); }
      .t10-meta-fresh.tone-cold dd { color: var(--fg-faint); }

      /* ---- Page hero (replaces the old date nav) ---- */
      .t10-hero {
        display: flex;
        flex-direction: column;
        gap: 4px;
        padding-bottom: 18px;
        margin-bottom: 20px;
        border-bottom: 1px solid var(--border-subtle);
      }
      .t10-hero-eyebrow {
        margin: 0;
        font-family: var(--font-mono);
        font-size: 11px;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: var(--fg-faint);
      }
      .t10-hero-eyebrow .slash {
        color: var(--accent);
        margin-right: 6px;
      }
      .t10-hero-title {
        margin: 0;
        font-family: var(--font-mono);
        font-size: 24px;
        line-height: 1.25;
        color: var(--fg-bright);
        font-weight: 500;
        letter-spacing: -0.01em;
      }
      .t10-hero-sub {
        margin: 0;
        font-size: 13px;
        color: var(--fg-muted);
        line-height: 1.55;
      }

      /* ---- Empty state ---- */
      .t10-empty {
        background: var(--surface);
        border: 1px solid var(--border-subtle);
        padding: 32px 22px;
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 8px;
      }
      .t10-empty-head {
        font-family: var(--font-mono);
        font-size: 16px;
        color: var(--fg-bright);
        margin: 0;
      }
      .t10-empty-sub { font-size: 13px; color: var(--fg-muted); margin: 0; max-width: 56ch; line-height: 1.5; }
      .t10-empty-cta {
        margin-top: 8px;
        font-family: var(--font-mono);
        font-size: 11px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--accent);
        text-decoration: none;
        padding: 6px 10px;
        border: 1px solid var(--accent-border, var(--border));
        border-radius: 1px;
      }
      .t10-empty-cta:hover { background: var(--accent-soft, var(--surface-3)); }

      @media (max-width: 1280px) {
        .t10-row,
        .t10-row-head {
          grid-template-columns:
            44px 36px minmax(0, 1fr)
            70px 70px 90px
            minmax(140px, 1fr);
          gap: 10px;
        }
        .t10-row .t10-spark-cell,
        .t10-row-head .t10-h-spark { display: none; }
      }
      @media (max-width: 1100px) {
        .t10-hero-row { grid-template-columns: 1fr; }
        .t10-row,
        .t10-row-head {
          grid-template-columns: 44px 32px minmax(0, 1fr) 64px 90px;
          gap: 10px;
        }
        .t10-row .t10-d24,
        .t10-row .t10-spark-cell,
        .t10-row .t10-mentions,
        .t10-row-head .t10-h-d24,
        .t10-row-head .t10-h-spark,
        .t10-row-head .t10-h-mentions { display: none; }
        .t10-meta { grid-template-columns: repeat(2, 1fr); }
      }

      /* ---- Active-category banner (?cat=…) ---- */
      .t10-cat-banner {
        display: grid;
        grid-template-columns: auto 1fr auto;
        align-items: baseline;
        gap: 14px;
        padding: 12px 16px;
        margin: 0 0 14px;
        background:
          linear-gradient(90deg, var(--accent-wash) 0%, transparent 60%),
          var(--surface);
        border: 1px solid var(--accent-line, rgba(255, 107, 53, 0.32));
        border-radius: var(--r-md);
      }
      .t10-cat-banner-eyebrow {
        font-family: var(--font-mono);
        font-size: 10px;
        letter-spacing: var(--t-control);
        text-transform: uppercase;
        color: var(--fg-faint);
      }
      .t10-cat-banner-eyebrow .slash { color: var(--accent); margin-right: 4px; }
      .t10-cat-banner-title {
        font-family: var(--font-mono);
        font-size: 13px;
        color: var(--fg-bright);
        font-weight: 600;
        letter-spacing: -0.005em;
      }
      .t10-cat-banner-blurb {
        font-size: 12px;
        color: var(--fg-muted);
        grid-column: 2;
        grid-row: 2;
        line-height: 1.45;
      }
      .t10-cat-banner-reset {
        font-family: var(--font-mono);
        font-size: 11px;
        letter-spacing: var(--t-data);
        text-transform: uppercase;
        color: var(--accent);
        text-decoration: none;
        padding: 4px 10px;
        border: 1px solid var(--accent-line, rgba(255, 107, 53, 0.32));
        border-radius: var(--r-sm);
        transition: background var(--motion-fast) var(--ease);
      }
      .t10-cat-banner-reset:hover { background: var(--accent-wash); }

      /* ---- Builder (replaces sub-boards): compose your own top 10 ---- */
      .t10-builder {
        margin-top: 32px;
        padding: 22px 22px 18px;
        border: 1px solid var(--border-subtle);
        border-radius: var(--r-md);
        background: var(--surface);
        display: flex;
        flex-direction: column;
        gap: 16px;
        position: relative;
      }
      .t10-builder-head { display: flex; flex-direction: column; gap: 4px; }
      .t10-builder-title {
        margin: 0;
        font-family: var(--font-mono);
        font-size: 14px;
        letter-spacing: var(--t-control);
        text-transform: uppercase;
        color: var(--fg-bright);
        font-weight: 500;
      }
      .t10-builder-title .slash { color: var(--accent); margin-right: 6px; }
      .t10-builder-sub {
        margin: 0;
        font-size: 12.5px;
        color: var(--fg-muted);
        line-height: 1.55;
        max-width: 64ch;
      }

      .t10-builder-search { position: relative; }
      .t10-builder-input { display: flex; align-items: center; gap: 8px; }
      .t10-builder-input input {
        flex: 1;
        background: transparent;
        border: none;
        outline: none;
        color: var(--fg-bright);
        font-family: var(--font-mono);
        font-size: 13px;
        padding: 6px 0;
      }
      .t10-builder-input input:disabled { color: var(--fg-faint); cursor: not-allowed; }
      .t10-builder-kbd {
        font-family: var(--font-mono);
        font-size: 10.5px;
        color: var(--fg-faint);
        letter-spacing: 0.08em;
        text-transform: uppercase;
        padding: 3px 6px;
        border: 1px solid var(--border-subtle);
        border-radius: 1px;
      }
      .t10-builder-clear {
        background: transparent;
        border: none;
        color: var(--fg-faint);
        cursor: pointer;
        padding: 4px;
        display: grid;
        place-items: center;
      }
      .t10-builder-clear:hover { color: var(--fg-bright); }

      .t10-builder-results {
        position: absolute;
        top: calc(100% + 4px);
        left: 0;
        right: 0;
        z-index: 5;
        background: var(--surface-2);
        border: 1px solid var(--border-subtle);
        border-radius: var(--r-sm);
        max-height: 320px;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
      }
      .t10-builder-empty {
        padding: 14px 16px;
        font-family: var(--font-mono);
        font-size: 12px;
        color: var(--fg-faint);
      }
      .t10-builder-result {
        all: unset;
        display: grid;
        grid-template-columns: 24px 1fr auto;
        align-items: center;
        gap: 10px;
        padding: 8px 12px;
        cursor: pointer;
        border-bottom: 1px solid var(--border-subtle);
        font-family: var(--font-mono);
        font-size: 13px;
        color: var(--fg);
      }
      .t10-builder-result:last-child { border-bottom: none; }
      .t10-builder-result:hover:not(:disabled) {
        background: var(--surface-3);
        color: var(--fg-bright);
      }
      .t10-builder-result:disabled { opacity: 0.5; cursor: not-allowed; }
      .t10-builder-result-avatar {
        width: 24px;
        height: 24px;
        border-radius: 2px;
        background: var(--surface-3);
        object-fit: cover;
      }
      .t10-builder-result-avatar.fallback { background: var(--surface-3); }
      .t10-builder-result-name { font-weight: 500; }
      .t10-builder-result-meta {
        color: var(--fg-faint);
        font-size: 11.5px;
        font-variant-numeric: tabular-nums;
      }

      .t10-builder-slots {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 1px;
        background: var(--border-subtle);
        border: 1px solid var(--border-subtle);
        border-radius: var(--r-md);
        overflow: hidden;
      }
      .t10-builder-slot {
        display: grid;
        grid-template-columns: 36px 24px minmax(0, 1fr) auto;
        align-items: center;
        gap: 12px;
        padding: 10px 14px;
        background: var(--surface);
      }
      .t10-builder-slot.empty { background: var(--surface); }
      .t10-builder-slot.top3 {
        background: linear-gradient(to right, var(--accent-wash) 0%, var(--surface) 22%);
        box-shadow: inset 2px 0 0 var(--accent);
      }
      .t10-builder-slot-rank {
        font-family: var(--font-mono);
        font-size: 16px;
        font-weight: 600;
        color: var(--fg-faint);
        font-variant-numeric: tabular-nums;
      }
      .t10-builder-slot.top3 .t10-builder-slot-rank { color: var(--accent); }
      .t10-builder-slot-placeholder {
        font-family: var(--font-mono);
        font-size: 12px;
        color: var(--fg-faint);
        grid-column: 3 / -1;
        opacity: 0.6;
      }
      .t10-builder-slot-avatar {
        width: 24px;
        height: 24px;
        border-radius: 2px;
        object-fit: cover;
        background: var(--surface-3);
      }
      .t10-builder-slot-avatar.fallback { background: var(--surface-3); }
      .t10-builder-slot-name {
        font-family: var(--font-mono);
        font-size: 13px;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .t10-builder-slot-owner { color: var(--fg-muted); }
      .t10-builder-slot-slash { color: var(--fg-faint); padding: 0 4px; }
      .t10-builder-slot-repo { color: var(--fg-bright); font-weight: 500; }
      .t10-builder-slot-actions { display: flex; gap: 4px; align-items: center; }
      .t10-builder-slot-btn {
        background: transparent;
        border: 1px solid var(--border-subtle);
        color: var(--fg-faint);
        font-family: var(--font-mono);
        font-size: 13px;
        line-height: 1;
        width: 24px;
        height: 24px;
        cursor: pointer;
        border-radius: 1px;
        display: grid;
        place-items: center;
      }
      .t10-builder-slot-btn:hover:not(:disabled) {
        color: var(--fg-bright);
        border-color: var(--border);
      }
      .t10-builder-slot-btn:disabled { opacity: 0.3; cursor: not-allowed; }
      .t10-builder-slot-remove:hover:not(:disabled) {
        color: var(--accent);
        border-color: var(--accent);
      }

      .t10-builder-actions {
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: 12px;
        padding-top: 4px;
      }
      .t10-builder-count {
        font-family: var(--font-mono);
        font-size: 11px;
        color: var(--fg-faint);
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }
      .t10-builder-buttons { display: flex; gap: 8px; flex-wrap: wrap; }
      .t10-builder-btn {
        font-family: var(--font-mono);
        font-size: 12px;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        padding: 8px 14px;
        border: 1px solid var(--border);
        background: transparent;
        color: var(--fg);
        cursor: pointer;
        border-radius: 1px;
      }
      .t10-builder-btn:hover:not(:disabled) {
        background: var(--surface-2);
        color: var(--fg-bright);
      }
      .t10-builder-btn.ghost { color: var(--fg-faint); }
      .t10-builder-btn.primary {
        background: var(--accent);
        color: var(--bg);
        border-color: var(--accent);
      }
      .t10-builder-btn.primary:hover:not(:disabled) {
        background: var(--accent);
        color: var(--bg);
        filter: brightness(1.1);
      }
      .t10-builder-btn:disabled { opacity: 0.4; cursor: not-allowed; }

      /* ---- More leaderboards section ---- */
      .t10-more {
        margin-top: 32px;
        padding-top: 22px;
        border-top: 1px solid var(--border-subtle);
      }
      .t10-more-head {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: 8px;
        margin: 0 0 14px;
      }
      .t10-more-title {
        font-family: var(--font-mono);
        font-size: 13px;
        letter-spacing: var(--t-control);
        text-transform: uppercase;
        color: var(--fg-bright);
        font-weight: 500;
        margin: 0;
      }
      .t10-more-title .slash { color: var(--accent); margin-right: 6px; }
      .t10-more-sub {
        margin: 0;
        font-size: 12px;
        color: var(--fg-subtle);
        max-width: 56ch;
        line-height: 1.5;
      }

      /* ---- Sub-leaderboard grid (2x3) ---- */
      .t10-subgrid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 14px;
      }
      @media (max-width: 1200px) {
        .t10-subgrid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      }
      @media (max-width: 720px) {
        .t10-subgrid { grid-template-columns: 1fr; }
      }
      .t10-subcard {
        background: var(--surface);
        border: 1px solid var(--border-subtle);
        border-radius: var(--r-md);
        display: flex;
        flex-direction: column;
        transition: border-color var(--motion-fast) var(--ease);
      }
      .t10-subcard:hover { border-color: var(--border); }
      .t10-subhead {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 8px;
        padding: 10px 14px;
        border-bottom: 1px solid var(--border-subtle);
        background: var(--shell);
      }
      .t10-subtitle {
        font-family: var(--font-mono);
        font-size: 10.5px;
        letter-spacing: var(--t-control);
        text-transform: uppercase;
        color: var(--fg);
        margin: 0;
        font-weight: 500;
      }
      .t10-subtitle .slash { color: var(--accent); margin-right: 4px; }
      .t10-subwindow {
        font-family: var(--font-mono);
        font-size: 10px;
        color: var(--fg-faint);
        letter-spacing: var(--t-data);
        text-transform: uppercase;
        font-variant-numeric: tabular-nums;
      }
      .t10-sublist {
        list-style: none;
        margin: 0;
        padding: 0;
        flex: 1;
      }
      .t10-subrow {
        border-bottom: 1px solid var(--border-subtle);
      }
      .t10-subrow:last-child { border-bottom: none; }
      .t10-subrow-link {
        display: grid;
        grid-template-columns: 26px minmax(0, 1fr) auto;
        gap: 10px;
        padding: 8px 14px;
        align-items: center;
        text-decoration: none;
        color: var(--fg);
        transition: background var(--motion-fast) var(--ease);
      }
      .t10-subrow-link:hover {
        background: var(--surface-2);
        box-shadow: inset 2px 0 0 var(--accent);
      }
      .t10-subrank {
        font-family: var(--font-mono);
        font-variant-numeric: tabular-nums;
        font-size: 10.5px;
        color: var(--fg-faint);
        font-weight: 600;
        letter-spacing: 0.04em;
      }
      .t10-subname {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-family: var(--font-mono);
        font-size: 12px;
      }
      .t10-subname .owner { color: var(--fg-muted); }
      .t10-subname .slash { color: var(--fg-faint); margin: 0 1px; }
      .t10-subname .name { color: var(--fg); font-weight: 500; }
      .t10-subscore,
      .t10-subdelta {
        font-family: var(--font-mono);
        font-variant-numeric: tabular-nums;
        font-size: 11.5px;
        font-weight: 500;
      }
      .t10-subscore { color: var(--fg-bright); }
      .t10-subdelta.up { color: var(--up); }
      .t10-subdelta.dn { color: var(--down); }
      .t10-subdelta.flat { color: var(--fg-muted); }
      .t10-subempty {
        flex: 1;
        padding: 22px 14px;
        font-family: var(--font-mono);
        font-size: 11px;
        color: var(--fg-faint);
        text-align: center;
        font-style: italic;
      }
      .t10-subopen {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 9px 14px;
        font-family: var(--font-mono);
        font-size: 10.5px;
        letter-spacing: var(--t-data);
        text-transform: uppercase;
        color: var(--accent);
        text-decoration: none;
        border-top: 1px solid var(--border-subtle);
        background: var(--shell);
        transition: background var(--motion-fast) var(--ease);
      }
      .t10-subopen:hover { background: var(--accent-wash); }
    `}</style>
  );
}
