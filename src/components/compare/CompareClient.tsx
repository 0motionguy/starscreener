"use client";

// StarScreener - Compare client UI.
//
// Rich deep-dive dashboard: selector + banner row + star-activity chart +
// commit heatmap + per-repo activity pulse + tech-stack bars + contributor
// grids + winner chips.
//
// Modes:
//   - Page mode (default): renders the full page chrome (header, selector,
//     `<main>` wrapper) and dual-fetches `/api/repos` (for the legacy
//     star-activity chart) + `/api/compare/github` (rich GitHub bundle).
//   - Embedded mode (`embedded=true`): suppresses the page chrome because
//     `CompareProfileGrid` above is already rendering it. Skips the
//     `/api/repos` fetch + legacy star-activity chart — the embedded
//     "Code activity side-by-side" section only exposes GitHub-derived
//     visuals (heatmap, contributors, winners) which don't need `Repo[]`.
//
// Bundles keyed by fullName so component props can O(1) look up their
// matching Repo. If /api/compare/github didn't return a bundle for a
// selected id, we synthesize a fallback ok:false bundle so the banner card
// still renders in error state — per-repo failures never block siblings.

import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import {
  CircleDot,
  GitCommit,
  GitCompareArrows,
  GitMerge,
  Package,
  Plus,
} from "lucide-react";
import { useCompareStore } from "@/lib/store";
import { CompareSelector } from "@/components/compare/CompareSelector";
import { RepoBannerCard } from "@/components/compare/RepoBannerCard";
import { CompareHeatmap } from "@/components/compare/CompareHeatmap";
import { LanguageBar } from "@/components/compare/LanguageBar";
import { ContributorGrid } from "@/components/compare/ContributorGrid";
import { WinnerChips } from "@/components/compare/WinnerChips";
import { StatIcon } from "@/components/compare/StatIcon";
import {
  compareIdToFallbackFullName,
  resolveCompareFullNames,
} from "@/lib/compare-selection";
import type { CompareRepoBundle } from "@/lib/github-compare";
import type { Repo } from "@/lib/types";
import { cn } from "@/lib/utils";

// Recharts weighs ~100KB gzipped. The compare chart sits in section 4 of a
// deep-dive page with several sections above the fold — defer loading its
// bundle until the section is rendered client-side. ssr:false is safe here
// because CompareClient is already "use client" and the chart is purely
// visual (no SEO-relevant DOM).
const CompareChart = dynamic(
  () => import("@/components/compare/CompareChart").then((m) => m.CompareChart),
  {
    ssr: false,
    loading: () => (
      <div className="skeleton-shimmer rounded-card h-[300px] w-full" />
    ),
  },
);

// Palette mirrors CompareChart's LINE_COLORS so banner accents, chart lines,
// and heatmap series all line up slot-for-slot with the selector pills.
const PALETTE = ["#22c55e", "#3b82f6", "#a855f7", "#f59e0b"] as const;

const MAX_SLOTS = 4;

/** Synthesize a well-typed ok:false bundle for IDs /api/compare didn't return. */
function fallbackBundle(fullName: string): CompareRepoBundle {
  const [owner = "", name = ""] = fullName.split("/");
  return {
    fullName,
    ok: false,
    error: "not_resolved",
    owner,
    name,
    avatarUrl: "",
    description: "",
    homepage: null,
    topics: [],
    language: null,
    license: null,
    defaultBranch: "",
    createdAt: "",
    pushedAt: "",
    stars: 0,
    forks: 0,
    watchers: 0,
    openIssues: 0,
    subscribers: 0,
    commitActivity: [],
    languages: [],
    contributors: [],
    pullsOpen: 0,
    pullsMergedRecently: 0,
    pullsClosedRecentlyWithoutMerge: 0,
    issuesOpen: 0,
    issuesClosedRecently: 0,
    releases: [],
    latestRelease: null,
  };
}

