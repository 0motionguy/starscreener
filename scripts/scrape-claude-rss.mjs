#!/usr/bin/env node
// Anthropic news ingester.
//
// Anthropic doesn't expose an RSS / Atom feed (the obvious /news/rss.xml is
// 404). The sitemap at https://www.anthropic.com/sitemap.xml does list every
// /news/<slug> URL with a <lastmod>, so we use that as the structured source
// and derive titles from slugs. A future enhancement could fetch each post
// for a real <meta description> + title, but the slug-derived title is good
// enough for the cross-source signals page (titles render identically to
// what Anthropic uses on their own news index since they're the slug).
//
// Output (dual-write):
//   - data/claude-rss.json
//   - Redis key  ss:data:v1:claude-rss

import { writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { writeDataStore, closeDataStore } from "./_data-store-write.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, "..", "data", "claude-rss.json");
const SITEMAP_URL = "https://www.anthropic.com/sitemap.xml";
const FEED_LABEL_URL = "https://www.anthropic.com/news";
const STORE_KEY = "claude-rss";
const SOURCE_LABEL = "claude";
const KEEP = 30;
const MAX_AGE_DAYS = 365;

function log(msg) {
  process.stdout.write(`[claude-rss] ${msg}\n`);
}

function classifyCategory(title) {
  const text = title.toLowerCase();
  if (/\bclaude(\s|-)?(\d|opus|sonnet|haiku)/.test(text)) return "MODEL";
  if (/\b(skill|tool[s]?|memory|cache|computer use|workbench)\b/.test(text))
    return "PRODUCT";
  if (
    /\b(safety|policy|preparedness|interpretability|circuit|alignment|constitution|election)\b/.test(
      text,
    )
  )
    return "RESEARCH";
  if (
    /\b(enterprise|bedrock|vertex|aws|gcp|azure|partner|amazon|google|broadcom|nec)\b/.test(
      text,
    )
  )
    return "PLATFORM";
  if (/\b(board|hire|hiring|appoint|join|gm|general manager|leader)\b/.test(text))
    return "BIZ";
  return "POST";
}

function slugToTitle(slug) {
  return slug
    .split("-")
    .filter(Boolean)
    .map((w, i) => {
      // Keep year tokens / version tokens as-is.
      if (/^\d/.test(w)) return w;
      // Lowercase short connector words mid-sentence.
      if (i > 0 && ["and", "of", "the", "a", "for", "on", "in", "to"].includes(w))
        return w;
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(" ");
}

function parseSitemap(xml) {
  const out = [];
  const blocks = xml.match(/<url>[\s\S]*?<\/url>/gi) ?? [];
  for (const block of blocks) {
    const locMatch = block.match(/<loc>([^<]+)<\/loc>/i);
    const modMatch = block.match(/<lastmod>([^<]+)<\/lastmod>/i);
    if (!locMatch) continue;
    const url = locMatch[1].trim();
    if (!url.includes("/news/")) continue;
    // Skip the index page itself, only individual posts.
    if (url.endsWith("/news") || url.endsWith("/news/")) continue;
    const slug = url.split("/news/").pop()?.replace(/\/$/, "") ?? "";
    if (!slug) continue;
    const lastmod = modMatch ? modMatch[1].trim() : "";
    out.push({ url, slug, lastmod });
  }
  return out;
}

async function fetchSitemap() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(SITEMAP_URL, {
      headers: {
        "User-Agent":
          "TrendingRepo-RSS/1.0 (+https://trendingrepo.com)",
        Accept: "application/xml, text/xml",
      },
      signal: controller.signal,
    });
    if (!res.ok) {
      return { items: [], error: `${res.status} ${res.statusText}` };
    }
    const xml = await res.text();
    return { items: parseSitemap(xml), error: null };
  } catch (err) {
    return { items: [], error: err?.message || String(err) };
  } finally {
    clearTimeout(timeout);
  }
}

async function main() {
  log(`fetching ${SITEMAP_URL}`);
  const fetchedAt = new Date().toISOString();
  const { items, error } = await fetchSitemap();
  if (error) log(`fetch error: ${error}`);
  log(`parsed ${items.length} /news entries from sitemap`);

  // Filter to past N days and sort by lastmod desc.
  const cutoff = Date.now() - MAX_AGE_DAYS * 24 * 3_600_000;
  const recent = items
    .filter((it) => {
      const t = Date.parse(it.lastmod);
      return Number.isFinite(t) && t >= cutoff;
    })
    .sort((a, b) => Date.parse(b.lastmod) - Date.parse(a.lastmod))
    .slice(0, KEEP);

  const enriched = recent.map((it) => {
    const title = slugToTitle(it.slug);
    return {
      id: it.url,
      title,
      url: it.url,
      summary: "",
      publishedAt: new Date(it.lastmod).toISOString(),
      author: "Anthropic",
      source: SOURCE_LABEL,
      category: classifyCategory(title),
    };
  });

  const payload = {
    fetchedAt,
    source: SOURCE_LABEL,
    feedUrl: FEED_LABEL_URL,
    error: error ?? null,
    items: enriched,
  };

  await writeFile(OUT, JSON.stringify(payload, null, 2) + "\n", "utf8");
  log(`wrote ${OUT} (${enriched.length} items)`);

  const writeResult = await writeDataStore(STORE_KEY, payload, {
    stampPerRecord: false,
  });
  log(`store write: ${writeResult.source} (${writeResult.writtenAt})`);

  await closeDataStore();
}

main().catch((err) => {
  process.stderr.write(`[claude-rss] FATAL: ${err?.stack ?? err}\n`);
  process.exit(1);
});
