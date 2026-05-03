// TrendingRepo — Google News sitemap (/sitemap-news.xml)
//
// A separate `<urlset>` document conforming to Google News' sitemap
// extension protocol. Distinct from /sitemap-repos.xml because the
// freshness contract is much tighter:
//
//   48-HOUR FRESHNESS WINDOW.
//   Per Google's News sitemap spec, only items published in the last
//   48h should appear here. Google strips entries older than two days
//   on its end regardless, so emitting them is wasted budget and can
//   trigger "stale URLs" warnings in Search Console. We enforce the
//   cutoff at build time:
//     `Date.now() - createdMs > 48 * 3600 * 1000`  → skip.
//
//   Why <loc> points at the hub page, not the source URL.
//   Google News expects the publisher (us) to host the canonical URL.
//   Linking directly to news.ycombinator.com or producthunt.com would
//   make Google index *their* page, not ours, and we'd lose every
//   click. Instead each entry points at our own rendered hub
//   (/hackernews/trending or /producthunt) with a `#story-<id>`
//   fragment so the URL is unique-per-item. The fragment is informational
//   for crawlers; the hub page itself is the actual landing.
//
//   1000-ENTRY CAP.
//   Google's News sitemap protocol caps each file at 1000 URLs. We
//   sort newest-first and slice — anything beyond 1000 within the 48h
//   window is dropped silently rather than failing validation.
//
// Refs:
//   - https://developers.google.com/search/docs/crawling-indexing/sitemaps/news-sitemap

import fs from "node:fs";
import path from "node:path";

import { absoluteUrl } from "@/lib/seo";
import {
  renderUrlset,
  xmlResponse,
  type UrlEntry,
} from "@/lib/sitemap-xml";

export const revalidate = 1800; // news refreshes more often than other surfaces
export const dynamic = "force-static";

const FRESHNESS_MS = 48 * 3600 * 1000;
const MAX_ENTRIES = 1000;
const PUBLICATION_NAME = "TrendingRepo";
const PUBLICATION_LANG = "en";

interface HnStory {
  id: number | string;
  title: string;
  url?: string;
  createdUtc: number; // epoch seconds
}

interface HnFile {
  stories?: HnStory[];
}

interface PhLaunch {
  id: string;
  name: string;
  tagline?: string;
  url?: string;
  createdAt: string; // ISO
}

interface PhFile {
  launches?: PhLaunch[];
}

function readJsonSafe<T>(relPath: string): T | null {
  try {
    const full = path.join(process.cwd(), relPath);
    const raw = fs.readFileSync(full, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function buildHnEntries(now: number): UrlEntry[] {
  // Google News rejects fragment-only URLs (#story-N). The trending hub is
  // the only crawlable HN surface this app exposes — emit it once with the
  // freshest story title as the news headline so Google News still gets a
  // signal without 378 invalid entries.
  const file = readJsonSafe<HnFile>("data/hackernews-trending.json");
  if (!file || !Array.isArray(file.stories) || file.stories.length === 0) {
    return [
      {
        loc: absoluteUrl("/hackernews/trending"),
        lastmod: new Date(now),
        news: {
          publicationName: PUBLICATION_NAME,
          publicationLanguage: PUBLICATION_LANG,
          publicationDate: new Date(now),
          title: "Hacker News Trending",
        },
      },
    ];
  }
  const freshest = file.stories
    .filter((s) => s && s.id !== undefined && s.title)
    .map((s) => ({ s, createdMs: Number(s.createdUtc) * 1000 }))
    .filter(({ createdMs }) => Number.isFinite(createdMs) && createdMs > 0 && now - createdMs <= FRESHNESS_MS)
    .sort((a, b) => b.createdMs - a.createdMs)[0];
  if (!freshest) {
    return [
      {
        loc: absoluteUrl("/hackernews/trending"),
        lastmod: new Date(now),
        news: {
          publicationName: PUBLICATION_NAME,
          publicationLanguage: PUBLICATION_LANG,
          publicationDate: new Date(now),
          title: "Hacker News Trending",
        },
      },
    ];
  }
  return [
    {
      loc: absoluteUrl("/hackernews/trending"),
      lastmod: new Date(freshest.createdMs),
      news: {
        publicationName: PUBLICATION_NAME,
        publicationLanguage: PUBLICATION_LANG,
        publicationDate: new Date(freshest.createdMs),
        title: `Hacker News Trending — ${freshest.s.title}`,
      },
    },
  ];
}

function buildPhEntries(now: number): UrlEntry[] {
  const file = readJsonSafe<PhFile>("data/producthunt-launches.json");
  if (!file || !Array.isArray(file.launches)) return [];
  const entries: UrlEntry[] = [];
  for (const l of file.launches) {
    if (!l || !l.id || !l.name) continue;
    const createdMs = new Date(l.createdAt).getTime();
    if (!Number.isFinite(createdMs) || createdMs <= 0) continue;
    if (now - createdMs > FRESHNESS_MS) continue;
    const tagline = (l.tagline ?? "").trim();
    const title = tagline
      ? `${l.name.trim()} — ${tagline}`
      : l.name.trim();
    entries.push({
      loc: absoluteUrl(`/producthunt#story-${l.id}`),
      lastmod: new Date(createdMs),
      news: {
        publicationName: PUBLICATION_NAME,
        publicationLanguage: PUBLICATION_LANG,
        publicationDate: new Date(createdMs),
        title,
      },
    });
  }
  return entries;
}

export function GET(): Response {
  const now = Date.now();

  const all: UrlEntry[] = [];
  try {
    all.push(...buildHnEntries(now));
  } catch {
    // missing/malformed feed — skip silently rather than 500
  }
  try {
    all.push(...buildPhEntries(now));
  } catch {
    // missing/malformed feed — skip silently rather than 500
  }

  // Dedupe by <loc>. A duplicate URL inside a urlset is a hard validator error.
  const seen = new Set<string>();
  const deduped: UrlEntry[] = [];
  for (const e of all) {
    if (seen.has(e.loc)) continue;
    seen.add(e.loc);
    deduped.push(e);
  }

  // Newest first so any 1000-cap truncation drops the oldest.
  deduped.sort((a, b) => {
    const at = a.lastmod ? new Date(a.lastmod).getTime() : 0;
    const bt = b.lastmod ? new Date(b.lastmod).getTime() : 0;
    return bt - at;
  });

  const capped = deduped.slice(0, MAX_ENTRIES);

  const xml = renderUrlset(capped, ["news"]);
  return xmlResponse(xml, 1800);
}
