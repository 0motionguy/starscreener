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
    // Phase A.2 PR-B: TOOLBOX-first when flag set; falls through to
    // legacy data-store on null. Same pattern as HF/PH adapters.
    const toolboxFile = await tryFetchClaudeRssFromToolbox();
    if (toolboxFile) {
      claudeFile = toolboxFile;
      claudeLastRefreshMs = Date.now();
      return { source: "toolbox", ageMs: 0 };
    }

    const { getDataStore } = await import("./data-store");
    const result = await getDataStore().read<RssFile>("claude-rss");
    if (result.data && result.source !== "missing") {
      claudeFile = result.data;
    } else {
      const { alertAdapterFallthrough } = await import(
        "./adapter-fallthrough-alert"
      );
      alertAdapterFallthrough("claude_rss", "toolbox_null_legacy_missing", {
        result_source: result.source,
        had_toolbox_flag: process.env.TOOLBOX_READ_CLAUDE_RSS === "true",
      });
    }
    claudeLastRefreshMs = Date.now();
    return { source: result.source, ageMs: result.ageMs };
  })().finally(() => {
    claudeInflight = null;
  });
  return claudeInflight;
}

async function tryFetchClaudeRssFromToolbox(): Promise<RssFile | null> {
  if (process.env.TOOLBOX_READ_CLAUDE_RSS !== "true") return null;
  const apiUrl = process.env.TOOLBOX_API_URL;
  const apiKey = process.env.TOOLBOX_API_KEY;
  if (!apiUrl || !apiKey) return null;
  const { fetchClaudeRssFromToolbox } = await import("./toolbox-store-snapshots");
  return fetchClaudeRssFromToolbox({ apiUrl, apiKey });
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
    // TOOLBOX-first when flag set; falls through to legacy data-store on
    // null. Mirrors the Claude RSS pattern above.
    const toolboxFile = await tryFetchOpenAiAnnouncementsFromToolbox();
    if (toolboxFile) {
      openaiFile = toolboxFile;
      openaiLastRefreshMs = Date.now();
      return { source: "toolbox", ageMs: 0 };
    }

    const { getDataStore } = await import("./data-store");
    const result = await getDataStore().read<RssFile>("openai-rss");
    if (result.data && result.source !== "missing") {
      openaiFile = result.data;
    } else {
      const { alertAdapterFallthrough } = await import(
        "./adapter-fallthrough-alert"
      );
      alertAdapterFallthrough("openai", "toolbox_null_legacy_missing", {
        result_source: result.source,
        had_toolbox_flag:
          process.env.TOOLBOX_READ_OPENAI_ANNOUNCEMENTS === "true",
      });
    }
    openaiLastRefreshMs = Date.now();
    return { source: result.source, ageMs: result.ageMs };
  })().finally(() => {
    openaiInflight = null;
  });
  return openaiInflight;
}

async function tryFetchOpenAiAnnouncementsFromToolbox(): Promise<RssFile | null> {
  if (process.env.TOOLBOX_READ_OPENAI_ANNOUNCEMENTS !== "true") return null;
  const apiUrl = process.env.TOOLBOX_API_URL;
  const apiKey = process.env.TOOLBOX_API_KEY;
  if (!apiUrl || !apiKey) return null;
  const { fetchOpenAiAnnouncementsFromToolbox } = await import(
    "./toolbox-store-snapshots"
  );
  return fetchOpenAiAnnouncementsFromToolbox({ apiUrl, apiKey });
}