/** Sum commits across the last N weeks of a bundle's commitActivity stream. */
function sumCommitsLastWeeks(bundle: CompareRepoBundle, weeks: number): number {
  const series = bundle.commitActivity ?? [];
  if (series.length === 0) return 0;
  const slice = series.slice(-weeks);
  let total = 0;
  for (const w of slice) {
    for (const d of w.days) total += Number.isFinite(d) ? d : 0;
  }
  return total;
}

function formatRelativeDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "—";
  const diff = Date.now() - then;
  const day = 24 * 60 * 60 * 1000;
  if (diff < day) return "today";
  const days = Math.floor(diff / day);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  const years = Math.floor(months / 12);
  return `${years}y ago`;
}

export interface CompareClientProps {
  /** When true, suppresses the page chrome (header, selector, <main>) and the
   *  legacy `/api/repos` star-activity chart. Used when this client is
   *  embedded below the canonical `<CompareProfileGrid />` on `/compare`. */
  embedded?: boolean;
}

export function CompareClient({ embedded = false }: CompareClientProps = {}) {
  const repoIds = useCompareStore((s) => s.repos);
  const [repos, setRepos] = useState<Repo[]>([]);
  const [bundles, setBundles] = useState<CompareRepoBundle[]>([]);
  const [reposLoading, setReposLoading] = useState(false);
  const [bundlesLoading, setBundlesLoading] = useState(false);
  const [hasHydrated, setHasHydrated] = useState(false);

  useEffect(() => {
    // Only own the tab title in page mode; embedded mode is a section
    // inside `/compare`, where the server `<title>` wins anyway.
    if (embedded) return;
    document.title = "Compare Repos - TrendingRepo";
  }, [embedded]);

  // --- Zustand persist gate ------------------------------------------
  useEffect(() => {
    const persistApi = useCompareStore.persist;
    if (!persistApi) {
      setHasHydrated(true);
      return;
    }
    const unsubscribe = persistApi.onFinishHydration(() => {
      setHasHydrated(true);
    });
    setHasHydrated(persistApi.hasHydrated());
    return unsubscribe;
  }, []);

  // --- Dual fetch: /api/repos and /api/compare ------------------------
  useEffect(() => {
    if (!hasHydrated) {
      setReposLoading(true);
      setBundlesLoading(true);
      return;
    }
    if (repoIds.length === 0) {
      setRepos([]);
      setBundles([]);
      setReposLoading(false);
      setBundlesLoading(false);
      return;
    }

    const controller = new AbortController();
    setReposLoading(true);
    setBundlesLoading(true);
    setBundles([]);

    // Fetch 1: legacy Repo[] for CompareChart.
    (async () => {
      try {
        const res = await fetch(
          `/api/repos?ids=${encodeURIComponent(repoIds.join(","))}`,
          { signal: controller.signal },
        );
        if (!res.ok) throw new Error(`status ${res.status}`);
        const data = (await res.json()) as { repos?: Repo[] };
        const byId = new Map(
          (Array.isArray(data.repos) ? data.repos : []).map((r) => [r.id, r]),
        );
        const ordered = repoIds
          .map((id) => byId.get(id))
          .filter((r): r is Repo => r !== undefined);
        setRepos(ordered);
      } catch (err) {
        if ((err as { name?: string }).name === "AbortError") return;
        console.error("[compare] /api/repos failed", err);
        setRepos([]);
      } finally {
        setReposLoading(false);
      }
    })();

    // Fetch 2: rich GitHub bundle from `/api/compare/github`. The route
    // accepts owner/name; store IDs are owner--name — normalize via
    // `compareIdToFallbackFullName` (good enough for the common case;
    // dots/original casing are preserved by the fallback helper).
    (async () => {
      try {
        const fullNames = repoIds
          .map((id) => compareIdToFallbackFullName(id))
          .join(",");
        const res = await fetch(
          `/api/compare/github?repos=${encodeURIComponent(fullNames)}`,
          { signal: controller.signal },
        );
        if (!res.ok) throw new Error(`status ${res.status}`);
        const data = (await res.json()) as { bundles?: CompareRepoBundle[] };
        setBundles(Array.isArray(data.bundles) ? data.bundles : []);
      } catch (err) {
        if ((err as { name?: string }).name === "AbortError") return;
        console.error("[compare] /api/compare/github failed", err);
        setBundles([]);
      } finally {
        setBundlesLoading(false);
      }
    })();

    return () => controller.abort();
  }, [hasHydrated, repoIds]);

  // --- Bundle lookup by fullName for O(1) join with Repo[] ------------
  const bundlesByFullName = useMemo(() => {
    const map = new Map<string, CompareRepoBundle>();
    for (const b of bundles) {
      if (b && typeof b.fullName === "string") map.set(b.fullName, b);
    }
    return map;
  }, [bundles]);

  const selectedFullNames = useMemo(
    () => resolveCompareFullNames(repoIds, repos),
    [repoIds, repos],
  );

  // Ordered bundles mirroring selector order. Prefer the API response slot
  // first so rich bundles can render even if /api/repos hydrates a beat later.
  // Missing bundles become ok:false fallbacks so one failed repo never blocks
  // its siblings.
  const orderedBundles = useMemo<CompareRepoBundle[]>(() => {
    return selectedFullNames.map((fullName, i) => {
      const directBundle = bundles[i];
      if (directBundle?.fullName) return directBundle;
      return bundlesByFullName.get(fullName) ?? fallbackBundle(fullName);
    });
  }, [selectedFullNames, bundles, bundlesByFullName]);

  const isLoading = reposLoading || bundlesLoading;
  const isEmpty = hasHydrated && repoIds.length === 0;
  const showBundleSkeletons = bundlesLoading && bundles.length === 0;
  const skeletonCount = Math.min(Math.max(repoIds.length, 2), MAX_SLOTS);

  // ------------------------------------------------------------------
  // Empty state — no repos queued in the store.
  // ------------------------------------------------------------------
  if (isEmpty) {
    // In embedded mode the parent grid already owns the empty UX; render
    // nothing here so we don't duplicate the "pick 2 repos" nudge.
    if (embedded) return null;
    return (
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-8">
        <PageHeader />
        <CompareSelector />
        <div className="flex flex-col items-center justify-center py-20 gap-4 animate-fade-in">
          <div className="p-4 rounded-full bg-bg-card border border-border-primary">
            <GitCompareArrows size={32} className="text-text-tertiary" />
          </div>
          <p className="text-text-tertiary text-sm text-center max-w-xs">
            Select at least 2 repos to compare their momentum, stars, and
            activity side by side.
          </p>
        </div>
      </main>
    );
  }

  // Container switches between the page-level `<main>` (standalone) and a
  // bare fragment (embedded under `<CompareProfileGrid />`). The grid above
  // already owns the page header + selector, so in embedded mode we skip
  // those + the banner row (which duplicates the grid's repo columns).
  const Container = embedded ? EmbeddedShell : PageShell;

  return (
    <Container>
      {!embedded && (
        <>
          <PageHeader />
          <CompareSelector />

          {/* -------------------------------------------------------------
              3. Repo banner row (page mode only — the grid above is the
              de-facto banner row in embedded mode)
             ------------------------------------------------------------- */}
          <section
            aria-label="Repo banners"
            className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4"
          >
            {showBundleSkeletons
              ? Array.from({ length: skeletonCount }).map((_, i) => (
                  <BannerSkeleton key={`bskel-${i}`} />
                ))
              : orderedBundles.map((bundle, i) => (
                  <RepoBannerCard
                    key={bundle.fullName || `b-${i}`}
                    bundle={bundle}
                    accentColor={PALETTE[i] ?? PALETTE[0]}
                  />
                ))}
            {!isLoading &&
              orderedBundles.length > 0 &&
              orderedBundles.length < MAX_SLOTS && <AddRepoTile />}
          </section>
        </>
      )}

      {/* -------------------------------------------------------------
          4. Star activity chart (30 days)
         ------------------------------------------------------------- */}
      <section aria-label="Star activity">
        <h2 className="label-section mb-3">STAR ACTIVITY · 30 DAYS</h2>
        {isLoading && repos.length < 2 ? (
          <div className="skeleton-shimmer rounded-card h-[300px] w-full" />
        ) : repos.length >= 2 ? (
          <CompareChart repos={repos} />
        ) : (
          <EmptyPanel message="Need at least 2 resolved repos to render the chart." />
        )}
      </section>

      {/* -------------------------------------------------------------
          5. Commit heatmap (52 weeks)
         ------------------------------------------------------------- */}
      <section aria-label="Commit heatmap">
        <h2 className="label-section mb-3">COMMIT HEATMAP · 52 WEEKS</h2>
        {showBundleSkeletons ? (
          <HeatmapSkeleton />
        ) : (
          <CompareHeatmap bundles={orderedBundles} palette={[...PALETTE]} />
        )}
      </section>

      {/* -------------------------------------------------------------
          6. Activity pulse
         ------------------------------------------------------------- */}
      <section aria-label="Activity pulse">
        <h2 className="label-section mb-3">ACTIVITY PULSE</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {showBundleSkeletons
            ? Array.from({ length: skeletonCount }).map((_, i) => (
                <PulseSkeleton key={`pskel-${i}`} />
              ))
            : orderedBundles.map((bundle, i) => (
                <PulseCard
                  key={`pulse-${bundle.fullName || i}`}
                  bundle={bundle}
                  accent={PALETTE[i] ?? PALETTE[0]}
                />
              ))}
        </div>
      </section>

      {/* -------------------------------------------------------------
          7. Tech stack — stacked language bars
         ------------------------------------------------------------- */}
      <section aria-label="Tech stack">
        <h2 className="label-section mb-3">TECH STACK</h2>
        <div className="space-y-4">
          {showBundleSkeletons
            ? Array.from({ length: skeletonCount }).map((_, i) => (
                <SectionRowSkeleton key={`lskel-${i}`} />
              ))
            : orderedBundles.map((bundle, i) => (
                <RepoSubHeader
                  key={`lang-${bundle.fullName || i}`}
                  bundle={bundle}
                  accent={PALETTE[i] ?? PALETTE[0]}
                >
                  <LanguageBar bundle={bundle} />
                </RepoSubHeader>
              ))}
        </div>
      </section>

      {/* -------------------------------------------------------------
          8. Contributors
         ------------------------------------------------------------- */}
      <section aria-label="Contributors">
        <h2 className="label-section mb-3">CONTRIBUTORS</h2>
        <div className="space-y-4">
          {showBundleSkeletons
            ? Array.from({ length: skeletonCount }).map((_, i) => (
                <SectionRowSkeleton key={`cskel-${i}`} />
              ))
            : orderedBundles.map((bundle, i) => (
                <RepoSubHeader
                  key={`contrib-${bundle.fullName || i}`}
                  bundle={bundle}
                  accent={PALETTE[i] ?? PALETTE[0]}
                >
                  <ContributorGrid bundle={bundle} />
                </RepoSubHeader>
              ))}
        </div>
      </section>

      {/* -------------------------------------------------------------
          9. Winner chips
         ------------------------------------------------------------- */}
      <section aria-label="Wins" className="flex flex-col items-center gap-3">
        <h2 className="label-section">WINS</h2>
        {showBundleSkeletons ? <WinnerSkeleton /> : <WinnerChips bundles={orderedBundles} />}
      </section>
    </Container>
  );
}

