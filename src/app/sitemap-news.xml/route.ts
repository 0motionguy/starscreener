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
//   DATA SOURCE — 2026-06-01: migrated off `fs.readFileSync(process.cwd(), ...)`
//   to the data-store. The CLAUDE.md anti-pattern rule applies — server
//   code must read through `getDataStore().read(...)`. The 3-tier reader
//   (Redis → bundled file → memory) preserves the previous file fallback
//   while also picking up live Redis writes from the collectors, which is
//   why this sitemap was empty in prod (data was in Redis only).
//
// Refs:
//   - https://developers.google.com/search/docs/crawling-indexing/sitemaps/news-sitemap

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

async function readFromStore<T>(slug: string): Promise<T | null> {
  try {
    const { getDataStore } = await import("@/lib/data-store");
    const result = await getDataStore().read<T>(slug);
    if (result.source === "missing" || !result.data) return null;
    return result.data;
  } catch {
    // Silent: a missing data-store backend is graceful — caller treats null
    // as "no entries" and emits the empty <urlset> rather than 500ing.
    return null;
  }
}

function buildHnEntries(file: HnFile | null, now: number): UrlEntry[] {
  if (!file || !Array.isArray(file.stories)) return [];
  const entries: UrlEntry[] = [];
  for (const s of file.stories) {
    if (!s || s.id === undefined || !s.title) continue;
    const createdMs = Number(s.createdUtc) * 1000;
    if (!Number.isFinite(createdMs) || createdMs <= 0) continue;
    if (now - createdMs > FRESHNESS_MS) continue;
    entries.push({
      loc: absoluteUrl(`/hackernews/trending#story-${s.id}`),
      lastmod: new Date(createdMs),
      news: {
        publicationName: PUBLICATION_NAME,
        publicationLanguage: PUBLICATION_LANG,
        publicationDate: new Date(createdMs),
        title: s.title,
      },
    });
  }
  return entries;
}

function buildPhEntries(file: PhFile | null, now: number): UrlEntry[] {
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

export async function GET(): Promise<Response> {
  const now = Date.now();

  // Both reads in parallel — independent slugs, both safe to fail individually.
  const [hnFile, phFile] = await Promise.all([
    readFromStore<HnFile>("hackernews-trending"),
    readFromStore<PhFile>("producthunt-launches"),
  ]);

  const all: UrlEntry[] = [];
  try {
    all.push(...buildHnEntries(hnFile, now));
  } catch {
    // malformed feed — skip silently rather than 500
  }
  try {
    all.push(...buildPhEntries(phFile, now));
  } catch {
    // malformed feed — skip silently rather than 500
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
