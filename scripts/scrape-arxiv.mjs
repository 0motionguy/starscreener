#!/usr/bin/env node
// Scrape arXiv for recent CS-AI/CL/LG papers.
//
// arXiv's public API (Atom XML) lets us pull recent submissions in
// specific categories without auth. Their TOS asks for a 3-second gap
// between requests; a single fetch is fine. We do one query covering
// cs.AI, cs.CL, cs.LG (the three disciplines the /research placeholder
// already promises).
//
// Endpoint:
//   https://export.arxiv.org/api/query?
//     search_query=cat:cs.AI+OR+cat:cs.CL+OR+cat:cs.LG
//     &sortBy=submittedDate&sortOrder=descending&max_results=100
// (HTTP → HTTPS is now a 301 redirect; we go straight to HTTPS.)
//
// Output:
//   - data/arxiv-recent.json — recent arXiv papers, snapshot
//
// Cadence: 3h via .github/workflows/scrape-arxiv.yml. arXiv announces
// new papers once daily (UTC evening), so 3h is overkill but matches our
// other trending sources. If we hit rate limits we'll back off to 6h.
//
// Atom parsing: arXiv returns well-structured XML with predictable tag
// shapes. We use a small regex-based extractor instead of pulling in
// fast-xml-parser; the lobsters scraper makes the same pragmatic choice.
// If arXiv changes its Atom shape (rare — stable since 2007), the parser
// fails loud and the /research page hides the section.
//
// GitHub repo cross-link: arXiv abstracts often cite a repo URL. We run
// the existing scripts/_github-repo-links extractor on each summary so
// the cross-signal layer can link papers to repos we already track.

import { writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchWithTimeout, sleep, parseRetryAfterMs } from "./_fetch-json.mjs";
import { extractGithubRepoFullNames, extractUnknownRepoCandidates } from "./_github-repo-links.mjs";
import { appendUnknownMentions } from "./_unknown-mentions-lake.mjs";
import { loadTrackedReposFromFiles } from "./_tracked-repos.mjs";
import { writeDataStore, closeDataStore } from "./_data-store-write.mjs";
import { writeSourceMetaFromOutcome } from "./_data-meta.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, "..", "data");
const TRENDING_IN = resolve(DATA_DIR, "trending.json");
const RECENT_IN = resolve(DATA_DIR, "recent-repos.json");
const OUT_PATH = resolve(DATA_DIR, "arxiv-recent.json");

const ARXIV_CATEGORIES = ["cs.AI", "cs.CL", "cs.LG", "cs.CV", "cs.MA", "stat.ML"];
const DEFAULT_MAX_RESULTS = 100;
const DEFAULT_TIMEOUT_MS = 45_000;
const RSS_TIMEOUT_MS = 30_000;
const MAX_RESULTS = parseBoundedIntegerEnv(
  "ARXIV_MAX_RESULTS",
  DEFAULT_MAX_RESULTS,
  1,
  1000,
);
const FETCH_TIMEOUT_MS = parseBoundedIntegerEnv(
  "ARXIV_TIMEOUT_MS",
  DEFAULT_TIMEOUT_MS,
  5_000,
  120_000,
);
const ENDPOINT =
  "https://export.arxiv.org/api/query?" +
  `search_query=${ARXIV_CATEGORIES.map((category) => `cat:${category}`).join("+OR+")}` +
  `&sortBy=submittedDate&sortOrder=descending&max_results=${MAX_RESULTS}`;

const USER_AGENT = "TrendingRepo/1.0 (+https://trendingrepo.com)";

function log(msg) {
  console.log(`[arxiv] ${msg}`);
}

