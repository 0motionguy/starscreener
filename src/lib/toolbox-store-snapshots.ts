// TOOLBOX read adapters — snapshot-style signals (arxiv / claude.rss / lobsters-trending)
//
// Phase A.2 PR-B. These signals differ from the mentions/velocity/HF/PH
// pattern: each TOOLBOX event carries the entire payload as an `items`
// array on `fields.items`, not one row per target. Multiple target_ids
// per signal map to different "views" of the snapshot (e.g., arxiv has
// 2 targets — likely category groupings), so this adapter merges items
// across all events returned by the leaderboard endpoint.
//
// Field coverage caveats per signal (documented inline by adapter):
//   - arxiv: TOOLBOX events lack `primaryCategory`, `linkedRepos`,
//     and `linkedRepoCount`. linkedRepos defaults to [] so badges go
//     dark under flag-on. primaryCategory defaults to null. Cross-domain
//     join scoring (which uses these) renormalizes the affected weights
//     to zero — same coldstart behaviour the legacy file uses.
//   - claude.rss: PERFECT match for legacy RssItem/RssFile shape.
//   - lobsters-trending: legacy LobstersStory has optional fields
//     (description, linkedRepos, trendingScore, ageHours). All omitted
//     here. hydrateStory() in lobsters-trending.ts recomputes
//     trendingScore + ageHours at read time, so no degradation there.
//     linkedRepos + description go dark — repo-mention badges on the
//     Lobsters trending view are not surfaced.
//
// The flag-gating + alert-on-fallthrough wiring lives in the per-source
// reader (arxiv.ts / rss-feeds.ts / lobsters-trending.ts).

import "server-only";

import type {
  ArxivLinkedRepo,
  ArxivPaperRaw,
  ArxivRecentFile,
} from "./arxiv";
import type { LobstersStory } from "./lobsters";
import type { LobstersTrendingFile } from "./lobsters-trending";
import type { RssFile, RssItem } from "./rss-feeds";
import type { ToolboxEvent, ToolboxFetchOptions } from "./toolbox-store-common";
import {
  fetchLeaderboardEvents,
  maxProducedAtMs,
} from "./toolbox-store-common";

function toIso(maxMs: number): string {
  return (maxMs > 0 ? new Date(maxMs) : new Date()).toISOString();
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}

/**
 * Pull every event's `items` array and concatenate. Stable across multiple
 * target_ids for the same signal_type (e.g. arxiv "ai" vs "ml" categories).
 */