// ---------------------------------------------------------------------
// Shell helpers — swap the outermost wrapper based on mode.
// ---------------------------------------------------------------------

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-8">
      {children}
    </main>
  );
}

function EmbeddedShell({ children }: { children: React.ReactNode }) {
  // Embedded under `<CompareProfileGrid />`: no page padding / max-width
  // (the parent page owns those). A plain div with the same `space-y-8`
  // rhythm keeps internal section spacing consistent with page mode.
  return <div className="space-y-8">{children}</div>;
}

// ---------------------------------------------------------------------
// Local sub-components
// ---------------------------------------------------------------------

function PageHeader() {
  return (
    <>
      <nav
        aria-label="Breadcrumb"
        className="flex items-center gap-1.5 text-xs text-text-tertiary"
      >
        <Link href="/" className="hover:text-text-primary transition-colors">
          Home
        </Link>
        <span aria-hidden="true">/</span>
        <span className="text-text-primary">Compare</span>
      </nav>
      <div>
        <h1 className="font-display text-2xl font-bold text-text-primary">
          Compare Repos · Deep Dive
        </h1>
        <p className="text-text-secondary mt-1 text-sm">
          Side-by-side: activity, community, stack, pulse.
        </p>
      </div>
    </>
  );
}

function AddRepoTile() {
  return (
    <div
      className={cn(
        "rounded-card border border-dashed border-border-primary",
        "bg-bg-card/40 flex flex-col items-center justify-center gap-2 p-6",
        "min-h-[140px] text-text-tertiary",
      )}
      aria-hidden="true"
    >
      <Plus size={20} />
      <span className="text-xs font-mono uppercase tracking-wider">
        Add repo
      </span>
    </div>
  );
}

