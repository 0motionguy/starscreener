#!/usr/bin/env node
/**
 * SEC EDGAR Form D fetcher — AI-funding ground truth.
 *
 * Every US private equity round files Form D within 15 days. EDGAR's
 * full-text search API is free, no auth, no rate limit beyond a polite
 * 10 req/sec ceiling that we sit well under. This is the closest thing
 * to "ground truth" for US AI funding — captures every round journalists
 * never write about (the long tail beats headline coverage 10:1 on
 * volume).
 *
 * USAGE
 *   node scripts/scrape-sec-form-d.mjs
 *   node scripts/scrape-sec-form-d.mjs --output .tmp/sec-form-d-preview.json
 *
 * OUTPUT
 *   data/funding-news-sec.json — FundingNewsFile-shaped payload, page
 *   merger in src/lib/funding-news.ts pulls it via the funding-news-sec
 *   Redis slug (file mirror by writeDataStore).
 *
 * RATE LIMIT
 *   SEC requires a User-Agent string identifying the bot operator.
 *   We send the same UA pattern as the rest of our collectors. Sleep
 *   100ms between filing-detail fetches (10 req/sec ceiling).
 *
 * SHAPE
 *   Each Form D entry becomes a FundingSignal:
 *     id              `sec-form-d-${accession}`
 *     headline        "{issuerName} filed Form D"
 *     description     atom-summary text (truncated)
 *     sourceUrl       EDGAR filing detail URL
 *     sourcePlatform  "sec-form-d"
 *     publishedAt     filing date (ISO)
 *     extracted       { companyName, ... amount=null }
 *     tags            ["sec", "form-d", "ai"]
 *
 * AI FILTERING
 *   Uses the same AI_KEYWORDS regex as the worker fetcher so the gate
 *   is consistent across pipelines. A filing matches if ANY of:
 *     - issuer name passes AI_KEYWORDS
 *     - the EDGAR full-text search hit was on an AI query (q=AI ...)
 *   The latter is implicit since we drive the fetch from
 *   `q=artificial+intelligence&forms=D` — every hit already mentions
 *   "artificial intelligence" somewhere in the filing.
 */

import { resolve } from "path";
import { writeFileSync, mkdirSync, existsSync } from "fs";

import { writeDataStore } from "./_data-store-write.mjs";

const PROJECT_ROOT = resolve(process.cwd());
const DATA_DIR = resolve(PROJECT_ROOT, "data");
const OUT_PATH = resolve(DATA_DIR, "funding-news-sec.json");

const USER_AGENT =
  "TrendingRepo Bot ai-funding-radar contact@trendingrepo.com";

// Window of filings to ingest. Form D's 15-day deadline + cron runs
// every 2h means a 30-day window catches everything multiple times
// (we dedupe by accession). Generous to absorb cron gaps.
const WINDOW_DAYS = 30;
const MAX_HITS_PER_QUERY = 200;

// EDGAR's full-text search only matches single tokens reliably — phrase
// queries (with quotes) require the EXACT string to appear as indexed
// text, which Form D filings rarely contain (they're structured fields,
// not prose). Single-token queries match against the indexed token
// stream and catch issuer names like "FINSTER AI, INC." or "MachGen AI".
//
// Empirically (2026-05-07, 30-day window):
//   q=AI               98 hits
//   q="artificial intelligence"  2 hits (only when the literal phrase is in name)
//   q=machine+learning  0 hits
//
// We run each AI-vocabulary token as a separate query and dedup by
// accession. The defensive AI_NAME_HINT_RE + BAD_NAME_PATTERN filters
// drop generic / fund-LLC noise downstream.
const QUERIES = [
  "AI",
  "GPT",
  "LLM",
  "Neural",
  "AGI",
  "Anthropic",
  "OpenAI",
  "Mistral",
  "Cohere",
  "Perplexity",
  "Robotics",
  "Autonomous",
];

// Mirror of AI_KEYWORDS from the worker fetcher + legacy script.
// Used as a defensive secondary gate on issuer name (some Form D
// filings hit our search query through boilerplate, not actual AI
// business — this drops the egregious false positives).
const AI_NAME_HINT_RE =
  /\b(ai|a\.i\.|artificial intelligence|machine learning|ml|deep learning|llm|llms|foundation model|generative|gen-?ai|agi|agents?|copilot|gpt|transformer|diffusion|multimodal|nlp|neural|inference|fine-?tun\w*|rag|vector database|embeddings?|openai|anthropic|mistral|cohere|perplexity|hugging ?face|robotics?|autonomy|autonomous|computer vision|cv|vision)\b/i;

