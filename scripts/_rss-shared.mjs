// Shared minimal RSS / Atom parser for the lightweight news-feed collectors
// (Claude RSS, OpenAI RSS). Pure regex — no external deps. Handles the two
// shapes both publishers use today:
//   - RSS 2.0: <rss><channel><item><title>…</title><link>…</link>…
//   - Atom:    <feed><entry><title>…</title><link href=…/>…
//
// The two endpoints are tiny (≤25 items, <80 KB), so a 60-line parser beats
// pulling in fast-xml-parser as a dep. If a publisher ships malformed XML
// we silently drop the item instead of failing the whole collector.

const ENTITIES = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
  "&#39;": "'",
};

function decodeEntities(str) {
  if (!str) return "";
  return str
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&(#?[a-z0-9]+);/gi, (m) => ENTITIES[m] ?? m)
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .trim();
}

function stripTags(str) {
  return decodeEntities(String(str ?? "").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function pick(block, tag) {
  // Match <tag>…</tag> OR <tag …attrs>…</tag>
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = block.match(re);
  return m ? decodeEntities(m[1]) : "";
}

function pickAttr(block, tag, attr) {
  // Match <tag attr="..."/> or <tag attr="..." …>
  const re = new RegExp(`<${tag}\\b[^>]*\\b${attr}=["']([^"']+)["']`, "i");
  const m = block.match(re);
  return m ? decodeEntities(m[1]) : "";
}

/**
 * Parse an RSS 2.0 or Atom feed body into a normalized item list.
 *
 * Returned items shape:
 *   { id, title, url, summary, publishedAt, author }
 * publishedAt is ISO-8601; falls back to "" if the feed doesn't expose one.
 */
export function parseFeed(xml) {
  if (typeof xml !== "string" || xml.length < 32) return [];
  const items = [];

  // Try RSS 2.0 first (<item>), then Atom (<entry>) — they don't co-occur.
  let blocks = xml.match(/<item\b[\s\S]*?<\/item>/gi) ?? [];
  let isAtom = false;
  if (blocks.length === 0) {
    blocks = xml.match(/<entry\b[\s\S]*?<\/entry>/gi) ?? [];
    isAtom = true;
  }

  for (const block of blocks) {
    const title = stripTags(pick(block, "title"));
    if (!title) continue;

    let url = "";
    let publishedAt = "";
    let summary = "";
    let author = "";
    let id = "";

    if (isAtom) {
      url = pickAttr(block, "link", "href") || pick(block, "id");
      publishedAt = pick(block, "published") || pick(block, "updated");
      summary = stripTags(pick(block, "summary") || pick(block, "content"));
      author = stripTags(pick(block, "name")) || stripTags(pick(block, "author"));
      id = pick(block, "id") || url;
    } else {
      url = stripTags(pick(block, "link"));
      publishedAt = pick(block, "pubDate") || pick(block, "dc:date");
      summary = stripTags(pick(block, "description"));
      author = stripTags(pick(block, "dc:creator")) || stripTags(pick(block, "author"));
      id = pick(block, "guid") || url;
    }

    // Truncate summary — RSS descriptions can be entire articles.
    if (summary.length > 400) summary = summary.slice(0, 397) + "...";

    const iso = normalizeDate(publishedAt);

    items.push({
      id: id || url || title,
      title: title.slice(0, 280),
      url: url || "",
      summary,
      publishedAt: iso,
      author: author || "",
    });
  }

  return items;
}

function normalizeDate(raw) {
  if (!raw) return "";
  const t = Date.parse(raw);
  if (!Number.isFinite(t)) return "";
  return new Date(t).toISOString();
}

/**
 * Fetch + parse a feed in one go, with a 10s timeout and a UA header.
 * Returns `{ items, fetchedAt, error? }` — never throws.
 */
export async function fetchFeed(url, opts = {}) {
  const fetchedAt = new Date().toISOString();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? 10_000);
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "TrendingRepo-RSS/1.0 (+https://trendingrepo.com; contact via repo)",
        Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml",
      },
      signal: controller.signal,
    });
    if (!res.ok) {
      return { items: [], fetchedAt, error: `${res.status} ${res.statusText}` };
    }
    const xml = await res.text();
    const items = parseFeed(xml);
    return { items, fetchedAt };
  } catch (err) {
    return { items: [], fetchedAt, error: err?.message || String(err) };
  } finally {
    clearTimeout(timeout);
  }
}
