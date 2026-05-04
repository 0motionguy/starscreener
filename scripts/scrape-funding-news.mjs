#!/usr/bin/env node
/**
 * Funding News Scraper — Phase 1 Signal Radar
 *
 * Fetches TechCrunch funding RSS feed, extracts headlines, attempts
 * regex-based funding extraction, and writes data/funding-news.json.
 *
 * Usage:
 *   node scripts/scrape-funding-news.mjs
 *   node scripts/scrape-funding-news.mjs --sources techcrunch,venturebeat
 *   node scripts/scrape-funding-news.mjs --output .tmp/funding-preview.json
 */

import { readFile, writeFile, mkdir } from "fs/promises";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import pLimit from "p-limit";
import { fetchWithTimeout, sleep } from "./_fetch-json.mjs";
import { fetchArticleData } from "./_funding-article.mjs";
import { writeDataStore, closeDataStore } from "./_data-store-write.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "..");

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const DATA_DIR = resolve(process.cwd(), "data");
const OUT_PATH = resolve(DATA_DIR, "funding-news.json");
const WINDOW_DAYS = 21;
const MAX_AGE_MS = WINDOW_DAYS * 24 * 60 * 60 * 1000;
const USER_AGENT =
  "Mozilla/5.0 (compatible; TrendingRepoBot/1.0; +https://trendingrepo.com)";

const RSS_FEEDS = {
  techcrunch: "https://techcrunch.com/category/startups/feed/",
  venturebeat: "https://venturebeat.com/feed/",
  sifted: "https://sifted.eu/feed",
  arstechnica: "https://arstechnica.com/feed/",
  techeu: "https://tech.eu/feed/",
  pymnts: "https://www.pymnts.com/feed/",
  bbc: "https://feeds.bbci.co.uk/news/technology/rss.xml",
  wired: "https://www.wired.com/feed/",

};

// ---------------------------------------------------------------------------
// RSS parsing (lightweight regex — same pattern as Twitter collector)
// ---------------------------------------------------------------------------

function decodeHtmlEntities(value) {
  return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity) => {
    const named = {
      amp: "&",
      lt: "<",
      gt: ">",
      quot: '"',
      apos: "'",
      nbsp: " ",
    };
    if (named[entity]) return named[entity];
    if (entity.startsWith("#x")) {
      const code = Number.parseInt(entity.slice(2), 16);
      if (Number.isFinite(code)) return String.fromCharCode(code);
    }
    if (entity.startsWith("#")) {
      const code = Number.parseInt(entity.slice(1), 10);
      if (Number.isFinite(code)) return String.fromCharCode(code);
    }
    return match;
  });
}

