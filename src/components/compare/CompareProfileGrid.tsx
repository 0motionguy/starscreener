"use client";

// StarScreener — Compare page canonical-profile grid.
//
// Fetches `/api/compare?repos=...` (the new canonical endpoint) and renders
// a 2-4 column grid. Each column stacks compact mini-modules sourced from
// the CanonicalRepoProfile per repo:
//   1. Momentum (score + 24h/7d star deltas)
//   2. Why Trending (top 1-2 reasons)
//   3. Cross-Signal strip (5 ChannelDots)
//   4. Revenue (verified MRR badge)
//   5. Funding (latest event amount + round)
//   6. npm (top package 7d downloads)
//   7. Recent mentions (3 titles)
//
// Cross-column diff highlighting flags big spreads (e.g. one repo +2k 24h
// stars while another is flat) via a subtle text-up/text-down colour.

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { GitCompareArrows, Plus } from "lucide-react";
import { useCompareStore } from "@/lib/store";
import { useCompareRepos } from "@/hooks/useCompareRepos";
import { slugToId } from "@/lib/utils";
import { CompareSelector } from "@/components/compare/CompareSelector";
import { RepoProfileColumn } from "@/components/compare/RepoProfileColumn";
import { resolveCompareFullNames } from "@/lib/compare-selection";
import type { Repo } from "@/lib/types";
import type { CanonicalRepoProfile } from "@/lib/api/repo-profile";
import { cn } from "@/lib/utils";
import { COMPARE_MAX_SLOTS as MAX_SLOTS } from "./palette";

/** Single row from `/api/compare`'s new shape. */
export interface CompareRepoRow {
  fullName: string;
  profile: CanonicalRepoProfile | null;
  error?: string;
}

interface CompareEnvelope {
  ok: boolean;
  fetchedAt: string;
  repos: CompareRepoRow[];
}

/** Per-field comparison outcome across all columns. `neutral` = no contrast. */
export type DiffTone = "up" | "down" | "neutral";

export interface CompareDiffFlags {
  starsDelta24h: DiffTone[];
  starsDelta7d: DiffTone[];
  momentumScore: DiffTone[];
  npmDownloads7d: DiffTone[];
}

/**
 * Compute per-column diff tones. We pick a spread threshold equal to the
 * max |value|'s share (>= 50% beats the next column) — intentionally subtle:
 * only the extreme ends of a big spread get a colour.
 */
function computeDiffFlags(
  profiles: Array<CanonicalRepoProfile | null>,
): CompareDiffFlags {
  const starsDelta24h: DiffTone[] = new Array(profiles.length).fill("neutral");
  const starsDelta7d: DiffTone[] = new Array(profiles.length).fill("neutral");
  const momentumScore: DiffTone[] = new Array(profiles.length).fill("neutral");
  const npmDownloads7d: DiffTone[] = new Array(profiles.length).fill("neutral");

  const stars24hVals: Array<{ i: number; v: number }> = [];
  const stars7dVals: Array<{ i: number; v: number }> = [];
  const momentumVals: Array<{ i: number; v: number }> = [];
  const npmVals: Array<{ i: number; v: number }> = [];

  profiles.forEach((p, i) => {
    if (!p) return;
    stars24hVals.push({ i, v: p.repo.starsDelta24h ?? 0 });
    stars7dVals.push({ i, v: p.repo.starsDelta7d ?? 0 });
    momentumVals.push({ i, v: p.repo.momentumScore ?? 0 });
    const topNpm = p.npm.packages[0];
    npmVals.push({ i, v: topNpm ? topNpm.downloads7d : 0 });
  });

  const markSpread = (
    entries: Array<{ i: number; v: number }>,
    tones: DiffTone[],
    threshold: number,
  ) => {
    if (entries.length < 2) return;
    const max = Math.max(...entries.map((e) => e.v));
    const min = Math.min(...entries.map((e) => e.v));
    const spread = max - min;
    if (spread < threshold) return;
    for (const e of entries) {
      // Only colour the extremes. Middle columns stay neutral so we don't
      // paint the whole row.
      if (e.v === max && max > 0) tones[e.i] = "up";
      else if (e.v === min && min < 0) tones[e.i] = "down";
    }
  };

  markSpread(stars24hVals, starsDelta24h, 100);
  markSpread(stars7dVals, starsDelta7d, 500);
  markSpread(momentumVals, momentumScore, 25);
  markSpread(npmVals, npmDownloads7d, 10_000);

  return { starsDelta24h, starsDelta7d, momentumScore, npmDownloads7d };
}

