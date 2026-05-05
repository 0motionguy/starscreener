// TrendingRepo — per-child sitemap lastmod aggregation for the index.
//
// AGN-919 / QUE-16 / SEO: the index-of-sitemaps must NOT emit `lastmod=now`
// for every child. It must reflect the max(lastmod) of each child's
// entries so crawlers know which sub-sitemap actually changed and can
// skip re-fetching the rest.
//
// Each helper here re-reads the same data source the corresponding
// child sitemap route uses. Reads are cheap (in-memory pipeline, file
// stat, JSON read) and the calls are gated by the index route's own
// `revalidate=3600`, so we don't add new pressure on the data layer.
//
// Failure isolation: every helper resolves to `undefined` on read
// errors so a single broken data source never poisons the index. The
// caller (`/sitemap.xml`) uses Promise.allSettled and treats undefined
// as "no fresher info — fall back to now".

import fs from "node:fs";
import path from "node:path";

import { listRepoBriefRefs } from "@/lib/briefs";
import { getDerivedRepos } from "@/lib/derived-repos";
import { listAvailableDigestDates } from "@/lib/digest/queries";
import { listProfileSitemapEntries } from "@/lib/sitemap-profiles";
import type { UrlEntry } from "@/lib/sitemap-xml";

/**
 * Coerce a UrlEntry's `lastmod` to epoch ms, or null if missing/invalid.
 * Pure — no IO, exported for tests.
 */
export function entryLastmodMs(entry: Pick<UrlEntry, "lastmod">): number | null {
  if (entry.lastmod === undefined || entry.lastmod === null) return null;
  const d = entry.lastmod instanceof Date ? entry.lastmod : new Date(entry.lastmod);
  const t = d.getTime();
  return Number.isFinite(t) && t > 0 ? t : null;
}

/**
 * Pure: max(lastmod) over a UrlEntry list. Returns undefined if list is
 * empty or no entry has a valid lastmod.
 */
export function maxLastmod(entries: ReadonlyArray<Pick<UrlEntry, "lastmod">>): Date | undefined {
  let max = 0;
  for (const e of entries) {
    const t = entryLastmodMs(e);
    if (t !== null && t > max) max = t;
  }
  return max > 0 ? new Date(max) : undefined;
}

// ────────────────────────────────────────────────────────────────────────────
// Per-child resolvers. Each mirrors the data-source read of the matching
// route handler. Returns undefined on failure (never throws to the caller).
// ────────────────────────────────────────────────────────────────────────────

/** /sitemap-pages.xml — static + categories, all driven by build-time
 *  constants. There is no derived "newest entry" timestamp; the page
 *  list itself only changes on deploy. We pin to the deploy timestamp
 *  via process start time so the index lastmod for pages advances
 *  exactly when a deploy occurs. */
const PROCESS_START = new Date();
export function getPagesLastmod(): Date {
  return PROCESS_START;
}

/** /sitemap-repos.xml — newest of (lastCommitAt | lastReleaseAt | createdAt)
 *  over every sitemap-eligible derived repo. */
export async function getReposLastmod(): Promise<Date | undefined> {
  try {
    // Lazy import — pipeline is heavy and we don't want to pull it in
    // during pure-helper unit tests that exercise maxLastmod only.
    const { pipeline } = await import("@/lib/pipeline/pipeline");
    await pipeline.ensureReady();
    const repos = getDerivedRepos();
    let max = 0;
    for (const r of repos) {
      const candidates = [r.lastCommitAt, r.lastReleaseAt, r.createdAt];
      for (const c of candidates) {
        if (!c) continue;
        const t = new Date(c).getTime();
        if (Number.isFinite(t) && t > max) max = t;
      }
    }
    return max > 0 ? new Date(max) : undefined;
  } catch {
    return undefined;
  }
}

/** /sitemap-news.xml — newest createdUtc across HN + ProductHunt feeds. */
interface HnFile {
  stories?: Array<{ createdUtc?: number | string }>;
}
interface PhFile {
  launches?: Array<{ createdAt?: string }>;
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
export function getNewsLastmod(): Date | undefined {
  let max = 0;
  const hn = readJsonSafe<HnFile>("data/hackernews-trending.json");
  if (hn?.stories) {
    for (const s of hn.stories) {
      const t = Number(s?.createdUtc) * 1000;
      if (Number.isFinite(t) && t > max) max = t;
    }
  }
  const ph = readJsonSafe<PhFile>("data/producthunt-launches.json");
  if (ph?.launches) {
    for (const l of ph.launches) {
      const t = new Date(l?.createdAt ?? 0).getTime();
      if (Number.isFinite(t) && t > max) max = t;
    }
  }
  return max > 0 ? new Date(max) : undefined;
}

/** /sitemap-digest.xml — newest of (digest hub = now-of-deploy, available
 *  digest date 23:59:59Z). */
export async function getDigestLastmod(): Promise<Date | undefined> {
  try {
    const dates = await listAvailableDigestDates();
    let max = 0;
    for (const date of dates) {
      const t = new Date(`${date}T23:59:59Z`).getTime();
      if (Number.isFinite(t) && t > max) max = t;
    }
    // The /digest hub itself uses `now` in the child route, which would
    // make the digest index lastmod advance every minute — defeating the
    // whole point of this fix. Use the newest snapshot instead; if no
    // snapshots exist, fall back to deploy time.
    return max > 0 ? new Date(max) : PROCESS_START;
  } catch {
    return undefined;
  }
}

/** /sitemap-profiles.xml — newest profile activity timestamp. */
export async function getProfilesLastmod(): Promise<Date | undefined> {
  try {
    const profiles = await listProfileSitemapEntries(5000);
    let max = 0;
    for (const p of profiles) {
      const t = p.lastmod.getTime();
      if (Number.isFinite(t) && t > max) max = t;
    }
    return max > 0 ? new Date(max) : undefined;
  } catch {
    return undefined;
  }
}

/** /brief/sitemap.xml — newest brief writtenAt or file mtime. */
export function getBriefLastmod(): Date | undefined {
  try {
    const refs = listRepoBriefRefs();
    let max = 0;
    for (const b of refs) {
      const written = b.writtenAt ? new Date(b.writtenAt).getTime() : 0;
      const updated = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      const t = Math.max(written, updated);
      if (Number.isFinite(t) && t > max) max = t;
    }
    return max > 0 ? new Date(max) : undefined;
  } catch {
    return undefined;
  }
}