function stripHtml(value) {
  return decodeHtmlEntities(
    value
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

function extractTag(block, tag) {
  const pattern = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i");
  const match = block.match(pattern);
  if (!match) return null;
  const raw = match[1] ?? "";
  const cdata = raw.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/i);
  return decodeHtmlEntities(cdata?.[1] ?? raw).trim();
}

function parseRssItems(xml, sourceUrl) {
  const items = xml.match(/<item\b[\s\S]*?<\/item>/gi) ?? [];
  const posts = [];

  for (const item of items) {
    const title = extractTag(item, "title") ?? "";
    const link = extractTag(item, "link") ?? extractTag(item, "guid") ?? "";
    const description = extractTag(item, "description") ?? "";
    const pubDate = extractTag(item, "pubDate") ?? "";

    if (!title || !link) continue;

    const headline = stripHtml(title);
    const desc = stripHtml(description);
    // Open-source-focused funding rounds (especially in dev tools) often link
    // back to a GitHub repo in the headline or RSS body. Pass `null` to
    // collect every owner/repo we see — discovery signal, not just tracked
    // repos. Downstream consumers can intersect with the tracked set when
    // they need to attribute mentions to entity profiles.
    const repos = Array.from(
      extractGithubRepoFullNames(`${headline} ${desc}`, null),
    );

    posts.push({
      headline,
      description: desc,
      sourceUrl: link,
      publishedAt: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
      ...(repos.length > 0 ? { repos } : {}),
    });
  }

  return posts;
}

// ---------------------------------------------------------------------------
// Seed data — high-quality known funding rounds (supplements RSS)
// ---------------------------------------------------------------------------

const SEEDS_PATH = resolve(PROJECT_ROOT, "data/funding-seeds.json");
const LOGOS_PATH = resolve(PROJECT_ROOT, "data/company-logos.json");

async function loadSeedSignals() {
  return JSON.parse(await readFile(SEEDS_PATH, "utf8"));
}
async function loadKnownCompanyLogos() {
  return JSON.parse(await readFile(LOGOS_PATH, "utf8"));
}

// SEEDS moved to data/funding-seeds.json (SCR-03). Loaded via loadSeedSignals().
;

// ---------------------------------------------------------------------------
// Known company → logo source map (GitHub avatar preferred, then domain)
// ---------------------------------------------------------------------------

// LOGOS moved to data/company-logos.json (SCR-03). Cached after first load
// so the lookup helpers stay sync — main() awaits primeKnownCompanyLogos()
// before iterating.
let _knownCompanyLogos = null;

async function primeKnownCompanyLogos() {
  if (_knownCompanyLogos !== null) return;
  _knownCompanyLogos = await loadKnownCompanyLogos();
}

function getKnownCompanyLogoUrl(companyName) {
  if (!companyName) return null;
  const map = _knownCompanyLogos ?? {};
  const lower = companyName.toLowerCase().trim();
  const info = map[lower] ?? map[lower.split(/\s+/)[0]];
  if (!info) return null;
  if (info.github) return `https://github.com/${info.github}.png`;
  return `https://logo.clearbit.com/${info.domain}`;
}

function getKnownCompanyDomain(companyName) {
  if (!companyName) return null;
  const map = _knownCompanyLogos ?? {};
  const lower = companyName.toLowerCase().trim();
  const info = map[lower] ?? map[lower.split(/\s+/)[0]];
  return info?.domain ?? null;
}

// ---------------------------------------------------------------------------
// Funding extraction (mirrors src/lib/funding/extract.ts in plain JS)
// ---------------------------------------------------------------------------

const ROUND_PATTERNS = [
  { type: "pre-seed", patterns: [/\bpre[-\s]?seed\b/i, /\bpreseed\b/i] },
  { type: "seed", patterns: [/\bseed\b/i] },
  { type: "series-a", patterns: [/\bseries\s*A\b/i] },
  { type: "series-b", patterns: [/\bseries\s*B\b/i] },
  { type: "series-c", patterns: [/\bseries\s*C\b/i] },
  { type: "series-d-plus", patterns: [/\bseries\s*[D-Z]\b/i] },
  { type: "growth", patterns: [/\bgrowth\b/i, /\blate[-\s]?stage\b/i] },
  { type: "ipo", patterns: [/\bIPO\b/i] },
  { type: "acquisition", patterns: [/\bacquired\b/i, /\bacquisition\b/i] },
];

const AMOUNT_PATTERN =
  /\$\s*([\d,.]+)\s*([KMBT]?)\b|\b([\d,.]+)\s*(million|billion|mn|m|bn|b)\s*(?:dollar)?s?\b/gi;

const MULTIPLIERS = {
  k: 1_000,
  m: 1_000_000,
  mn: 1_000_000,
  million: 1_000_000,
  b: 1_000_000_000,
  bn: 1_000_000_000,
  billion: 1_000_000_000,
};

function normalizeAmount(value, suffix) {
  const cleanValue = value.replace(/,/g, "");
  const numeric = Number.parseFloat(cleanValue);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  const multiplier = MULTIPLIERS[suffix.toLowerCase().trim()] ?? 1;
  const amount = numeric * multiplier;
  let display;
  if (amount >= 1_000_000_000) {
    display = `$${(amount / 1_000_000_000).toFixed(amount % 1_000_000_000 === 0 ? 0 : 1)}B`;
  } else if (amount >= 1_000_000) {
    display = `$${(amount / 1_000_000).toFixed(amount % 1_000_000 === 0 ? 0 : 1)}M`;
  } else if (amount >= 1_000) {
    display = `$${(amount / 1_000).toFixed(0)}K`;
  } else {
    display = `$${amount.toLocaleString()}`;
  }
  return { amount, display };
}

function extractAmount(text) {
  const matches = Array.from(text.matchAll(AMOUNT_PATTERN));
  if (matches.length === 0) return null;

  // Find all valuation word positions
  const valuationMatches = Array.from(text.matchAll(/\bvaluation\b/gi));

  // First pass: identify all amounts and flag valuations
  const candidates = [];
  for (const match of matches) {
    const value = match[1] ?? match[3] ?? "";
    const suffix = match[2] ?? match[4] ?? "";
    const normalized = normalizeAmount(value, suffix);
    if (!normalized) continue;

    const matchEnd = (match.index ?? 0) + match[0].length;

    // Check if this amount is immediately followed by "valuation"
    let isValuation = false;
    for (const v of valuationMatches) {
      const dist = v.index - matchEnd;
      if (dist >= 0 && dist <= 5) {
        isValuation = true;
        break;
      }
    }

    // Fallback: old context-based heuristic for less clear cases
    if (!isValuation) {
      const context = text.slice(
        Math.max(0, (match.index ?? 0) - 40),
        (match.index ?? 0) + 40,
      );
      const hasValuationWord = /\bvaluation\b/i.test(context);
      const hasRaiseWord = /\braise|raising|funding|round|invest|closes|secured\b/i.test(context);
      isValuation = hasValuationWord && !hasRaiseWord;
    }

    candidates.push({
      ...normalized,
      raw: match[0],
      isValuation,
    });
  }

  if (candidates.length === 0) return null;

  // If there's a non-valuation amount, pick the largest non-valuation
  const nonValuations = candidates.filter((c) => !c.isValuation);
  if (nonValuations.length > 0) {
    return nonValuations.reduce((best, c) => (c.amount > best.amount ? c : best));
  }

  // All amounts are valuations — return the largest (best guess)
  return candidates.reduce((best, c) => (c.amount > best.amount ? c : best));
}

function extractRoundType(text) {
  for (const { type, patterns } of ROUND_PATTERNS) {
    for (const pattern of patterns) {
      if (pattern.test(text)) return type;
    }
  }
  return null;
}

const COMPANY_STOP_WORDS = new Set([
  "raises", "raised", "secures", "secured", "gets", "got", "lands", "closed", "closes",
  "announces", "announce", "funding", "round", "investment", "million", "billion",
  "startup", "company", "ai", "the", "and", "for", "from", "with", "in",
  "alumni", "founders", "executives", "team", "employees", "founder",
]);

function stripCompanyPrefix(name) {
  const prefixes = [
    /^ai[-\s]powered\s+/i,
    /^ai\s+/i,
    /^fintech\s+/i,
    /^healthtech\s+/i,
    /^proptech\s+/i,
    /^edtech\s+/i,
    /^climate\s+/i,
    /^crypto\s+/i,
    /^blockchain\s+/i,
    /^quantum\s+/i,
    /^space\s+/i,
    /^defense\s+/i,
    /^enterprise\s+/i,
    /^consumer\s+/i,
    /^b2b\s+/i,
    /^b2c\s+/i,
    /^the\s+/i,
  ];
  let result = name;
  for (const prefix of prefixes) {
    result = result.replace(prefix, "");
  }
  return result.trim();
}

function extractCompanyName(headline) {
  // Strip common prefixes that aren't company names
  let cleanHeadline = headline
    .replace(/^\s*(?:sources?[:\s]+|report[:\s]+|breaking[:\s]+)/i, "")
    .replace(/^\s*ex[-–]/i, "");

  // Strip trailing "in talks to" / "is in talks to" / "in discussions to"
  cleanHeadline = cleanHeadline.replace(/\s+in\s+(?:talks|discussions)\s+to\s+.*$/i, "");

  // Strip age prefixes like "Four-month-old", "Two-year-old"
  cleanHeadline = cleanHeadline.replace(/^\s*\w+-\w+-old\s+/i, "");

  // Pattern: "Company raises $X..."
  const patterns = [
    // Priority: "X alumni raise $X for Company" → Company is the funded entity
    /(?:alumni|founders|executives)\s+(?:raise|raised)\s+.*?(?:for|to\s+build)\s+([A-Z][A-Za-z0-9\s&\-\.]+?)(?:\s+(?:to|for|with)|\s*$)/i,
    /^([A-Z][A-Za-z0-9\s&\-\.]+?)\s+(?:raises?|secures?|gets?|lands?|closes?|closed)\b/i,
    /^([A-Z][A-Za-z0-9\s&\-\.]+?)\s+(?:announces?|announced)\b/i,
    /^([A-Z][A-Za-z0-9\s&\-\.]+?)\s+(?:has\s+raised)\b/i,
    // Pattern: "...raise X for Company" or "...raises X to build..."
    /(?:raise[d-s]?\s+\$?[\d.,]+\s*(?:[KMB]|million|billion)?\s+(?:for|to\s+build)\s+)([A-Z][A-Za-z0-9\s&\-\.]+?)(?:\s+(?:to|for|with)|\s*$)/i,
  ];
  for (const pattern of patterns) {
    const match = cleanHeadline.match(pattern);
    if (match) {
      const candidate = stripCompanyPrefix(match[1].trim());
      if (candidate.length >= 2 && !COMPANY_STOP_WORDS.has(candidate.toLowerCase())) {
        return candidate;
      }
    }
  }

  // Fallback: first 1-3 capitalized words, but skip stop words
  const words = cleanHeadline.match(/^([A-Z][a-zA-Z0-9]*(?:[-'][A-Za-z]+)*(?:\s+[A-Z][a-zA-Z0-9]*(?:[-'][A-Za-z]+)*){0,2})/);
  if (words) {
    const candidate = stripCompanyPrefix(words[1].trim());
    if (candidate.length >= 2 && !COMPANY_STOP_WORDS.has(candidate.toLowerCase())) {
      return candidate;
    }
  }
  return null;
}