function BannerSkeleton() {
  return <div className="skeleton-shimmer rounded-card h-[140px] w-full" />;
}

function HeatmapSkeleton() {
  // 52×7 grid of muted cells to match CompareHeatmap's geometry.
  return (
    <div className="bg-bg-card rounded-card border border-border-primary p-4">
      <div className="grid grid-cols-[repeat(52,minmax(0,1fr))] gap-[2px]">
        {Array.from({ length: 52 * 7 }).map((_, i) => (
          <div
            key={i}
            className="skeleton-shimmer aspect-square rounded-[2px]"
          />
        ))}
      </div>
    </div>
  );
}

function PulseSkeleton() {
  return (
    <div className="bg-bg-card rounded-card border border-border-primary p-4 space-y-3">
      <div className="flex items-center gap-2">
        <div className="skeleton-shimmer size-6 rounded-full shrink-0" />
        <div className="skeleton-shimmer h-4 w-2/3 rounded-sm" />
      </div>
      <div className="grid grid-cols-2 gap-y-2 gap-x-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-1">
            <div className="skeleton-shimmer h-3 w-20 rounded-sm" />
            <div className="skeleton-shimmer h-4 w-14 rounded-sm" />
          </div>
        ))}
      </div>
    </div>
  );
}

function SectionRowSkeleton() {
  return (
    <div className="bg-bg-card rounded-card border border-border-primary p-4 space-y-3">
      <div className="flex items-center gap-2">
        <div className="skeleton-shimmer size-6 rounded-full shrink-0" />
        <div className="skeleton-shimmer h-5 w-64 max-w-[70%] rounded-sm" />
      </div>
      <div className="skeleton-shimmer h-3 w-full rounded-sm" />
      <div className="flex gap-2">
        <div className="skeleton-shimmer h-3 w-24 rounded-sm" />
        <div className="skeleton-shimmer h-3 w-20 rounded-sm" />
        <div className="skeleton-shimmer h-3 w-16 rounded-sm" />
      </div>
    </div>
  );
}