function parseBoundedIntegerEnv(name, fallback, min, max) {
  const raw = process.env[name];
  if (!raw || raw.trim().length === 0) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

// XML-decode the small handful of entities we expect in arXiv text fields.
// (Full XML decode is overkill — arXiv's API uses a fixed set.)
function decodeXmlText(s) {
  if (!s) return "";
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

// Pull the first text content of <tag>…</tag>. Returns "" if missing.
function pickTag(xml, tag) {
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = xml.match(re);
  return m ? decodeXmlText(m[1]) : "";
}

// Pull every text content of repeated <tag>…</tag> in order.
function pickAllTags(xml, tag) {
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi");
  const out = [];
  let m;
  while ((m = re.exec(xml)) !== null) {
    out.push(decodeXmlText(m[1]));
  }
  return out;
}

// Pull every <category term="…"/> attribute.
function pickCategories(xml) {
  const re = /<category\b[^>]*\bterm="([^"]+)"/gi;
  const out = [];
  let m;
  while ((m = re.exec(xml)) !== null) {
    out.push(m[1]);
  }
  return out;
}

// Pull the <link rel="alternate" href="…"/> for the abs page, plus the
// <link title="pdf" href="…"/> for the PDF.
function pickLinks(xml) {
  const all = [];
  const re = /<link\b([^>]*)\/>/gi;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const attrs = m[1];
    const hrefM = attrs.match(/\bhref="([^"]+)"/);
    const titleM = attrs.match(/\btitle="([^"]+)"/);
    const relM = attrs.match(/\brel="([^"]+)"/);
    const typeM = attrs.match(/\btype="([^"]+)"/);
    if (hrefM) {
      all.push({
        href: hrefM[1],
        title: titleM?.[1] ?? null,
        rel: relM?.[1] ?? null,
        type: typeM?.[1] ?? null,
      });
    }
  }
  const abs = all.find((l) => l.rel === "alternate")?.href ?? null;
  const pdf =
    all.find((l) => l.title === "pdf" || l.type === "application/pdf")?.href ??
    null;
  return { abs, pdf };
}

