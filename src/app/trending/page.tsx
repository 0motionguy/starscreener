import type { Metadata } from "next";

import { LiveTopTable, type CategoryFacet, type LiveRow } from "@/components/home/LiveTopTable";
import { CATEGORIES } from "@/lib/constants";
import { getDerivedRepos } from "@/lib/derived-repos";
import { getDataStore } from "@/lib/data-store";
import { absoluteUrl } from "@/lib/seo";
import { getRepoDeltaWindowValue, refreshTrendingFromStore } from "@/lib/trending";

type TrendWindow = "1h" | "6h" | "24h" | "7d";

interface TrendingPageProps {
  searchParams?: Promise<{ window?: string | string[] }>;
}

const VALID_WINDOWS: readonly TrendWindow[] = ["1h", "6h", "24h", "7d"] as const;
const DEFAULT_WINDOW: TrendWindow = "24h";

function parseWindow(value: string | string[] | undefined): TrendWindow {
  const v = Array.isArray(value) ? value[0] : value;
  if (!v) return DEFAULT_WINDOW;
  return VALID_WINDOWS.includes(v as TrendWindow) ? (v as TrendWindow) : DEFAULT_WINDOW;
}

function canonicalForWindow(window: TrendWindow): string {
  return window === DEFAULT_WINDOW ? "/trending" : `/trending?window=${window}`;
}

export async function generateMetadata({ searchParams }: TrendingPageProps): Promise<Metadata> {
  const sp = (await searchParams) ?? {};
  const window = parseWindow(sp.window);
  const title =
    window === DEFAULT_WINDOW
      ? "Trending Repos"
      : `Trending Repos - ${window.toUpperCase()} Window`;
  return {
    title,
    description:
      "Trending repositories across 1h, 6h, 24h, and 7d windows. Switch instantly across precomputed windows.",
    alternates: { canonical: canonicalForWindow(window) },
    openGraph: {
      title,
      url: absoluteUrl(canonicalForWindow(window)),
    },
  };
}

function extractDeltaFromUnknown(entry: unknown): { fullName: string; delta: number } | null {
  if (!entry || typeof entry !== "object") return null;
  const rec = entry as Record<string, unknown>;
  const fullNameRaw =
    rec.fullName ??
    rec.repo ??
    rec.repo_name ??
    rec.full_name ??
    (typeof rec.owner === "string" && typeof rec.name === "string"
      ? `${rec.owner}/${rec.name}`
      : null);
  const deltaRaw = rec.delta ?? rec.starsDelta ?? rec.deltaStars ?? rec.delta_stars;
  if (typeof fullNameRaw !== "string" || !fullNameRaw.includes("/")) return null;
  if (typeof deltaRaw !== "number" || !Number.isFinite(deltaRaw)) return null;
  return { fullName: fullNameRaw.toLowerCase(), delta: deltaRaw };
}

async function readPrecomputedWindowMap(window: "1h" | "6h"): Promise<Map<string, number>> {
  const store = getDataStore();
  const key = `trending:${window}:list`;
  const result = await store.read<unknown>(key);
  if (!result.data || !Array.isArray(result.data)) return new Map<string, number>();
  const map = new Map<string, number>();
  for (const row of result.data) {
    const parsed = extractDeltaFromUnknown(row);
    if (!parsed) continue;
    map.set(parsed.fullName, parsed.delta);
  }
  return map;
}

export default async function TrendingPage({ searchParams }: TrendingPageProps) {
  const sp = (await searchParams) ?? {};
  const activeWindow = parseWindow(sp.window);

  await refreshTrendingFromStore();
  const repos = getDerivedRepos();
  const [delta1hMap, delta6hMap] = await Promise.all([
    readPrecomputedWindowMap("1h"),
    readPrecomputedWindowMap("6h"),
  ]);

  const liveRows = [...repos].slice(0, 200);
  const rows: LiveRow[] = liveRows.map((repo) => {
    const ps = repo.mentions?.perSource;
    const fullNameKey = repo.fullName.toLowerCase();
    return {
      id: repo.id,
      fullName: repo.fullName,
      owner: repo.owner,
      name: repo.name,
      href: `/repo/${repo.owner}/${repo.name}`,
      categoryId: repo.categoryId,
      categoryLabel: CATEGORIES.find((c) => c.id === repo.categoryId)?.shortName ?? (repo.language ?? "Repo"),
      language: repo.language ?? null,
      stars: repo.stars,
      starsDelta1h: delta1hMap.get(fullNameKey) ?? getRepoDeltaWindowValue(repo.fullName, "1h"),
      starsDelta6h: delta6hMap.get(fullNameKey) ?? null,
      starsDelta24h: repo.starsDelta24h,
      starsDelta7d: repo.starsDelta7d,
      starsDelta30d: repo.starsDelta30d,
      forks: repo.forks,
      sparklineData: repo.sparklineData,
      momentumScore: repo.momentumScore,
      mentionCount24h: repo.mentionCount24h ?? 0,
      lastCommitAt: repo.lastCommitAt ?? null,
      sources: {
        gh: 1,
        hn: ps?.hackernews.count7d ?? ps?.hackernews.count24h ?? 0,
        r: ps?.reddit.count7d ?? ps?.reddit.count24h ?? 0,
        b: ps?.bluesky.count7d ?? ps?.bluesky.count24h ?? 0,
        d: ps?.devto.count7d ?? ps?.devto.count24h ?? 0,
        lobsters: ps?.lobsters.count7d ?? ps?.lobsters.count24h ?? 0,
        x: ps?.twitter.count7d ?? ps?.twitter.count24h ?? 0,
        npm: ps?.npm.count7d ?? ps?.npm.count24h ?? 0,
        hf: ps?.huggingface.count7d ?? ps?.huggingface.count24h ?? 0,
        arxiv: ps?.arxiv.count7d ?? ps?.arxiv.count24h ?? 0,
      },
    };
  });

  const categories: CategoryFacet[] = (() => {
    const counts = new Map<string, number>();
    for (const r of rows) counts.set(r.categoryId, (counts.get(r.categoryId) ?? 0) + 1);
    return CATEGORIES.map((c) => ({
      id: c.id,
      label: c.shortName,
      count: counts.get(c.id) ?? 0,
    }))
      .filter((c) => c.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  })();

  return (
    <main className="home-surface terminal-page">
      <section className="page-head">
        <div>
          <div className="crumb">
            <b>TREND</b> / TERMINAL / WINDOWED
          </div>
          <h1>Trending repos by time window.</h1>
          <p className="lede">
            Switch between 1h, 6h, 24h, and 7d windows. Default is 24h.
          </p>
        </div>
        <div className="clock">
          <span className="big">{activeWindow}</span>
          <span className="live">active window</span>
        </div>
      </section>
      <LiveTopTable
        rows={rows}
        categories={categories}
        defaultWindow={activeWindow}
        syncWindowQuery
      />
    </main>
  );
}