const TAG_KEYWORDS = [
  { tag: "ai", keywords: ["ai", "artificial intelligence", "machine learning", "ml", "llm", "generative ai", "agent", "mcp"] },
  { tag: "fintech", keywords: ["fintech", "payments", "banking", "crypto", "blockchain", "defi", "web3"] },
  { tag: "healthcare", keywords: ["healthcare", "health", "biotech", "medical", "pharma", "drug"] },
  { tag: "climate", keywords: ["climate", "carbon", "clean energy", "sustainability", "green"] },
  { tag: "europe", keywords: ["european", "europe", "uk", "germany", "france", "netherlands", "sweden", "berlin", "london", "paris"] },
  { tag: "india", keywords: ["india", "indian", "bangalore", "mumbai", "delhi"] },
  { tag: "hardware", keywords: ["hardware", "robotics", "semiconductor", "chip", "iot", "drone"] },
  { tag: "saas", keywords: ["saas", "enterprise", "b2b", "developer tools", "devtools"] },
  { tag: "consumer", keywords: ["consumer", "social", "marketplace", "e-commerce", "retail"] },
  { tag: "defense", keywords: ["defense", "military", "aerospace", "space", "satellite"] },
];

function extractTags(headline, description) {
  const text = `${headline} ${description}`.toLowerCase();
  const tags = [];
  for (const { tag, keywords } of TAG_KEYWORDS) {
    for (const keyword of keywords) {
      if (text.includes(keyword.toLowerCase())) {
        tags.push(tag);
        break;
      }
    }
  }
  return tags;
}

