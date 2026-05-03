import type { TwitterSignal } from "./apify-twitter";

import {
  NitterAllInstancesDownError,
  NitterInstanceDownError,
} from "@/lib/errors";
import configured from "@/../config/nitter-instances.json";

type InstanceStatus = "unknown" | "healthy" | "dead";

interface NitterInstance {
  url: string;
  lastChecked: string | null;
  status: InstanceStatus;
}

interface NitterConfig {
  instances: NitterInstance[];
}

export interface NitterScrapeOptions {
  query?: string;
  limit?: number;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 10_000;
let cursor = 0;
const state = normalizeInstances(configured as NitterConfig);

export async function tryNitterScrape(
  repoFullName: string,
  options: NitterScrapeOptions = {},
): Promise<TwitterSignal[]> {
  const activeCount = state.filter((instance) => instance.status !== "dead").length;
  if (activeCount === 0) {
    throw new NitterAllInstancesDownError("All Nitter instances are marked dead", {
      instanceCount: state.length,
    });
  }

  const query = options.query?.trim() || repoFullName;
  const failures: Array<{ url: string; error: string }> = [];
  let attempted = 0;
  const maxAttempts = state.length;

  while (attempted < maxAttempts) {
    const idx = (cursor + attempted) % state.length;
    attempted += 1;
    const instance = state[idx];
    if (instance.status === "dead") continue;

    const startedAt = Date.now();
    const checkedAt = new Date().toISOString();
    try {
      const url = `${instance.url.replace(/\/+$/, "")}/search/rss?q=${encodeURIComponent(query)}`;
      const xml = await fetchText(url, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
      instance.status = "healthy";
      instance.lastChecked = checkedAt;
      cursor = (idx + 1) % state.length;
      const signals = parseNitterRss(xml, query, instance.url);
      if (options.limit && options.limit > 0) return signals.slice(0, options.limit);
      return signals;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      instance.status = "dead";
      instance.lastChecked = checkedAt;
      failures.push({
        url: instance.url,
        error: `${message} (${Date.now() - startedAt}ms)`,
      });
    }
  }

  if (failures.length > 0) {
    throw new NitterAllInstancesDownError("Nitter fallback failed across all instances", {
      repoFullName,
      failures,
    });
  }

  throw new NitterInstanceDownError("No available Nitter instance for fallback", {
    repoFullName,
  });
}

function normalizeInstances(config: NitterConfig): NitterInstance[] {
  const raw = Array.isArray(config.instances) ? config.instances : [];
  return raw
    .map((instance) => {
      const url = typeof instance.url === "string" ? instance.url.trim().replace(/\/+$/, "") : "";
      if (!url) return null;
      const status: InstanceStatus =
        instance.status === "healthy" || instance.status === "dead" ? instance.status : "unknown";
      const lastChecked =
        typeof instance.lastChecked === "string" && instance.lastChecked.length > 0
          ? instance.lastChecked
          : null;
      return { url, status, lastChecked };
    })
    .filter((instance): instance is NitterInstance => Boolean(instance));
}

async function fetchText(url: string, timeoutMs: number): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: "application/rss+xml, application/xml, text/xml",
        "User-Agent": "trendingrepo-twitter-fallback/1.0 (+https://trendingrepo.com)",
      },
    });
    if (!response.ok) {
      throw new NitterInstanceDownError("Nitter RSS endpoint failed", {
        url,
        statusCode: response.status,
      });
    }
    return await response.text();
  } catch (error) {
    if (error instanceof NitterInstanceDownError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new NitterInstanceDownError("Nitter RSS request timed out", { url, timeoutMs });
    }
    throw new NitterInstanceDownError("Nitter RSS request failed", {
      url,
      message: error instanceof Error ? error.message : String(error),
    });
  } finally {
    clearTimeout(timer);
  }
}

function parseNitterRss(
  xml: string,
  matchedQuery: string,
  sourceBaseUrl: string,
): TwitterSignal[] {
  const out: TwitterSignal[] = [];
  const itemMatches = xml.match(/<item\b[\s\S]*?<\/item>/gi) ?? [];

  for (const item of itemMatches) {
    const title = decode(extract(item, "title"));
    const link = decode(extract(item, "link"));
    const pubDate = decode(extract(item, "pubDate"));
    const creator = decode(extract(item, "dc:creator") ?? extract(item, "creator"));
    if (!title || !link || !pubDate) continue;

    const postedAt = normalizeIso(pubDate);
    if (!postedAt) continue;
    const handle = creator?.replace(/^@/, "").trim() || "unknown";
    const postId = extractPostId(link, postedAt, handle);

    out.push({
      id: postId,
      url: normalizeXUrl(link),
      authorHandle: handle,
      authorName: null,
      content: stripHtml(title),
      postedAt,
      likeCount: 0,
      repostCount: 0,
      replyCount: 0,
      quoteCount: 0,
      viewCount: null,
      matchedQuery,
      expandedUrls: [link, sourceBaseUrl],
    });
  }

  return out;
}

function extract(block: string, tag: string): string | null {
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}>`, "i");
  const match = block.match(re);
  return match ? unwrapCdata(match[1]).trim() : null;
}

function unwrapCdata(value: string): string {
  const match = value.match(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/);
  return match ? match[1] : value;
}

function decode(value: string | null): string | null {
  if (value === null) return null;
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeIso(value: string): string | null {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toISOString();
}

function extractPostId(link: string, postedAt: string, handle: string): string {
  const match = link.match(/status\/(\d+)/i);
  if (match) return match[1];
  return `${handle}-${postedAt}`;
}

function normalizeXUrl(link: string): string {
  try {
    const parsed = new URL(link);
    parsed.hostname = "x.com";
    return parsed.toString();
  } catch {
    return link;
  }
}

export function _resetNitterPoolForTests(): void {
  cursor = 0;
  for (const instance of state) {
    instance.status = "unknown";
    instance.lastChecked = null;
  }
}
