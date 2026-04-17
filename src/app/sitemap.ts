// StarScreener — sitemap
//
// Emits entries for every static route, every tracked repo, and every
// category. Uses the pipeline facade as the single source of truth so the
// sitemap grows automatically as new repos land in the store.

import type { MetadataRoute } from "next";
import { pipeline, repoStore } from "@/lib/pipeline/pipeline";
import { CATEGORIES } from "@/lib/constants";
import { absoluteUrl } from "@/lib/seo";

export const revalidate = 3600; // regenerate hourly

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Hydrate persisted state (or fall back to mock seed) before reading.
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
      url: absoluteUrl("/categories"),
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.8,
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
    {
      url: absoluteUrl("/compare"),
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

  const repoEntries: MetadataRoute.Sitemap = repoStore.getAll().map((r) => {
    const last = r.lastCommitAt ? new Date(r.lastCommitAt) : now;
    const lastModified = Number.isNaN(last.getTime()) ? now : last;
    return {
      url: absoluteUrl(`/repo/${r.owner}/${r.name}`),
      lastModified,
      changeFrequency: "daily" as const,
      priority: 0.6,
    };
  });

  return [...staticEntries, ...categoryEntries, ...repoEntries];
}