function parseEntry(entryXml, tracked) {
  const id = pickTag(entryXml, "id"); // canonical URL form
  if (!id) return null;
  const arxivId = id.replace(/^https?:\/\/arxiv\.org\/abs\//i, "").trim();
  if (!arxivId) return null;

  const title = pickTag(entryXml, "title");
  const summary = pickTag(entryXml, "summary");
  const published = pickTag(entryXml, "published");
  const updated = pickTag(entryXml, "updated");

  // Authors are nested: <author><name>…</name></author>. Pull all <name>s
  // appearing anywhere in the entry — arXiv only uses <name> inside <author>.
  const authors = pickAllTags(entryXml, "name").slice(0, 50);
  const categories = pickCategories(entryXml);
  const { abs, pdf } = pickLinks(entryXml);

  const blob = `${title}\n${summary}`;
  const repoHits = extractGithubRepoFullNames(blob, tracked);
  const linkedRepos = Array.from(repoHits, (lower) => ({
    fullName: tracked.get(lower) ?? lower,
    matchType: "abstract",
    confidence: 1.0,
  }));

  const publishedMs = published ? Date.parse(published) : NaN;
  const updatedMs = updated ? Date.parse(updated) : NaN;

  return {
    arxivId,
    title: title.slice(0, 500),
    summary: summary.slice(0, 2000),
    authors,
    categories,
    primaryCategory: categories[0] ?? null,
    absUrl: abs ?? id,
    pdfUrl: pdf,
    publishedAt: Number.isFinite(publishedMs)
      ? new Date(publishedMs).toISOString()
      : null,
    updatedAt: Number.isFinite(updatedMs)
      ? new Date(updatedMs).toISOString()
      : null,
    linkedRepos,
  };
}

function splitEntries(xml) {
  const out = [];
  const re = /<entry\b[\s\S]*?<\/entry>/gi;
  let m;
  while ((m = re.exec(xml)) !== null) {
    out.push(m[0]);
  }
  return out;
}

function splitRssItems(xml) {
  const out = [];
  const re = /<item\b[\s\S]*?<\/item>/gi;
  let m;
  while ((m = re.exec(xml)) !== null) {
    out.push(m[0]);
  }
  return out;
}

function stripDescriptionPrefix(description) {
  return description
    .replace(/^arXiv:\S+\s+Announce Type:\s+\S+\s+Abstract:\s*/i, "")
    .trim();
}

function extractRssArxivId(itemXml, link) {
  const guid = pickTag(itemXml, "guid");
  const fromLink = link.match(/arxiv\.org\/abs\/([^?\s]+)/i)?.[1];
  if (fromLink) return fromLink;
  const fromGuid = guid.match(/oai:arXiv\.org:(\S+)/i)?.[1];
  return fromGuid ?? "";
}

function pickRssCategories(xml, fallbackCategory) {
  const re = /<category(?:\s[^>]*)?>([\s\S]*?)<\/category>/gi;
  const out = [];
  let m;
  while ((m = re.exec(xml)) !== null) {
    const category = decodeXmlText(m[1]);
    if (category) out.push(category);
  }
  return out.length > 0 ? Array.from(new Set(out)) : [fallbackCategory];
}

function parseRssItem(itemXml, fallbackCategory, tracked) {
  const title = pickTag(itemXml, "title");
  const link = pickTag(itemXml, "link");
  const arxivId = extractRssArxivId(itemXml, link);
  if (!arxivId) return null;

  const summary = stripDescriptionPrefix(pickTag(itemXml, "description"));
  const pubDate = pickTag(itemXml, "pubDate");
  const authors = pickAllTags(itemXml, "dc:creator").slice(0, 50);
  const categories = pickRssCategories(itemXml, fallbackCategory);

  const blob = `${title}\n${summary}`;
  const repoHits = extractGithubRepoFullNames(blob, tracked);
  const linkedRepos = Array.from(repoHits, (lower) => ({
    fullName: tracked.get(lower) ?? lower,
    matchType: "abstract",
    confidence: 1.0,
  }));

  const publishedMs = pubDate ? Date.parse(pubDate) : NaN;

  return {
    arxivId,
    title: title.slice(0, 500),
    summary: summary.slice(0, 2000),
    authors,
    categories,
    primaryCategory: categories[0] ?? null,
    absUrl: link || `https://arxiv.org/abs/${arxivId}`,
    pdfUrl: `https://arxiv.org/pdf/${arxivId}.pdf`,
    publishedAt: Number.isFinite(publishedMs)
      ? new Date(publishedMs).toISOString()
      : null,
    updatedAt: null,
    linkedRepos,
  };
}

async function fetchArxivAtomXml() {
  let xml = "";
  const RETRY_STATUSES = new Set([429, 500, 502, 503, 504]);
  const ATTEMPTS = 3;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    const res = await fetchWithTimeout(ENDPOINT, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/atom+xml, application/xml",
      },
      timeoutMs: FETCH_TIMEOUT_MS,
    });
    if (res.ok) {
      xml = await res.text();
      break;
    }
    if (!RETRY_STATUSES.has(res.status) || attempt === ATTEMPTS) {
      throw new Error(`arXiv API HTTP ${res.status} ${res.statusText}`);
    }
    const retryAfterMs =
      parseRetryAfterMs(res.headers.get("retry-after")) ?? 3_000 * attempt;
    log(`arXiv ${res.status} - retry ${attempt}/${ATTEMPTS - 1} in ${retryAfterMs}ms`);
    await sleep(retryAfterMs);
  }
  return xml;
}

async function fetchArxivRssPapers(tracked) {
  const byId = new Map();
  for (const category of ARXIV_CATEGORIES) {
    const url = `https://rss.arxiv.org/rss/${category}`;
    const res = await fetchWithTimeout(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/rss+xml, application/xml, text/xml",
      },
      timeoutMs: RSS_TIMEOUT_MS,
    });
    if (!res.ok) {
      log(`RSS ${category} HTTP ${res.status} ${res.statusText}`);
      continue;
    }
    const xml = await res.text();
    let parsed = 0;
    for (const itemXml of splitRssItems(xml)) {
      const paper = parseRssItem(itemXml, category, tracked);
      if (!paper || byId.has(paper.arxivId)) continue;
      byId.set(paper.arxivId, paper);
      parsed += 1;
    }
    log(`RSS ${category}: ${parsed} new papers`);
    await sleep(1_000);
  }
  return Array.from(byId.values())
    .sort((a, b) => {
      const ta = a.publishedAt ? Date.parse(a.publishedAt) : 0;
      const tb = b.publishedAt ? Date.parse(b.publishedAt) : 0;
      return tb - ta;
    })
    .slice(0, MAX_RESULTS);
}