// SPV / fund-vehicle filter. Form D is filed by ANY private offering,
// so ~70% of "AI" hits are deal-by-deal SPVs (Gaingels syndicates,
// HII Series funds, "a Series of CGF2021 LLC" pooled vehicles, etc.)
// rather than the actual AI startup. Heuristics empirically selected
// from the first 30-day pull:
//
//   - " Series " anywhere       → SPV ("HII Perplexity Series IV")
//   - " a Series of " anywhere  → pooled vehicle
//   - "Fund" as a word          → fund LLC ("AI Innovation Fund V")
//   - "Insider Stock"           → secondary marketplace ("Perplexity AI
//                                  Insider Stock Acquisitions, LLC")
//   - "Acquisition" / "Acquisitions" → SPV
//   - starts with "HII "        → known SPV operator
//   - starts with "Gaingels "   → angel syndicate, holds others' equity
//   - starts with "BIP " / "NV "/ "AC "  → asset-management initials
//   - ends in numeric/roman series tag (II / III / 2024 / Apr 2026)
//
// What we KEEP: real AI startups ending in "Inc.", "Inc", "Corp",
// "Corporation" — that's the canonical incorporation suffix for
// venture-backed operating companies.
const BAD_NAME_PATTERN =
  /\b(series|fund|capital|partners|management|advisors|trust|holdings|acquisition|acquisitions|insider|nonpublic|pe |private equity|hedge|asset management|family office|spv)\b|^(hii|gaingels|bip|nv |ac )\s|\s+(i{1,3}v?|[0-9]{1,4}|[a-z])\s*(llc|lp|inc|corp)?\s*$/i;

// Politeness ceiling. SEC publishes a 10 req/s cap; we sit well under
// it. Bumped 120 → 150ms after observing intermittent 5xx during
// burst windows. Detail fetches use a separate per-request sleep.
const SLEEP_MS_BETWEEN_REQUESTS = 150;
const SLEEP_MS_BETWEEN_DETAIL_FETCHES = 100;

// Retry tuning. EDGAR returns 5xx during indexing windows and the
// network occasionally hiccups. 3 attempts with backoff is enough to
// ride out 99% of transient failures without hammering the host.
const MAX_FETCH_ATTEMPTS = 3;
const RETRY_BACKOFF_MS = [200, 800];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Fetch with bounded retries. Retries on 5xx and network errors only —
 * 4xx fails fast (404 means the doc isn't there, no point retrying).
 * Returns the Response on success, throws on permanent failure.
 */
async function fetchWithRetry(url, options, label) {
  let lastErr = null;
  for (let attempt = 1; attempt <= MAX_FETCH_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, options);
      if (res.ok) return res;
      // 4xx is permanent — don't retry.
      if (res.status >= 400 && res.status < 500) {
        throw new Error(`${label} ${res.status} ${res.statusText}`);
      }
      lastErr = new Error(`${label} ${res.status} ${res.statusText}`);
    } catch (err) {
      lastErr = err;
    }
    if (attempt < MAX_FETCH_ATTEMPTS) {
      const backoff = RETRY_BACKOFF_MS[attempt - 1] ?? 1000;
      await sleep(backoff);
    }
  }
  throw lastErr ?? new Error(`${label} failed after ${MAX_FETCH_ATTEMPTS} attempts`);
}

/**
 * Format USD amount for display. 5_200_000 → "$5.2M", 850_000 → "$850K",
 * 25_000_000_000 → "$25B". Mirrors the convention used elsewhere on the
 * funding page.
 */
function formatAmountDisplay(amount) {
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
    return "Undisclosed";
  }
  if (amount >= 1_000_000_000) {
    const v = amount / 1_000_000_000;
    return `$${v % 1 === 0 ? v.toFixed(0) : v.toFixed(1)}B`;
  }
  if (amount >= 1_000_000) {
    const v = amount / 1_000_000;
    return `$${v % 1 === 0 ? v.toFixed(0) : v.toFixed(1)}M`;
  }
  if (amount >= 1_000) {
    const v = amount / 1_000;
    return `$${v % 1 === 0 ? v.toFixed(0) : v.toFixed(0)}K`;
  }
  return `$${amount}`;
}