export function CompareProfileGrid() {
  const repoIds = useCompareStore((s) => s.repos);
  const addRepo = useCompareStore((s) => s.addRepo);
  const clearAll = useCompareStore((s) => s.clearAll);
  const searchParams = useSearchParams();
  const [rows, setRows] = useState<CompareRepoRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasHydrated, setHasHydrated] = useState(false);
  // UI-06: shared `/api/repos` fetcher with cross-component dedup.
  // Replaces a private fetch + Repo[] state that mirrored CompareClient.
  const { repos } = useCompareRepos(repoIds, hasHydrated);

  useEffect(() => {
    document.title = "Compare Repos - TrendingRepo";
  }, []);

  // --- URL-param back-compat ------------------------------------------
  // Accept `?repos=owner/name,owner/name` and seed the compare store on
  // first render. Intentionally runs only once per mount so the user can
  // still remove pills after landing via a URL.
  const reposQuery = searchParams?.get("repos") ?? "";
  useEffect(() => {
    if (!hasHydrated) return;
    if (!reposQuery) return;
    const parsed = reposQuery
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, MAX_SLOTS);
    if (parsed.length === 0) return;
    // Overwrite only if the URL disagrees with the persisted selection —
    // avoids clobbering existing pills when the user navigates back.
    const asIds = parsed.map((fn) => slugToId(fn));
    const sameAsStore =
      asIds.length === repoIds.length &&
      asIds.every((id, i) => id === repoIds[i]);
    if (sameAsStore) return;
    clearAll();
    for (const id of asIds) addRepo(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasHydrated, reposQuery]);

  // --- Zustand persist gate -------------------------------------------
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

  // Repo[] for fullName resolution lives in the shared useCompareRepos
  // hook above (UI-06). The store holds ids like `owner--name`;
  // `/api/compare?repos=` needs owner/name, so the resolved Repo[]
  // gets fed into resolveCompareFullNames below.

  const selectedFullNames = useMemo(
    () => resolveCompareFullNames(repoIds, repos),
    [repoIds, repos],
  );

  // Fetch canonical profiles whenever the resolved fullName set changes.
  useEffect(() => {
    if (!hasHydrated) return;
    if (selectedFullNames.length < 1) {
      setRows([]);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    (async () => {
      try {
        const qp = selectedFullNames.join(",");
        const res = await fetch(
          `/api/compare?repos=${encodeURIComponent(qp)}`,
          { signal: controller.signal },
        );
        if (!res.ok) throw new Error(`status ${res.status}`);
        const data = (await res.json()) as CompareEnvelope;
        setRows(Array.isArray(data.repos) ? data.repos : []);
      } catch (err) {
        if ((err as { name?: string }).name === "AbortError") return;
        console.error("[compare] /api/compare failed", err);
        setRows([]);
      } finally {
        setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [hasHydrated, selectedFullNames.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  // Ordered rows mirroring selector order — fall back to a placeholder row
  // so one unknown slug never blanks the grid.
  const orderedRows = useMemo<CompareRepoRow[]>(() => {
    const byName = new Map<string, CompareRepoRow>();
    for (const r of rows) byName.set(r.fullName.toLowerCase(), r);
    return selectedFullNames.map((fullName) => {
      const hit = byName.get(fullName.toLowerCase());
      if (hit) return hit;
      return { fullName, profile: null, error: "loading" };
    });
  }, [selectedFullNames, rows]);

  const profiles = useMemo(
    () => orderedRows.map((r) => r.profile),
    [orderedRows],
  );
  const diffFlags = useMemo(() => computeDiffFlags(profiles), [profiles]);

  const isEmpty = hasHydrated && repoIds.length === 0;
  const columnCount = Math.min(Math.max(orderedRows.length, 1), MAX_SLOTS);

  if (isEmpty) {
    return (
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-8">
        <PageHeader />
        <CompareSelector />
        <div className="flex flex-col items-center justify-center py-20 gap-4 animate-fade-in">
          <div className="p-4 rounded-full bg-bg-card border border-border-primary">
            <GitCompareArrows size={32} className="text-text-tertiary" />
          </div>
          <p className="text-text-tertiary text-sm text-center max-w-xs">
            Select at least 2 repos to compare their momentum, signals, and
            revenue side by side.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-8">
      <PageHeader />
      <CompareSelector />

      <section
        aria-label="Side-by-side repo profiles"
        className={cn(
          "grid gap-4",
          columnCount === 1 && "grid-cols-1",
          columnCount === 2 && "grid-cols-1 md:grid-cols-2",
          columnCount === 3 && "grid-cols-1 md:grid-cols-2 xl:grid-cols-3",
          columnCount >= 4 && "grid-cols-1 md:grid-cols-2 xl:grid-cols-4",
        )}
      >
        {orderedRows.map((row, i) => (
          <RepoProfileColumn
            key={row.fullName || `col-${i}`}
            row={row}
            columnIndex={i}
            loading={loading && !row.profile}
            diffFlags={{
              starsDelta24h: diffFlags.starsDelta24h[i] ?? "neutral",
              starsDelta7d: diffFlags.starsDelta7d[i] ?? "neutral",
              momentumScore: diffFlags.momentumScore[i] ?? "neutral",
              npmDownloads7d: diffFlags.npmDownloads7d[i] ?? "neutral",
            }}
          />
        ))}
        {orderedRows.length > 0 && orderedRows.length < MAX_SLOTS && (
          <AddRepoTile />
        )}
      </section>
    </main>
  );
}

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
          Compare Repos · Canonical Signals
        </h1>
        <p className="text-text-secondary mt-1 text-sm">
          Side-by-side: momentum, reasons, revenue, funding, mentions.
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
