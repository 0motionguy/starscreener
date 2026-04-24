// StarScreener — sitemap
//
// Emits entries for every static route, every tracked repo (capped at
// 5,000 by momentum to stay comfortably under the 50k sitemap limit and
// avoid low-signal bloat), every category, and every collection. Uses
// `getDerivedRepos()` as the single source of truth — same feed the public
// pages render from, so the sitemap grows automatically as new repos land
// in the store (OSS Insight trending + recent-repos + manual-repos +
// pipeline JSONL, all unified).
//
// Priority is scaled by momentumScore (0–100) so hot repos get crawled
// more aggressively. changeFrequency stays "daily" — OSS Insight's deltas
// update daily and the repo pages re-render off that same cadence.

import type { MetadataRoute } from "next";
import { pipeline } from "@/lib/pipeline/pipeline";
import { CATEGORIES } from "@/lib/constants";
import { loadAllCollections } from "@/lib/collections";
import { getDerivedRepos } from "@/lib/derived-repos";
import { absoluteUrl } from "@/lib/seo";

export const revalidate = 3600; // regenerate hourly

/** Sitemap protocol hard limit is 50,000 URLs. Cap repos at 5k for SEO + size. */
const REPO_CAP = 5000;

/**
 * Map a 0-100 momentum score to a 0.3-0.9 sitemap priority. Keeps every
 * repo above the 0.2 static-page floor but scales so breakouts outrank
 * sleepy long-tail rows.
 */
function priorityFromMomentum(momentum: number): number {
  const clamped = Math.max(0, Math.min(100, momentum));
  return Number((0.3 + (clamped / 100) * 0.6).toFixed(2));
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Hydrate persisted pipeline state (keeps repoStore warm for other surfaces;
  // derived-repos is file-backed and works without it but we want consistent
  // behavior across the process lifecycle).
  await pipeline.ensureReady();

  const now = new Date();

  const staticEntries: MetadataRoute.Sitemap = [
    {
      url: absoluteUrl("/"),
      lastModified: now,
      changeFrequency: "hourly",
      priority: 1.0,
    },
    {
      url: absoluteUrl("/breakouts"),
      lastModified: now,
      changeFrequency: "hourly",
      priority: 0.9,
    },
    {
      url: absoluteUrl("/funding"),
      lastModified: now,
      changeFrequency: "hourly",
      priority: 0.9,
    },
    {
      url: absoluteUrl("/revenue"),
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.8,
    },
    {
      url: absoluteUrl("/categories"),
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.8,
    },
    {
      url: absoluteUrl("/collections"),
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.8,
    },
    {
      url: absoluteUrl("/compare"),
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.5,
    },
    {
      url: absoluteUrl("/docs"),
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.5,
    },
    {
      url: absoluteUrl("/search"),
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.5,
    },
    {
      url: absoluteUrl("/watchlist"),
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.4,
    },
  ];

  const categoryEntries: MetadataRoute.Sitemap = CATEGORIES.map((c) => ({
    url: absoluteUrl(`/categories/${c.id}`),
    lastModified: now,
    changeFrequency: "daily" as const,
    priority: 0.7,
  }));

  const collectionEntries: MetadataRoute.Sitemap = loadAllCollections().map(
    (c) => ({
      url: absoluteUrl(`/collections/${c.slug}`),
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    }),
  );

  // Sort tracked repos by momentum, cap at REPO_CAP, dedupe defensively by URL.
  // `getDerivedRepos()` unions OSS Insight + recent + manual + the pipeline
  // JSONL store — that's the superset that /repo/[owner]/[name] resolves
  // against, so every URL we emit here is guaranteed to render.
  const repos = [...getDerivedRepos()]
    .sort((a, b) => (b.momentumScore ?? 0) - (a.momentumScore ?? 0))
    .slice(0, REPO_CAP);

  const seenUrls = new Set<string>();
  const repoEntries: MetadataRoute.Sitemap = [];
  for (const r of repos) {
    const url = absoluteUrl(`/repo/${r.owner}/${r.name}`);
    if (seenUrls.has(url)) continue;
    seenUrls.add(url);
    const last = r.lastCommitAt ? new Date(r.lastCommitAt) : now;
    const lastModified = Number.isNaN(last.getTime()) ? now : last;
    repoEntries.push({
      url,
      lastModified,
      changeFrequency: "daily",
      priority: priorityFromMomentum(r.momentumScore ?? 0),
    });
  }

  return [
    ...staticEntries,
    ...categoryEntries,
    ...collectionEntries,
    ...repoEntries,
  ];
}
