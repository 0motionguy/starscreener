// Claude / OpenAI RSS feed readers.
//
// Mirrors the refresh-from-store pattern used in src/lib/devto-trending.ts:
// in-memory cache seeded from bundled JSON, swapped via Redis on demand.
// 30s rate-limit + in-flight dedupe keep render-time renders cheap.

import claudeData from "../../data/claude-rss.json";
import openaiData from "../../data/openai-rss.json";

export interface RssItem {
  id: string;
  title: string;
  url: string;
  summary: string;
  publishedAt: string;
  author: string;
  source: "claude" | "openai";
  category: string;
}

export interface RssFile {
  fetchedAt: string | null;
  source: "claude" | "openai";
  feedUrl: string;
  error: string | null;
  items: RssItem[];
}

let claudeFile: RssFile = claudeData as unknown as RssFile;
let openaiFile: RssFile = openaiData as unknown as RssFile;

export function getClaudeRssFile(): RssFile {
  return claudeFile;
}
export function getOpenaiRssFile(): RssFile {
  return openaiFile;
}

export function getClaudeRssTop(limit = 20): RssItem[] {
  return claudeFile.items.slice(0, limit);
}
export function getOpenaiRssTop(limit = 20): RssItem[] {
  return openaiFile.items.slice(0, limit);
}

export function claudeFetchedAt(): string | null {
  return claudeFile.fetchedAt;
}
export function openaiFetchedAt(): string | null {
  return openaiFile.fetchedAt;
}

// ---------------------------------------------------------------------------
// Refresh hooks — mirror src/lib/devto-trending.ts.
// ---------------------------------------------------------------------------

interface RefreshResult {
  source: string;
  ageMs: number;
}
const MIN_REFRESH_INTERVAL_MS = 30_000;

let claudeInflight: Promise<RefreshResult> | null = null;
let claudeLastRefreshMs = 0;
let openaiInflight: Promise<RefreshResult> | null = null;
let openaiLastRefreshMs = 0;

export async function refreshClaudeRssFromStore(): Promise<RefreshResult> {
  if (claudeInflight) return claudeInflight;
  if (
    Date.now() - claudeLastRefreshMs < MIN_REFRESH_INTERVAL_MS &&
    claudeLastRefreshMs > 0
  ) {
    return { source: "memory", ageMs: Date.now() - claudeLastRefreshMs };
  }
  claudeInflight = (async () => {
    const { getDataStore } = await import("./data-store");
    const result = await getDataStore().read<RssFile>("claude-rss");
    if (result.data && result.source !== "missing") {
      claudeFile = result.data;
    }
    claudeLastRefreshMs = Date.now();
    return { source: result.source, ageMs: result.ageMs };
  })().finally(() => {
    claudeInflight = null;
  });
  return claudeInflight;
}

export async function refreshOpenaiRssFromStore(): Promise<RefreshResult> {
  if (openaiInflight) return openaiInflight;
  if (
    Date.now() - openaiLastRefreshMs < MIN_REFRESH_INTERVAL_MS &&
    openaiLastRefreshMs > 0
  ) {
    return { source: "memory", ageMs: Date.now() - openaiLastRefreshMs };
  }
  openaiInflight = (async () => {
    const { getDataStore } = await import("./data-store");
    const result = await getDataStore().read<RssFile>("openai-rss");
    if (result.data && result.source !== "missing") {
      openaiFile = result.data;
    }
    openaiLastRefreshMs = Date.now();
    return { source: result.source, ageMs: result.ageMs };
  })().finally(() => {
    openaiInflight = null;
  });
  return openaiInflight;
}
