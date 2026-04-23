/**
 * Funding Article Extractor
 *
 * Fetches article HTML and extracts structured data:
 * - Main article text (for investor parsing)
 * - Company website URL (from article links or meta tags)
 * - Investor names (from text patterns)
 * - Company description (first paragraph or meta)
 *
 * Uses linkedom for DOM parsing (already in project deps).
 */

import { parseHTML } from "linkedom";
import { fetchWithTimeout } from "./_fetch-json.mjs";

const USER_AGENT =
  "Mozilla/5.0 (compatible; TrendingRepoBot/1.0; +https://trendingrepo.com)";

// ---------------------------------------------------------------------------
// Investor extraction patterns
// ---------------------------------------------------------------------------

const INVESTOR_PATTERNS = [
  // "led by [Investor Name]"
  /(?:led|co-led)\s+by\s+([A-Z][A-Za-z0-9\s&\.]+?)(?:,|;|\.|\band\b|\bwith\b|\bin\b|$)/gi,
  // "backed by [Investor Name]"
  /(?:backed|funded|supported)\s+by\s+([A-Z][A-Za-z0-9\s&\.]+?)(?:,|;|\.|\band\b|\bwith\b|\bin\b|$)/gi,
  // "investors include [Investor Name]"
  /investors?\s+(?:include|were|are)\s+([A-Z][A-Za-z0-9\s&\.]+?)(?:,|;|\.|\band\b|\bwith\b|$)/gi,
  // "participated by [Investor Name]"
  /(?:participated|joined)\s+(?:by|in)\s+([A-Z][A-Za-z0-9\s&\.]+?)(?:,|;|\.|\band\b|\bwith\b|$)/gi,
  // "[Investor Name] led the round"
  /([A-Z][A-Za-z0-9\s&\.]+?)\s+(?:led|co-led|participated\s+in)\s+(?:the\s+)?(?:round|investment|financing)/gi,
  // "from [Investor Name]"
  /(?:money|funding|investment)\s+from\s+([A-Z][A-Za-z0-9\s&\.]+?)(?:,|;|\.|\band\b|\bwith\b|$)/gi,
];

const INVESTOR_STOP_WORDS = new Set([
  "the", "a", "an", "this", "that", "it", "its", "company", "startup", "firm",
  "fund", "capital", "ventures", "partners", "group", "llc", "inc", "corp",
  "previous", "existing", "new", "several", "multiple", "various", "other",
  "investors", "backers", "funders", "including", "among", "such", "as",
  "us", "shareholders", "existing shareholders", "current", "former", "undisclosed", "eic",
  "yesterday", "today", "last", "year", "month", "week",
]);

const KNOWN_VCS = new Set([
  "a16z", "andreessen horowitz", "sequoia", "sequoia capital",
  "benchmark", "greylock", "accel", "index ventures", "bessemer",
  "khosla ventures", "first round", "neo", "dcm", "ivp",
  "thrive capital", "tiger global", "softbank", "vision fund",
  "founders fund", "8vc", " Lux capital", "general catalyst",
  "bain capital", "insight partners", "lightspeed",
  "menlo ventures", "mayfield", "kleiner perkins",
  "y combinator", "yc", "techstars", "500 startups",
  "google ventures", "gv", "gradient ventures",
  "intel capital", "salesforce ventures", "microsoft m12",
  "aws", "amazon", "google", "meta", "nvidia",
  "valor equity partners", "valor", "fidelity",
  "bond capital", "bond", "coatue", "d1 capital",
  "dragoneer", "t. rowe price", "t rowe price",
  "wellington", "baillie gifford", "alkeon",
  "redpoint", "norwest", " Scale venture partners",
  "true ventures", "uncork capital", "slow ventures",
  "homebrew", "haystack", "sv angel", "ron conway",
  "naval ravikant", "elad gil", "lenny rachitsky",
]);

function cleanInvestorName(raw) {
  const cleaned = raw
    .replace(/^\s*the\s+/i, "") // strip leading "the"
    .replace(/\s+/g, " ")
    .replace(/\b(?:the\s+)?(firm|fund|company)\b/gi, "")
    .replace(/\b(?:and|with|along|together)\s+with\b/gi, "")
    .trim();

  if (cleaned.length < 2) return null;
  if (INVESTOR_STOP_WORDS.has(cleaned.toLowerCase())) return null;

  // Trim trailing words that aren't part of investor name
  const trailingWords = ["and", "with", "as", "in", "on", "at", "for", "from", "to", "existing"];
  let result = cleaned;
  for (const word of trailingWords) {
    if (result.toLowerCase().endsWith(` ${word}`)) {
      result = result.slice(0, -(word.length + 1)).trim();
    }
  }

  return result.length >= 2 ? result : null;
}

export function extractInvestorsFromText(text) {
  const found = new Map(); // name -> { name, isKnown, confidence }

  for (const pattern of INVESTOR_PATTERNS) {
    const matches = Array.from(text.matchAll(pattern));
    for (const match of matches) {
      const raw = match[1]?.trim() ?? "";
      if (!raw) continue;

      // Split on "and" / "," for multiple investors in one match
      const parts = raw.split(/(?:,|\band\b|\bwith\b)+/);
      for (const part of parts) {
        const cleaned = cleanInvestorName(part);
        if (!cleaned) continue;

        const lower = cleaned.toLowerCase();
        const isKnown = KNOWN_VCS.has(lower);
        const existing = found.get(lower);

        if (!existing || isKnown) {
          found.set(lower, {
            name: cleaned,
            isKnown,
            confidence: isKnown ? "high" : "medium",
          });
        }
      }
    }
  }

  return Array.from(found.values());
}

