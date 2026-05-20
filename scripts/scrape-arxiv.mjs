#!/usr/bin/env node
// Scrape arXiv for recent CS-AI/CL/LG/CV papers.
//
// arXiv's public API (Atom XML) lets us pull recent submissions in
// specific categories without auth. Their TOS asks for a 3-second gap
// between requests; a single fetch is fine. We do one query covering
// cs.AI, cs.CL, cs.LG (the three disciplines the /research placeholder
// already promises).
//
// Endpoint:
//   https://export.arxiv.org/api/query?
//     search_query=cat:cs.AI
//     &sortBy=submittedDate&sortOrder=descending&max_results=50
// We fan out by category instead of one large OR query because arXiv
// currently 429s the broad OR request from GitHub-hosted runners.
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
import { writeDataStore, verifyMetaLanded, closeDataStore } from "./_data-store-write.mjs";
import { writeSourceMetaFromOutcome } from "./_data-meta.mjs";
import { runAsRegisteredSource } from "./_source-script-runner.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, "..", "data");
const TRENDING_IN = resolve(DATA_DIR, "trending.json");
const RECENT_IN = resolve(DATA_DIR, "recent-repos.json");
const OUT_PATH = resolve(DATA_DIR, "arxiv-recent.json");

const CATEGORIES = ["cs.AI", "cs.CL", "cs.LG", "cs.CV"];
const CATEGORY_MAX_RESULTS = 50;
const MAX_PAPERS = 200;
// GitHub-hosted egress can still trip arXiv's edge limiter at 3s gaps.
const CATEGORY_REQUEST_GAP_MS = 20_000;

const USER_AGENT = "TrendingRepo/1.0 (+https://trendingrepo.com)";

function log(msg) {
  console.log(`[arxiv] ${msg}`);
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

function buildEndpoint(category) {
  const params = new URLSearchParams({
    search_query: `cat:${category}`,
    sortBy: "submittedDate",
    sortOrder: "descending",
    max_results: String(CATEGORY_MAX_RESULTS),
  });
  return `https://export.arxiv.org/api/query?${params.toString()}`;
}

async function fetchArxivXml(endpoint, label) {
  const RETRY_STATUSES = new Set([429, 500, 502, 503, 504]);
  const ATTEMPTS = 4;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    const res = await fetchWithTimeout(endpoint, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/atom+xml, application/xml",
      },
      timeoutMs: 30_000,
    });
    if (res.ok) {
      return res.text();
    }
    if (!RETRY_STATUSES.has(res.status) || attempt === ATTEMPTS) {
      throw new Error(`arXiv API HTTP ${res.status} ${res.statusText} (${label})`);
    }
    const retryAfterMs =
      parseRetryAfterMs(res.headers.get("retry-after")) ?? CATEGORY_REQUEST_GAP_MS * attempt;
    log(`arXiv ${label} ${res.status} - retry ${attempt}/${ATTEMPTS - 1} in ${retryAfterMs}ms`);
    await sleep(retryAfterMs);
  }
  throw new Error(`arXiv API returned empty body after retries (${label})`);
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

  const papers = [];
  const seenPapers = new Set();
  const fetchedCategories = [];
  const failedCategories = [];
  for (const [index, category] of CATEGORIES.entries()) {
    if (index > 0) {
      await sleep(CATEGORY_REQUEST_GAP_MS);
    }
    let xml;
    try {
      xml = await fetchArxivXml(buildEndpoint(category), category);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      failedCategories.push({ category, error: message });
      log(`warn: ${category} failed (${message}) - continuing with other categories`);
      continue;
    }
    const entries = splitEntries(xml);
    if (entries.length === 0) {
      const message = `no <entry> blocks in arXiv response for ${category} - API shape changed?`;
      failedCategories.push({ category, error: message });
      log(`warn: ${message}`);
      continue;
    }
    fetchedCategories.push(category);
    log(`${category}: ${entries.length} entries`);
    for (const entry of entries) {
      const norm = parseEntry(entry, tracked);
      if (!norm || seenPapers.has(norm.arxivId)) continue;
      seenPapers.add(norm.arxivId);
      papers.push(norm);
    }
  }

  if (papers.length === 0) {
    const failures = failedCategories
      .map((failure) => `${failure.category}: ${failure.error}`)
      .join("; ");
    throw new Error(`no papers parsed from arXiv response${failures ? ` (${failures})` : ""}`);
  }
  papers.sort((a, b) => {
    const aTime = Date.parse(a.publishedAt ?? a.updatedAt ?? "");
    const bTime = Date.parse(b.publishedAt ?? b.updatedAt ?? "");
    return (Number.isFinite(bTime) ? bTime : 0) - (Number.isFinite(aTime) ? aTime : 0);
  });
  const recentPapers = papers.slice(0, MAX_PAPERS);

  const linkedCount = recentPapers.filter((p) => p.linkedRepos.length > 0).length;

  const payload = {
    fetchedAt,
    source: `export.arxiv.org/api/query (${fetchedCategories.join(", ")})`,
    fetchedCategories,
    failedCategories,
    count: recentPapers.length,
    linkedRepoCount: linkedCount,
    papers: recentPapers,
  };

  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(OUT_PATH, JSON.stringify(payload, null, 2) + "\n", "utf8");
  const redis = await writeDataStore("arxiv-recent", payload);
  if (redis.source === "redis") {
    await verifyMetaLanded("arxiv-recent", redis.writtenAt);
  }

  log(`wrote ${OUT_PATH} [redis: ${redis.source}]`);
  log(`  ${recentPapers.length} recent papers; ${linkedCount} cross-link to tracked repos`);
  log(`  top 3: ${recentPapers.slice(0, 3).map((p) => p.arxivId).join(", ")}`);

  // F3 unknown-mentions lake — every github URL we found in any abstract,
  // even repos we don't yet track. Drives the discovery promotion job.
  const unknownsAccumulator = new Set();
  for (const paper of recentPapers) {
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
  // Move 1 / Phase 4: runAsRegisteredSource wraps main() purely for
  // instrumentation — collection logic untouched.
  const startedAt = Date.now();
  runAsRegisteredSource({
    sourceId: "arxiv",
    run: main,
  })
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