/**
 * Pluck the inner text of the first matching tag (case-insensitive).
 * Form D primary_doc.xml is small (typically <50KB) and well-formed
 * but we avoid pulling in an XML parser dep. Regex is sufficient
 * for the leaf fields we need.
 */
function pluckTag(xml, tag) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const match = xml.match(re);
  if (!match) return null;
  const inner = match[1].trim();
  return inner.length > 0 ? inner : null;
}

/**
 * Detect fund-type filings from the parsed primary_doc.xml. Drops:
 *   - industryGroupType containing "Fund" (Pooled Investment Fund,
 *     Hedge Fund, Other Investment Fund, etc.)
 *   - filings carrying an <investmentFundInfo> block
 *   - isPooledInvestmentFundType=true on typesOfSecuritiesOffered
 * This is the defensive belt to BAD_NAME_PATTERN's suspenders.
 */
function isFundFiling(xml) {
  const industry = pluckTag(xml, "industryGroupType");
  if (industry && /\bfund\b/i.test(industry)) return true;
  if (/<investmentFundInfo[\s>]/i.test(xml)) return true;
  if (/<isPooledInvestmentFundType>\s*true\s*<\/isPooledInvestmentFundType>/i.test(xml)) {
    return true;
  }
  return false;
}

/**
 * Fetch + parse a single Form D filing's primary_doc.xml. Returns
 * { amount, industryGroup, isFund } on success, null on permanent
 * failure (the filing is dropped; the rest of the run continues).
 */
async function fetchFilingDetail(primaryDocUrl) {
  if (!primaryDocUrl) return null;
  let xml;
  try {
    const res = await fetchWithRetry(
      primaryDocUrl,
      {
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "application/xml,text/xml,*/*",
        },
      },
      `[sec-form-d] detail`,
    );
    xml = await res.text();
  } catch (err) {
    console.warn(
      `[sec-form-d] detail fetch failed for ${primaryDocUrl}: ${err.message}`,
    );
    return null;
  }

  const isFund = isFundFiling(xml);
  const industryGroup = pluckTag(xml, "industryGroupType");
  const amountRaw = pluckTag(xml, "totalOfferingAmount");
  let amount = null;
  if (amountRaw) {
    const n = Number(amountRaw);
    if (Number.isFinite(n) && n > 0) amount = n;
  }
  return { amount, industryGroup, isFund };
}

function isoDateNDaysAgo(n) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

async function fetchSearch(query, startdt, enddt) {
  const url = new URL("https://efts.sec.gov/LATEST/search-index");
  url.searchParams.set("q", query);
  url.searchParams.set("forms", "D");
  url.searchParams.set("dateRange", "custom");
  url.searchParams.set("startdt", startdt);
  url.searchParams.set("enddt", enddt);
  url.searchParams.set("hits", String(MAX_HITS_PER_QUERY));

  const res = await fetchWithRetry(
    url,
    {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json",
      },
    },
    `[sec-form-d] search ${query}`,
  );
  const json = await res.json();
  return json?.hits?.hits ?? [];
}

function normalizeIssuerName(raw) {
  if (typeof raw !== "string") return null;
  const cleaned = raw
    .replace(/\s+\(CIK[^)]+\)\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length > 0 ? cleaned : null;
}

function buildFilingUrl(cik, adsh) {
  // EDGAR filing detail URL — accession (adsh) needs to have its
  // dashes stripped for the path component but kept in the index.
  if (!cik || !adsh) return null;
  const cleanCik = String(cik).replace(/^0+/, "") || "0";
  const cleanAdsh = adsh.replace(/-/g, "");
  return `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cleanCik}&type=D&dateb=&owner=include&count=40`;
}

function buildPrimaryDocUrl(cik, adsh) {
  if (!cik || !adsh) return null;
  const cleanCik = String(cik).replace(/^0+/, "") || "0";
  const cleanAdsh = adsh.replace(/-/g, "");
  return `https://www.sec.gov/Archives/edgar/data/${cleanCik}/${cleanAdsh}/primary_doc.xml`;
}

function passesAiHint(issuerName) {
  return AI_NAME_HINT_RE.test(issuerName);
}