function extractFunding(headline, description) {
  const combined = `${headline} ${description}`;
  const companyName = extractCompanyName(headline);
  const amount = extractAmount(combined);
  const roundType = extractRoundType(combined);

  if (!companyName && !amount && !roundType) return null;

  let confidence = "none";
  if (companyName && amount && roundType) confidence = "high";
  else if ((companyName && amount) || (companyName && roundType)) confidence = "medium";
  else if (companyName || amount) confidence = "low";

  // Try known logo / domain
  const companyLogoUrl = getKnownCompanyLogoUrl(companyName);
  const companyWebsite = getKnownCompanyDomain(companyName) ? `https://${getKnownCompanyDomain(companyName)}` : null;

  return {
    companyName: companyName ?? "Unknown",
    companyWebsite,
    companyLogoUrl,
    amount: amount?.amount ?? null,
    amountDisplay: amount?.display ?? "Undisclosed",
    currency: "USD",
    roundType: roundType ?? "undisclosed",
    investors: [],
    investorsEnriched: [],
    confidence,
  };
}

// ---------------------------------------------------------------------------
// Scraping
// ---------------------------------------------------------------------------

async function fetchRssFeed(url, sourceName) {
  console.log(`[funding] fetching ${sourceName}: ${url}`);
  try {
    const res = await fetchWithTimeout(url, {
      timeoutMs: 20_000,
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/rss+xml,application/xml,*/*;q=0.8",
      },
    });
    if (!res.ok) {
      console.error(`[funding] ${sourceName} HTTP ${res.status}`);
      return [];
    }
    const xml = await res.text();
    const items = parseRssItems(xml, url);
    console.log(`[funding] ${sourceName}: ${items.length} items`);
    return items;
  } catch (err) {
    console.error(`[funding] ${sourceName} failed: ${err.message}`);
    return [];
  }
}

function createSignalId(headline, sourceUrl) {
  // Deterministic ID from headline + source domain
  const domain = sourceUrl.replace(/^https?:\/\//, "").split("/")[0] ?? "unknown";
  const hash = Array.from(headline).reduce((h, c) => ((h * 31 + c.charCodeAt(0)) >>> 0), 0);
  return `${domain}-${hash.toString(16).slice(0, 8)}`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  // SCR-03: prime the cached company-logos map before any sync getter runs.
  await primeKnownCompanyLogos();

  const args = process.argv.slice(2);
  const outputFlag = args.find((a) => a.startsWith("--output="));
  const outputPath = outputFlag ? resolve(outputFlag.split("=")[1]) : OUT_PATH;
  const sourcesFlag = args.find((a) => a.startsWith("--sources="));
  const requestedSources = sourcesFlag
    ? sourcesFlag.split("=")[1].split(",")
    : Object.keys(RSS_FEEDS);

  const discoveredAt = new Date().toISOString();
  const allSignals = [];
  const seenIds = new Set();

  for (const sourceName of requestedSources) {
    const url = RSS_FEEDS[sourceName];
    if (!url) {
      console.warn(`[funding] unknown source: ${sourceName}`);
      continue;
    }

    const items = await fetchRssFeed(url, sourceName);
    await sleep(500); // be polite between sources

    for (const item of items) {
      // Skip old items
      const itemDate = Date.parse(item.publishedAt);
      if (Number.isFinite(itemDate) && Date.now() - itemDate > MAX_AGE_MS) {
        continue;
      }

      // Only keep funding-related headlines
      const fundingKeywords =
        /\braises?\b|\braised\b|\bsecures?\b|\bsecured\b|\bfunding\b|\binvestment\b|\bround\b|\bmillion\b|\bbillion\b|\bacquired\b|\bacquisition\b/i;
      if (!fundingKeywords.test(item.headline)) {
        continue;
      }

      const id = createSignalId(item.headline, item.sourceUrl);
      if (seenIds.has(id)) continue;
      seenIds.add(id);

      const extracted = extractFunding(item.headline, item.description);
      const tags = extractTags(item.headline, item.description);

      // Skip low-quality extractions
      if (extracted) {
        const badNames = /^(the\s|fintech\b|sources\b|report\b|breaking\b|scoop\b|ai\s+startups|billionaire|cathie\s+wood|creandum\s+partner|alumni\b)/i;
        if (badNames.test(extracted.companyName)) {
          continue;
        }
      }

      allSignals.push({
        id,
        headline: item.headline,
        description: item.description,
        sourceUrl: item.sourceUrl,
        sourcePlatform: sourceName,
        publishedAt: item.publishedAt,
        discoveredAt,
        extracted,
        tags,
      });
    }
  }

  // Merge seed signals (deduplicate by ID). Loaded from
  // data/funding-seeds.json (SCR-03).
  const seedSignals = await loadSeedSignals();
  for (const seed of seedSignals) {
    if (!seenIds.has(seed.id)) {
      seenIds.add(seed.id);
      allSignals.push({ ...seed, discoveredAt });
    }
  }

  // -------------------------------------------------------------------------
  // Article enrichment (optional — fetches article bodies for investor data)
  // -------------------------------------------------------------------------
  const enrichFlag = args.includes("--enrich");
  if (enrichFlag) {
    const enrichLimit = pLimit(3); // max 3 concurrent article fetches
    const signalsToEnrich = allSignals.filter((s) => s.extracted !== null);
    console.log(`[funding] enriching ${signalsToEnrich.length} signals from article bodies...`);

    let enrichedCount = 0;
    await Promise.all(
      signalsToEnrich.map((signal) =>
        enrichLimit(async () => {
          const companyName = signal.extracted.companyName;
          const result = await fetchArticleData(signal.sourceUrl, companyName);
          if (!result.ok) return;

          enrichedCount++;

          // Update company website
          if (result.website) {
            signal.extracted.companyWebsite = result.website;
          }

          // Update logo URL — from article, known map, or fallback
          if (result.logoUrl) {
            signal.extracted.companyLogoUrl = result.logoUrl;
          } else {
            const logoUrl = getKnownCompanyLogoUrl(signal.extracted.companyName);
            if (logoUrl) {
              signal.extracted.companyLogoUrl = logoUrl;
            }
            const knownDomain = getKnownCompanyDomain(signal.extracted.companyName);
            if (knownDomain) {
              signal.extracted.companyWebsite = `https://${knownDomain}`;
            }
          }

          // Update investors if found
          if (result.investors.length > 0) {
            const existingNames = new Set(
              signal.extracted.investors.map((n) => n.toLowerCase()),
            );
            for (const inv of result.investors) {
              if (!existingNames.has(inv.name.toLowerCase())) {
                signal.extracted.investors.push(inv.name);
                signal.extracted.investorsEnriched.push({
                  name: inv.name,
                  isKnown: inv.isKnown,
                  confidence: inv.confidence,
                });
                existingNames.add(inv.name.toLowerCase());
              }
            }
          }

          // Better company name from article if current one looks weak
          if (
            signal.extracted.confidence === "low" &&
            result.articleText
          ) {
            const fromArticle = extractCompanyNameFromArticle(
              result.articleText,
              companyName,
            );
            if (fromArticle && fromArticle.length > companyName.length) {
              signal.extracted.companyName = fromArticle;
            }
          }
        }),
      ),
    );
    console.log(`[funding] enriched ${enrichedCount} signals`);
  }

  // Sort newest first
  allSignals.sort((a, b) => {
    const ta = Date.parse(a.publishedAt);
    const tb = Date.parse(b.publishedAt);
    return (Number.isFinite(tb) ? tb : 0) - (Number.isFinite(ta) ? ta : 0);
  });

  const payload = {
    fetchedAt: discoveredAt,
    source: "funding-news-scraper",
    windowDays: WINDOW_DAYS,
    signals: allSignals,
  };

  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(outputPath, JSON.stringify(payload, null, 2) + "\n", "utf8");

  // Dual-write: also push to data-store so live readers see fresh data without
  // waiting for a deploy. Only mirror to Redis when the writer is targeting
  // the canonical OUT_PATH — preview/test outputs (--output=...) stay local.
  let redisInfo = "";
  if (outputPath === OUT_PATH) {
    const redisResult = await writeDataStore("funding-news", payload);
    redisInfo = ` [redis: ${redisResult.source}]`;
  }

  const extractedCount = allSignals.filter((s) => s.extracted !== null).length;
  const enrichedCount = allSignals.filter(
    (s) => s.extracted?.companyLogoUrl || s.extracted?.investorsEnriched?.length,
  ).length;
  console.log(
    `[funding] wrote ${allSignals.length} signals (${extractedCount} with extraction, ${enrichedCount} enriched) to ${outputPath}${redisInfo}`,
  );

  // F3 unknown-mentions lake — every github URL surfaced in funding articles
  // (headlines + descriptions) gets fed to the promotion-job pipeline.
  // OSS-funding rounds often mention the funded repo by URL.
  const unknownsAccumulator = new Set();
  for (const signal of allSignals) {
    const blob = `${signal.headline ?? ""} ${signal.description ?? ""}`;
    for (const u of extractUnknownRepoCandidates(blob, null)) {
      unknownsAccumulator.add(u);
    }
  }
  if (unknownsAccumulator.size > 0) {
    await appendUnknownMentions(
      Array.from(unknownsAccumulator, (fullName) => ({ source: "funding-news", fullName })),
    );
    console.log(`[funding] lake: ${unknownsAccumulator.size} candidates → data/unknown-mentions.jsonl`);
  }
}

// Try to find a better company name from article text
function extractCompanyNameFromArticle(text, currentName) {
  // Look for patterns like "[Company], a [description] company,"
  const patterns = [
    /([A-Z][A-Za-z0-9\s&\.]{2,50}?),\s+a\s+[^,]+?company/g,
    /([A-Z][A-Za-z0-9\s&\.]{2,50}?)\s+is\s+a\s+/g,
    /([A-Z][A-Za-z0-9\s&\.]{2,50}?)\s+has\s+raised/g,
  ];

  for (const pattern of patterns) {
    const matches = Array.from(text.matchAll(pattern));
    for (const match of matches) {
      const candidate = match[1].trim();
      if (
        candidate.length >= 3 &&
        candidate.toLowerCase().includes(currentName.toLowerCase().slice(0, 4))
      ) {
        return candidate;
      }
    }
  }
  return null;
}

// Guard so tests can import without auto-running
if (process.argv[1] && process.argv[1].includes("scrape-funding-news")) {
  main()
    .catch((err) => {
      console.error("[funding] fatal:", err);
      process.exitCode = 1;
    })
    .finally(async () => {
      await closeDataStore();
    });
}

export {
  extractAmount,
  extractRoundType,
  extractCompanyName,
  extractTags,
  extractFunding,
  parseRssItems,
};