function WinnerSkeleton() {
  return (
    <div className="flex flex-wrap justify-center gap-1.5">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="skeleton-shimmer h-7 w-36 rounded-full" />
      ))}
    </div>
  );
}

function EmptyPanel({ message }: { message: string }) {
  return (
    <div className="bg-bg-card rounded-card border border-border-primary p-4 text-sm text-text-tertiary">
      {message}
    </div>
  );
}

interface BundleWithAccent {
  bundle: CompareRepoBundle;
  accent: string;
}

/**
 * Stat card for the "Activity Pulse" strip. One card per bundle.
 * Shows avatar + fullName + 4 stat rows. Bundles where `ok === false`
 * collapse to a single helpful error message.
 */
function PulseCard({ bundle, accent }: BundleWithAccent) {
  const fullName = bundle.fullName || "unknown/repo";

  if (!bundle.ok) {
    return (
      <div
        className="bg-bg-card rounded-card border border-border-primary p-4 space-y-2"
        style={{ borderLeft: `3px solid ${accent}` }}
      >
        <p className="text-sm font-medium text-text-primary truncate">
          {fullName}
        </p>
        <p className="text-xs text-text-tertiary">
          GitHub API couldn&apos;t resolve this repo.
        </p>
      </div>
    );
  }

  const commits30d = sumCommitsLastWeeks(bundle, 4);
  const prMerged = bundle.pullsMergedRecently ?? 0;
  const prOpen = bundle.pullsOpen ?? 0;
  const issuesClosed = bundle.issuesClosedRecently ?? 0;
  const issuesOpen = bundle.issuesOpen ?? 0;
  const release = bundle.latestRelease;
  const releaseStr = release?.tag
    ? `${release.tag} · ${formatRelativeDate(release.publishedAt)}`
    : "—";

  return (
    <div
      className="bg-bg-card rounded-card border border-border-primary p-4 space-y-3"
      style={{ borderLeft: `3px solid ${accent}` }}
    >
      <div className="flex items-center gap-2 min-w-0">
        {bundle.avatarUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={bundle.avatarUrl}
            alt=""
            width={24}
            height={24}
            loading="lazy"
            className="size-6 rounded-full bg-bg-card-hover shrink-0"
          />
        ) : (
          <div className="size-6 rounded-full bg-bg-card-hover shrink-0" />
        )}
        <p className="text-sm font-medium text-text-primary truncate">
          {fullName}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-y-2 gap-x-3">
        <StatIcon
          icon={GitCommit}
          label="Commits 30d"
          value={commits30d.toLocaleString("en-US")}
          tone="default"
        />
        <StatIcon
          icon={GitMerge}
          label="PRs merged / open"
          value={`${prMerged} / ${prOpen}`}
          tone="default"
        />
        <StatIcon
          icon={CircleDot}
          label="Issues closed / open"
          value={`${issuesClosed} / ${issuesOpen}`}
          tone="default"
        />
        <StatIcon
          icon={Package}
          label="Latest release"
          value={releaseStr}
          tone="default"
        />
      </div>
    </div>
  );
}

/**
 * Wraps a section child (LanguageBar / ContributorGrid) with a consistent
 * avatar + fullName sub-header. Accent drives the left border so the
 * sub-sections stay visually tied to the selector pills and banner row.
 */
function RepoSubHeader({
  bundle,
  accent,
  children,
}: BundleWithAccent & { children: React.ReactNode }) {
  const fullName = bundle.fullName || "unknown/repo";

  return (
    <div
      className="bg-bg-card rounded-card border border-border-primary p-4"
      style={{ borderLeft: `3px solid ${accent}` }}
    >
      <div className="flex items-center gap-2 mb-3 min-w-0">
        {bundle.avatarUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={bundle.avatarUrl}
            alt=""
            width={24}
            height={24}
            loading="lazy"
            className="size-6 rounded-full bg-bg-card-hover shrink-0"
          />
        ) : (
          <div className="size-6 rounded-full bg-bg-card-hover shrink-0" />
        )}
        <p className="text-[18px] font-medium text-text-primary truncate">
          {fullName}
        </p>
      </div>
      {bundle.ok ? (
        children
      ) : (
        <p className="text-xs text-text-tertiary">
          GitHub API couldn&apos;t resolve this repo.
        </p>
      )}
    </div>
  );
}