function isLikelyFund(issuerName) {
  return BAD_NAME_PATTERN.test(issuerName);
}

async function main() {
  const args = process.argv.slice(2);
  const outputFlag = args.find((a) => a.startsWith("--output="));
  const outputPath = outputFlag ? resolve(outputFlag.split("=")[1]) : OUT_PATH;

  const enddt = todayIsoDate();
  const startdt = isoDateNDaysAgo(WINDOW_DAYS);
  console.log(
    `[sec-form-d] window ${startdt} .. ${enddt} (${WINDOW_DAYS}d), ${QUERIES.length} queries`,
  );

  const seenAdsh = new Set();
  const signals = [];

  for (const query of QUERIES) {
    let hits = [];
    try {
      hits = await fetchSearch(query, startdt, enddt);
      console.log(`[sec-form-d] query ${query} → ${hits.length} hits`);
    } catch (err) {
      console.warn(
        `[sec-form-d] query ${query} failed: ${err.message}; skipping`,
      );
      hits = [];
    }
    for (const hit of hits) {
      const adsh = hit?._source?.adsh ?? hit?._id ?? null;
      if (!adsh || seenAdsh.has(adsh)) continue;
      seenAdsh.add(adsh);

      const displayNames = hit?._source?.display_names ?? [];
      const issuerNameRaw = Array.isArray(displayNames) ? displayNames[0] : null;
      const issuerName = normalizeIssuerName(issuerNameRaw);
      if (!issuerName) continue;

      // Defensive secondary gate: drop obvious funds + non-AI issuers
      // that hit on boilerplate AI mentions in the filing exhibit.
      if (isLikelyFund(issuerName)) continue;

      const fileDate = hit?._source?.file_date ?? null;
      const publishedAt = fileDate
        ? new Date(`${fileDate}T00:00:00Z`).toISOString()
        : new Date().toISOString();

      const ciks = hit?._source?.ciks ?? [];
      const cik = Array.isArray(ciks) ? ciks[0] : null;

      const sourceUrl =
        buildFilingUrl(cik, adsh) ?? `https://www.sec.gov/cgi-bin/browse-edgar`;
      const primaryDocUrl = buildPrimaryDocUrl(cik, adsh);

      // Score the AI confidence: explicit name hint = high, query-only
      // match = medium. We stamp this on extracted.confidence so the
      // page can sort name-confirmed AI rounds to the top.
      const nameHints = passesAiHint(issuerName);
      const confidence = nameHints ? "high" : "medium";

      signals.push({
        id: `sec-form-d-${adsh}`,
        headline: `${issuerName} filed Form D`,
        description: `SEC Form D — private offering disclosure (full filing: ${primaryDocUrl ?? "n/a"})`,
        sourceUrl,
        sourcePlatform: "sec-form-d",
        publishedAt,
        discoveredAt: new Date().toISOString(),
        extracted: {
          companyName: issuerName,
          companyWebsite: null,
          companyLogoUrl: null,
          amount: null,
          amountDisplay: "Undisclosed",
          currency: "USD",
          roundType: "undisclosed",
          investors: [],
          investorsEnriched: [],
          confidence,
        },
        tags: ["sec", "form-d", "ai", confidence === "high" ? "ai-confirmed" : "ai-keyword"],
      });
    }
    await sleep(SLEEP_MS_BETWEEN_REQUESTS);
  }

  signals.sort((a, b) => {
    const ta = Date.parse(a.publishedAt);
    const tb = Date.parse(b.publishedAt);
    return (Number.isFinite(tb) ? tb : 0) - (Number.isFinite(ta) ? ta : 0);
  });

  const fetchedAt = new Date().toISOString();
  const payload = {
    fetchedAt,
    source: "sec-form-d-edgar",
    windowDays: WINDOW_DAYS,
    signals,
  };

  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(outputPath, JSON.stringify(payload, null, 2));
  console.log(
    `[sec-form-d] wrote ${signals.length} signals → ${outputPath}`,
  );

  try {
    await writeDataStore("funding-news-sec", payload);
    console.log(`[sec-form-d] redis write ok → funding-news-sec`);
  } catch (err) {
    console.warn(
      `[sec-form-d] redis write skipped: ${err.message}`,
    );
  }
}

main().catch((err) => {
  console.error("[sec-form-d] fatal:", err);
  process.exit(1);
});
