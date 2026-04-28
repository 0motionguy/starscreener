#!/usr/bin/env node
// Scrape arXiv for trending ML/CS papers across 6 categories.
//
// arXiv exposes a free public Atom API at https://export.arxiv.org/api/query.
// No auth required. Rate limit per arxiv.org/api/tou.html is 3 req/sec —
// we run well under it (one query per category, sequential, 350ms apart).
//
// Strategy:
//   - Pull `submittedDate desc` from each of 6 categories: cs.AI, cs.LG,
//     cs.CL, cs.CV, cs.SE, stat.ML — `max_results=100` each = 600 papers/run
//   - Filter to the last 14d window (the API doesn't accept a date filter
//     directly with sortBy=submittedDate, so we filter client-side)
//   - Recency-only trending score: 1 / (ageHours + 12). arXiv has no
//     vote/comment signal — faking proxies is noise.
//   - Dedupe by arxivId (papers can appear in multiple categories)
//
// Cadence: 6h via .github/workflows/scrape-arxiv.yml. arXiv announcements
// happen daily on weekday evenings (US Eastern); 6h is enough granularity
// without burning quota.
//
// If arXiv changes the Atom schema or returns 503, the scraper fails loud;
// the app falls back to its cold-state UI based on `papers.length === 0`.
//
// Output:
//   - data/arxiv-trending.json — papers across 6 cs.* / stat.ML categories
//
// Atom parsing: we use a small regex-based extractor instead of pulling in
// fast-xml-parser. arXiv's Atom is well-formed and stable; the 6 fields we
// need (id, title, authors, summary, primary_category, categories,
// published, updated, links) are all extractable with anchored regexes
// over the <entry>...</entry> blocks. Saves a dep + a bundle entry.

import { writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchWithTimeout, parseRetryAfterMs, sleep } from "./_fetch-json.mjs";
import { writeDataStore } from "./_data-store-write.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, "..", "data");
const TRENDING_OUT = resolve(DATA_DIR, "arxiv-trending.json");

const USER_AGENT = "TrendingRepo/1.0 (+https://trendingrepo.com)";
const API_BASE = "https://export.arxiv.org/api/query";

const CATEGORIES = ["cs.AI", "cs.LG", "cs.CL", "cs.CV", "cs.SE", "stat.ML"];
const MAX_RESULTS_PER_CAT = 100;
const WINDOW_DAYS = 14;
const PER_REQUEST_DELAY_MS = 350; // ~3 req/sec, well within ToS
const FETCH_ATTEMPTS = 3;
const RETRY_DELAY_MS = 1500;
const TIMEOUT_MS = 20_000;
// arXiv abstracts run 800-2500 chars. Many ML papers terminate with a
// "Code is available at https://github.com/<owner>/<repo>" sentence in
// the last 200 chars — capping at 500 hides exactly the signal Phase B
// (paper↔repo cross-link) needs. 2000 chars covers ~99% of full abstracts.
const ABSTRACT_MAX_CHARS = 2000;

function log(msg) {
  console.log(`[arxiv] ${msg}`);
}

// Inline retry — fetchJsonWithRetry assumes JSON, we're parsing Atom XML.
async function fetchAtomWithRetry(url) {
  let lastErr;
  for (let attempt = 1; attempt <= FETCH_ATTEMPTS; attempt += 1) {
    try {
      const res = await fetchWithTimeout(url, {
        headers: { "User-Agent": USER_AGENT, Accept: "application/atom+xml" },
        timeoutMs: TIMEOUT_MS,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        const err = new Error(
          `HTTP ${res.status} ${res.statusText} - ${url}${text ? ` - ${text.slice(0, 300)}` : ""}`,
        );
        err.status = res.status;
        if ([408, 429, 500, 502, 503, 504].includes(res.status) && attempt < FETCH_ATTEMPTS) {
          const retryAfterMs =
            parseRetryAfterMs(res.headers.get("retry-after")) ?? RETRY_DELAY_MS * attempt;
          lastErr = err;
          await sleep(retryAfterMs);
          continue;
        }
        throw err;
      }
      return await res.text();
    } catch (err) {
      lastErr = err;
      if (attempt < FETCH_ATTEMPTS) {
        await sleep(RETRY_DELAY_MS * attempt);
        continue;
      }
      throw err;
    }
  }
  throw lastErr ?? new Error(`fetchAtomWithRetry: unknown failure - ${url}`);
}

// Decode the small set of XML entities arXiv emits in titles + abstracts.
function decodeXmlEntities(s) {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&amp;/g, "&"); // last so we don't double-decode
}