async function main() {
  // tracked-repos load is best-effort: when no trending.json exists yet
  // (fresh checkout, fresh Vercel build), we still want to record papers,
  // just without repo cross-links.
  let tracked = new Map();
  try {
    tracked = await loadTrackedReposFromFiles({
      trendingPath: TRENDING_IN,
      recentPath: RECENT_IN,
      log,
    });
    log(`tracked repos: ${tracked.size}`);
  } catch (err) {
    log(`warn: tracked-repos load failed (${err.message ?? err}) — proceeding without cross-link`);
  }

  const fetchedAt = new Date().toISOString();

  // arXiv occasionally 429s; their TOS asks for 3s between requests, so we
  // retry up to 3 times honoring Retry-After when set.
  log(`query max_results=${MAX_RESULTS} timeout_ms=${FETCH_TIMEOUT_MS}`);
  let sourceLabel = `export.arxiv.org/api/query (${ARXIV_CATEGORIES.join(" + ")})`;
  let papers = [];
  try {
    const xml = await fetchArxivAtomXml();
    if (!xml) {
      throw new Error("arXiv API returned empty body after retries");
    }

    const entries = splitEntries(xml);
    if (entries.length === 0) {
      throw new Error("no <entry> blocks in arXiv response - API shape changed?");
    }

    for (const entry of entries) {
      const norm = parseEntry(entry, tracked);
      if (norm) papers.push(norm);
    }
  } catch (err) {
    log(`API path failed (${err.message ?? err}); trying rss.arxiv.org fallback`);
    sourceLabel = `rss.arxiv.org/rss (${ARXIV_CATEGORIES.join(" + ")})`;
    papers = await fetchArxivRssPapers(tracked);
  }

  if (papers.length === 0) {
    throw new Error("no papers parsed from arXiv response");
  }

  const linkedCount = papers.filter((p) => p.linkedRepos.length > 0).length;

  const payload = {
    fetchedAt,
    source: sourceLabel,
    count: papers.length,
    linkedRepoCount: linkedCount,
    papers,
  };

  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(OUT_PATH, JSON.stringify(payload, null, 2) + "\n", "utf8");
  const redis = await writeDataStore("arxiv-recent", payload);

  log(`wrote ${OUT_PATH} [redis: ${redis.source}]`);
  log(`  ${papers.length} recent papers; ${linkedCount} cross-link to tracked repos`);
  log(`  top 3: ${papers.slice(0, 3).map((p) => p.arxivId).join(", ")}`);

  // F3 unknown-mentions lake — every github URL we found in any abstract,
  // even repos we don't yet track. Drives the discovery promotion job.
  const unknownsAccumulator = new Set();
  for (const paper of papers) {
    const blob = `${paper.title ?? ""} ${paper.summary ?? ""}`;
    for (const u of extractUnknownRepoCandidates(blob, null)) {
      unknownsAccumulator.add(u);
    }
  }
  if (unknownsAccumulator.size > 0) {
    await appendUnknownMentions(
      Array.from(unknownsAccumulator, (fullName) => ({ source: "arxiv", fullName })),
    );
    log(`  unknown candidates: ${unknownsAccumulator.size} (lake: data/unknown-mentions.jsonl)`);
  }
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;
const isDirectRun = invokedPath
  ? fileURLToPath(import.meta.url) === invokedPath
  : false;

if (isDirectRun) {
  const startedAt = Date.now();
  main()
    .then(async () => {
      try {
        await writeSourceMetaFromOutcome({
          source: "arxiv",
          count: 1,
          durationMs: Date.now() - startedAt,
        });
      } catch (metaErr) {
        console.error("[meta] arxiv.json write failed:", metaErr);
      }
    })
    .catch(async (err) => {
      console.error("scrape-arxiv failed:", err.message ?? err);
      try {
        await writeSourceMetaFromOutcome({
          source: "arxiv",
          count: 0,
          durationMs: Date.now() - startedAt,
          error: err,
        });
      } catch (metaErr) {
        console.error("[meta] arxiv.json error-write failed:", metaErr);
      }
      process.exitCode = 1;
    })
    .finally(async () => {
      await closeDataStore();
    });
}

export { parseEntry, splitEntries };