function mergeItems<T>(
  events: ToolboxEvent[],
  predicate: (raw: unknown) => raw is T,
): T[] {
  const out: T[] = [];
  for (const ev of events) {
    const f = ev.fields;
    if (typeof f !== "object" || f === null) continue;
    const items = (f as Record<string, unknown>).items;
    if (!Array.isArray(items)) continue;
    for (const raw of items) {
      if (predicate(raw)) out.push(raw);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// arXiv — trending.arxiv
// ---------------------------------------------------------------------------

function isArxivItem(raw: unknown): raw is Record<string, unknown> {
  return typeof raw === "object" && raw !== null && typeof (raw as { arxivId?: unknown }).arxivId === "string";
}

function paperFromItem(raw: Record<string, unknown>): ArxivPaperRaw {
  const linkedRaw = (raw as { linkedRepos?: unknown }).linkedRepos;
  const linkedRepos: ArxivLinkedRepo[] = Array.isArray(linkedRaw)
    ? linkedRaw
        .filter((r): r is Record<string, unknown> => typeof r === "object" && r !== null)
        .map((r) => ({
          fullName: stringOr(r.fullName, ""),
          matchType: stringOr(r.matchType, ""),
          confidence: numberOr(r.confidence, 0),
        }))
    : [];
  return {
    arxivId: stringOr(raw.arxivId, ""),
    title: stringOr(raw.title, ""),
    summary: stringOr(raw.summary, ""),
    authors: stringArray(raw.authors),
    categories: stringArray(raw.categories),
    primaryCategory:
      typeof raw.primaryCategory === "string" ? raw.primaryCategory : null,
    absUrl: stringOr(raw.absUrl, ""),
    pdfUrl: stringOr(raw.pdfUrl, ""),
    publishedAt: stringOr(raw.publishedAt, ""),
    updatedAt: stringOr(raw.updatedAt, ""),
    linkedRepos,
  };
}

export async function fetchArxivFromToolbox(
  opts: ToolboxFetchOptions,
): Promise<ArxivRecentFile | null> {
  const body = await fetchLeaderboardEvents(opts, "trending.arxiv");
  if (!body) return null;

  const items = mergeItems(body.targets, isArxivItem);
  const papers = items.map(paperFromItem);

  // De-dupe by arxivId (multiple targets may overlap).
  const seen = new Set<string>();
  const unique: ArxivPaperRaw[] = [];
  for (const p of papers) {
    if (!p.arxivId || seen.has(p.arxivId)) continue;
    seen.add(p.arxivId);
    unique.push(p);
  }

  // Newest published first.
  unique.sort((a, b) => {
    const ta = Date.parse(a.publishedAt);
    const tb = Date.parse(b.publishedAt);
    return (Number.isFinite(tb) ? tb : 0) - (Number.isFinite(ta) ? ta : 0);
  });

  return {
    fetchedAt: toIso(maxProducedAtMs(body.targets)),
    source: "toolbox:trending.arxiv",
    count: unique.length,
    linkedRepoCount: unique.reduce(
      (n, p) => n + (p.linkedRepos.length > 0 ? 1 : 0),
      0,
    ),
    papers: unique,
  };
}

// ---------------------------------------------------------------------------
// Claude RSS — trending.claude.rss
// ---------------------------------------------------------------------------

function isRssItem(raw: unknown): raw is Record<string, unknown> {
  return (
    typeof raw === "object" &&
    raw !== null &&
    typeof (raw as { id?: unknown }).id === "string" &&
    typeof (raw as { url?: unknown }).url === "string"
  );
}

function rssItemFromRaw(raw: Record<string, unknown>): RssItem {
  const source = stringOr(raw.source, "claude");
  return {
    id: stringOr(raw.id, ""),
    title: stringOr(raw.title, ""),
    url: stringOr(raw.url, ""),
    summary: stringOr(raw.summary, ""),
    publishedAt: stringOr(raw.publishedAt, ""),
    author: stringOr(raw.author, ""),
    source: source === "openai" ? "openai" : "claude",
    category: stringOr(raw.category, ""),
  };
}

export async function fetchClaudeRssFromToolbox(
  opts: ToolboxFetchOptions,
): Promise<RssFile | null> {
  const body = await fetchLeaderboardEvents(opts, "trending.claude.rss");
  if (!body) return null;

  const items = mergeItems(body.targets, isRssItem).map(rssItemFromRaw);

  // De-dupe by id, newest first.
  const seen = new Set<string>();
  const unique: RssItem[] = [];
  for (const it of items) {
    if (!it.id || seen.has(it.id)) continue;
    seen.add(it.id);
    unique.push(it);
  }
  unique.sort((a, b) => {
    const ta = Date.parse(a.publishedAt);
    const tb = Date.parse(b.publishedAt);
    return (Number.isFinite(tb) ? tb : 0) - (Number.isFinite(ta) ? ta : 0);
  });

  return {
    fetchedAt: toIso(maxProducedAtMs(body.targets)),
    source: "claude",
    feedUrl: "toolbox:trending.claude.rss",
    error: null,
    items: unique,
  };
}

// ---------------------------------------------------------------------------
// OpenAI announcements — content.openai.announcements
//
// Same payload shape as Claude RSS (each TOOLBOX event carries the full RSS
// snapshot on `fields.items`). Item source is forced to "openai" since this
// adapter is OpenAI-specific even if a stray row arrived with an empty/other
// source field.
// ---------------------------------------------------------------------------

function openaiRssItemFromRaw(raw: Record<string, unknown>): RssItem {
  return {
    id: stringOr(raw.id, ""),
    title: stringOr(raw.title, ""),
    url: stringOr(raw.url, ""),
    summary: stringOr(raw.summary, ""),
    publishedAt: stringOr(raw.publishedAt, ""),
    author: stringOr(raw.author, ""),
    source: "openai",
    category: stringOr(raw.category, ""),
  };
}

export async function fetchOpenAiAnnouncementsFromToolbox(
  opts: ToolboxFetchOptions,
): Promise<RssFile | null> {
  const body = await fetchLeaderboardEvents(opts, "content.openai.announcements");
  if (!body) return null;

  const items = mergeItems(body.targets, isRssItem).map(openaiRssItemFromRaw);

  // De-dupe by id, newest first.
  const seen = new Set<string>();
  const unique: RssItem[] = [];
  for (const it of items) {
    if (!it.id || seen.has(it.id)) continue;
    seen.add(it.id);
    unique.push(it);
  }
  unique.sort((a, b) => {
    const ta = Date.parse(a.publishedAt);
    const tb = Date.parse(b.publishedAt);
    return (Number.isFinite(tb) ? tb : 0) - (Number.isFinite(ta) ? ta : 0);
  });

  return {
    fetchedAt: toIso(maxProducedAtMs(body.targets)),
    source: "openai",
    feedUrl: "toolbox:content.openai.announcements",
    error: null,
    items: unique,
  };
}

// ---------------------------------------------------------------------------
// Lobsters trending — trending.lobsters
// ---------------------------------------------------------------------------

function isLobstersStory(raw: unknown): raw is Record<string, unknown> {
  return (
    typeof raw === "object" &&
    raw !== null &&
    typeof (raw as { shortId?: unknown }).shortId === "string"
  );
}

function lobstersStoryFromRaw(raw: Record<string, unknown>): LobstersStory {
  // TOOLBOX events provide publishedAt as ISO; legacy LobstersStory wants
  // createdUtc as a unix seconds number. Convert.
  const publishedAtIso = stringOr(raw.publishedAt, "");
  const publishedMs = Date.parse(publishedAtIso);
  const createdUtc = Number.isFinite(publishedMs)
    ? Math.floor(publishedMs / 1000)
    : 0;

  // url + storyUrl: storyUrl is the linked article, url is the lobsters
  // discussion page. commentsUrl = url. Match legacy convention.
  const lobstersUrl = stringOr(raw.url, "");
  const storyUrl = stringOr(raw.storyUrl, lobstersUrl);

  return {
    shortId: stringOr(raw.shortId, ""),
    title: stringOr(raw.title, ""),
    url: storyUrl, // linked article URL
    commentsUrl: lobstersUrl, // lobsters discussion page
    by: stringOr(raw.submitter, ""),
    score: numberOr(raw.score, 0),
    commentCount: numberOr(raw.commentCount, 0),
    createdUtc,
    tags: stringArray(raw.tags),
    // ageHours + trendingScore intentionally omitted — hydrateStory() in
    // lobsters-trending.ts recomputes them at read time.
    // description + linkedRepos omitted — not transmitted by dual-write.
  };
}

export async function fetchLobstersTrendingFromToolbox(
  opts: ToolboxFetchOptions,
): Promise<LobstersTrendingFile | null> {
  const body = await fetchLeaderboardEvents(opts, "trending.lobsters");
  if (!body) return null;

  const items = mergeItems(body.targets, isLobstersStory).map(
    lobstersStoryFromRaw,
  );

  // De-dupe by shortId.
  const seen = new Set<string>();
  const unique: LobstersStory[] = [];
  for (const s of items) {
    if (!s.shortId || seen.has(s.shortId)) continue;
    seen.add(s.shortId);
    unique.push(s);
  }
  // hydrateStory() in lobsters-trending.ts will recompute trendingScore +
  // ageHours and re-sort; we just need to return stories.

  return {
    fetchedAt: toIso(maxProducedAtMs(body.targets)),
    windowHours: 72, // legacy convention (matches scrape-lobsters.mjs)
    scannedTotal: 0, // not transmitted by dual-write
    stories: unique,
  };
}