// Pull the inner text of a tag inside the entry block. Non-greedy match,
// strips surrounding whitespace.
function pickTag(entry, tag) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`);
  const m = entry.match(re);
  if (!m) return "";
  return decodeXmlEntities(m[1].trim().replace(/\s+/g, " "));
}

// Pull every <author><name>...</name></author> from an entry.
function pickAuthors(entry) {
  const out = [];
  const re = /<author>[\s\S]*?<name>([\s\S]*?)<\/name>[\s\S]*?<\/author>/g;
  let m;
  while ((m = re.exec(entry)) !== null) {
    out.push(decodeXmlEntities(m[1].trim()));
  }
  return out;
}

// Pull every <category term="..."/> from an entry.
function pickCategories(entry) {
  const out = [];
  const re = /<category[^>]*\bterm="([^"]+)"/g;
  let m;
  while ((m = re.exec(entry)) !== null) {
    out.push(m[1]);
  }
  return out;
}

// Pull <link rel="..." href="..." type="..." /> matching a predicate.
function pickLink(entry, predicate) {
  const re = /<link\b([^>]*)\/>/g;
  let m;
  while ((m = re.exec(entry)) !== null) {
    const attrs = {};
    const attrRe = /(\w+)="([^"]*)"/g;
    let am;
    while ((am = attrRe.exec(m[1])) !== null) {
      attrs[am[1]] = am[2];
    }
    if (predicate(attrs)) return attrs.href ?? "";
  }
  return "";
}

// Extract bare arxivId ("2403.04132") from "http://arxiv.org/abs/2403.04132v2".
// Strips the version suffix (vN) and any leading abs URL.
function extractArxivId(rawId) {
  const m = String(rawId).match(/(\d{4}\.\d{4,5})(v\d+)?$/);
  if (m) return m[1];
  // Fallback: handle older categorized id schema like "cs/0405001v1".
  const m2 = String(rawId).match(/([a-z\-]+\/\d{7})(v\d+)?$/i);
  if (m2) return m2[1];
  return String(rawId).replace(/^https?:\/\/[^/]+\/abs\//, "").replace(/v\d+$/, "");
}

function parseEntry(entryXml) {
  const rawId = pickTag(entryXml, "id");
  const arxivId = extractArxivId(rawId);
  if (!arxivId) return null;

  const title = pickTag(entryXml, "title");
  if (!title) return null;

  const summary = pickTag(entryXml, "summary");
  const published = pickTag(entryXml, "published");
  const updated = pickTag(entryXml, "updated");

  const submittedAt = published ? Date.parse(published) : NaN;
  if (!Number.isFinite(submittedAt)) return null;
  const submittedUtc = Math.floor(submittedAt / 1000);
  const updatedAt = updated ? Date.parse(updated) : NaN;
  const updatedUtc = Number.isFinite(updatedAt) ? Math.floor(updatedAt / 1000) : undefined;

  const authors = pickAuthors(entryXml);
  const categories = pickCategories(entryXml);

  // <arxiv:primary_category term="cs.LG" .../> — namespaced; pull manually.
  const primaryMatch = entryXml.match(
    /<arxiv:primary_category[^>]*\bterm="([^"]+)"/,
  );
  const primaryCategory = primaryMatch ? primaryMatch[1] : (categories[0] ?? "");

  const absUrl = rawId.startsWith("http")
    ? rawId.replace(/v\d+$/, "")
    : `https://arxiv.org/abs/${arxivId}`;
  const pdfUrl =
    pickLink(entryXml, (a) => a.type === "application/pdf") ||
    `https://arxiv.org/pdf/${arxivId}`;

  return {
    arxivId,
    title: title.slice(0, 300),
    authors,
    abstract: summary.slice(0, ABSTRACT_MAX_CHARS),
    primaryCategory,
    categories,
    pdfUrl,
    absUrl,
    submittedUtc,
    updatedUtc,
  };
}