// ---------------------------------------------------------------------------
// Website extraction
// ---------------------------------------------------------------------------

function extractWebsiteFromLinks(document, companyName, articleUrl) {
  const links = document.querySelectorAll("a[href^='http']");
  const companyLower = companyName.toLowerCase().replace(/\s+/g, "").replace(/[^a-z0-9]/g, "");

  // Get article domain to exclude self-links
  let articleDomain = "";
  try {
    articleDomain = new URL(articleUrl).hostname.toLowerCase();
  } catch {
    // ignore
  }

  const skipDomains = new Set([
    "techcrunch.com", "venturebeat.com", "sifted.eu", "theinformation.com",
    "axios.com", "forbes.com", "bloomberg.com", "reuters.com", "cnbc.com",
    "wsj.com", "ft.com", "wired.com", "theverge.com", "arstechnica.com",
  ]);

  for (const link of links) {
    const href = link.getAttribute("href") ?? "";
    const text = link.textContent?.trim() ?? "";

    try {
      const url = new URL(href);
      const domain = url.hostname.toLowerCase().replace(/^www\./, "");
      const domainBase = domain.split(".")[0] ?? "";

      // Skip social media
      if (/\b(twitter|x\.com|linkedin|facebook|instagram|youtube|github|medium|substack|t\.co)\b/i.test(domain)) {
        continue;
      }

      // Skip news sites and article's own domain
      if (skipDomains.has(domain) || domain === articleDomain) {
        continue;
      }

      // Skip generic domains
      if (/\b(google|apple|microsoft|amazon|facebook|meta)\b/i.test(domain) && !companyLower.includes(domainBase)) {
        continue;
      }

      // Check if domain contains company name
      const domainBaseClean = domainBase.replace(/[^a-z0-9]/g, "");
      if (companyLower.length >= 4 && domainBaseClean.includes(companyLower.slice(0, 6))) {
        return `https://${domain}`;
      }
      if (companyLower.length >= 3 && domainBaseClean.includes(companyLower.slice(0, 4))) {
        return `https://${domain}`;
      }

      // Check if link text closely matches company name
      const textClean = text.toLowerCase().replace(/\s+/g, "").replace(/[^a-z0-9]/g, "");
      if (textClean === companyLower || textClean.includes(companyLower.slice(0, 6))) {
        return `https://${domain}`;
      }
    } catch {
      // invalid URL
    }
  }

  return null;
}

function extractMetaWebsite(document) {
  // Look for structured data or meta tags that might contain company website
  // og:url and canonical always point to the article itself, so skip them
  const ldJson = document.querySelector("script[type='application/ld+json']");
  if (ldJson) {
    try {
      const data = JSON.parse(ldJson.textContent ?? "{}");
      // Article schema may reference the subject/organization
      const org = data.about?.[0] ?? data.subjectOf?.[0];
      if (org?.url && !org.url.includes("sifted.eu") && !org.url.includes("techcrunch.com") && !org.url.includes("venturebeat.com")) {
        return org.url;
      }
    } catch {
      // ignore JSON parse errors
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Clearbit logo URL
// ---------------------------------------------------------------------------

export function buildClearbitLogoUrl(website) {
  if (!website) return null;
  try {
    const url = new URL(website);
    const domain = url.hostname.toLowerCase().replace(/^www\./, "");
    return `https://logo.clearbit.com/${domain}`;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Article text extraction
// ---------------------------------------------------------------------------

function extractArticleText(document) {
  // Try common article content selectors
  const selectors = [
    "article",
    "[class*='article-content']",
    "[class*='post-content']",
    "[class*='entry-content']",
    "[class*='story-content']",
    ".content",
    "main",
  ];

  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el) {
      const text = el.textContent?.trim() ?? "";
      if (text.length > 200) return text;
    }
  }

  // Fallback: all paragraphs
  const paragraphs = document.querySelectorAll("p");
  const texts = [];
  for (const p of paragraphs) {
    const text = p.textContent?.trim() ?? "";
    if (text.length > 20) texts.push(text);
  }
  return texts.join("\n\n");
}

// ---------------------------------------------------------------------------
// Main article fetch + extract
// ---------------------------------------------------------------------------

export async function fetchArticleData(articleUrl, companyName, timeoutMs = 10_000) {
  try {
    const res = await fetchWithTimeout(articleUrl, {
      timeoutMs,
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml,*/*;q=0.8",
      },
    });

    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}` };
    }

    const html = await res.text();
    const { document } = parseHTML(html);

    const articleText = extractArticleText(document);
    const website = extractWebsiteFromLinks(document, companyName, articleUrl) ?? extractMetaWebsite(document);
    const investors = extractInvestorsFromText(articleText);
    const logoUrl = buildClearbitLogoUrl(website);

    return {
      ok: true,
      articleText: articleText.slice(0, 8000), // cap size
      website,
      logoUrl,
      investors,
      textLength: articleText.length,
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}