function parseAtomFeed(xml) {
  const entries = [];
  const re = /<entry>([\s\S]*?)<\/entry>/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const parsed = parseEntry(m[1]);
    if (parsed) entries.push(parsed);
  }
  return entries;
}

function buildQueryUrl(category) {
  const params = new URLSearchParams({
    search_query: `cat:${category}`,
    sortBy: "submittedDate",
    sortOrder: "descending",
    start: "0",
    max_results: String(MAX_RESULTS_PER_CAT),
  });
  return `${API_BASE}?${params.toString()}`;
}

async function fetchCategory(category) {
  const url = buildQueryUrl(category);
  log(`fetching ${category} (${MAX_RESULTS_PER_CAT} max)`);
  const xml = await fetchAtomWithRetry(url);
  const entries = parseAtomFeed(xml);
  log(`${category} → ${entries.length} entries parsed`);
  return entries;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

async function main() {
  log(`scraping ${CATEGORIES.length} categories, last ${WINDOW_DAYS}d`);

  const nowSec = Math.floor(Date.now() / 1000);
  const cutoffSec = nowSec - WINDOW_DAYS * 24 * 60 * 60;
  // Category-scope filter: arXiv's `cat:cs.AI` query also matches papers
  // where cs.AI is a SECONDARY tag (primary might be cs.LO, cs.CR, etc.).
  // Drop those — we want a focused feed, not a "tagged-as" firehose.
  // 22% of raw results were off-target before this filter.
  const targetCategories = new Set(CATEGORIES);
  const seen = new Map(); // arxivId -> paper (dedupe across categories)
  let scannedTotal = 0;
  let droppedOffTopic = 0;

  for (const category of CATEGORIES) {
    try {
      const entries = await fetchCategory(category);
      scannedTotal += entries.length;
      for (const entry of entries) {
        if (entry.submittedUtc < cutoffSec) continue;
        // Primary-category gate: must be in our 6-category whitelist.
        // Without this, ~15% of returned papers have an off-topic primary
        // (e.g. cs.LO with cs.AI as secondary) and pollute the feed.
        if (!targetCategories.has(entry.primaryCategory)) {
          droppedOffTopic += 1;
          continue;
        }
        if (!seen.has(entry.arxivId)) {
          const ageHours = Math.max(
            0.5,
            (nowSec - entry.submittedUtc) / 3600,
          );
          const trendingScore = 1 / (ageHours + 12);
          seen.set(entry.arxivId, {
            ...entry,
            ageHours: round2(ageHours),
            trendingScore: round2(trendingScore),
            // Phase B placeholder — populated by future cross-link pass.
            linkedRepos: [],
          });
        }
      }
    } catch (err) {
      log(`category ${category} failed: ${err?.message ?? err}`);
      // Continue — one bad category shouldn't kill the run.
    }
    await sleep(PER_REQUEST_DELAY_MS);
  }

  const papers = Array.from(seen.values()).sort(
    (a, b) => (b.trendingScore ?? 0) - (a.trendingScore ?? 0),
  );

  log(
    `kept ${papers.length}, dropped ${droppedOffTopic} off-topic, scanned ${scannedTotal}`,
  );

  const payload = {
    fetchedAt: new Date().toISOString(),
    windowDays: WINDOW_DAYS,
    categories: CATEGORIES,
    scannedTotal,
    droppedOffTopic,
    papers,
  };

  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(TRENDING_OUT, JSON.stringify(payload, null, 2));
  log(`wrote ${papers.length} papers (scanned ${scannedTotal}) → ${TRENDING_OUT}`);

  try {
    await writeDataStore("arxiv-trending", payload);
    log("wrote arxiv-trending payload to Redis");
  } catch (err) {
    log(`Redis write failed: ${err?.message ?? err}`);
    // Non-fatal — file write succeeded; reader's three-tier fallback handles it.
  }
}

main().catch((err) => {
  console.error(`[arxiv] fatal: ${err?.stack ?? err}`);
  process.exit(1);
});
