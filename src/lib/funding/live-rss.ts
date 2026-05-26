// Live funding RSS fetcher.
//
// Fetches the venture-category feeds of TechCrunch + VentureBeat + Sifted
// in parallel, parses the XML, runs lightweight extraction on each headline
// to pull out (company, amount, round, source), and returns FundingSignal-shaped
// rows the existing aggregate logic can consume.
//
// Trade-off: extraction is best-effort heuristic regex, not LLM-grade NER —
// it misses headlines that don't follow "X raises $Y in Z round" patterns.
// Misses fail closed (signal dropped); they never become fabricated data.
//
// Logo source: Google's public favicon service
//   https://www.google.com/s2/favicons?domain={domain}&sz=64
// No auth, no rate limit in practice for our volume. Falls back to a letter
// mark in the UI when the image fails to load.

import type {
  FundingSignal,
  FundingRoundType,
} from "@/lib/funding/types";

interface RssSource {
  /** Display name returned in the signal's `sourcePlatform` field. */
  platform: FundingSignal["sourcePlatform"];
  /** Pretty label for the UI. */
  label: string;
  /** Feed URL. */
  url: string;
}

const FEEDS: RssSource[] = [
  {
    platform: "techcrunch",
    label: "TechCrunch",
    url: "https://techcrunch.com/category/venture/feed/",
  },
  {
    platform: "venturebeat",
    label: "VentureBeat",
    url: "https://venturebeat.com/category/business/feed/",
  },
  {
    platform: "sifted",
    label: "Sifted",
    url: "https://sifted.eu/feed",
  },
];

const FEED_UA =
  "Mozilla/5.0 (compatible; TrendingRepo/1.0; +https://trendingrepo.com)";

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#8217;/g, "'")
    .replace(/&#8216;/g, "'")
    .replace(/&#8211;/g, "–")
    .replace(/&#8212;/g, "—")
    .replace(/&#8230;/g, "…")
    .replace(/&nbsp;/g, " ");
}

function stripCdata(s: string): string {
  const m = s.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/);
  return m ? m[1] : s;
}

function pickTag(item: string, tag: string): string {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = item.match(re);
  if (!m) return "";
  return decodeEntities(stripCdata(m[1].trim()));
}

interface ParsedItem {
  title: string;
  link: string;
  pubDate: string;
  description: string;
}

function parseRss(xml: string): ParsedItem[] {
  const items: ParsedItem[] = [];
  const re = /<item[\s>]([\s\S]*?)<\/item>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const body = m[1];
    items.push({
      title: pickTag(body, "title"),
      link: pickTag(body, "link"),
      pubDate: pickTag(body, "pubDate"),
      description: pickTag(body, "description"),
    });
  }
  return items;
}

// Match "$1.2B", "$500M", "$10 million", "€50M", "£200M".
const AMOUNT_RE =
  /[$€£](\d+(?:\.\d+)?)\s*(B|M|K|billion|million|thousand)\b/i;

interface ExtractedAmount {
  amount: number;
  display: string;
}

function extractAmount(text: string): ExtractedAmount | null {
  const m = text.match(AMOUNT_RE);
  if (!m) return null;
  const num = Number.parseFloat(m[1]);
  if (!Number.isFinite(num) || num <= 0) return null;
  const unit = m[2].toLowerCase();
  let multiplier = 1;
  let suffix = "";
  if (unit === "b" || unit === "billion") {
    multiplier = 1_000_000_000;
    suffix = "B";
  } else if (unit === "m" || unit === "million") {
    multiplier = 1_000_000;
    suffix = "M";
  } else if (unit === "k" || unit === "thousand") {
    multiplier = 1_000;
    suffix = "K";
  }
  const display = `$${m[1].replace(/\.0$/, "")}${suffix}`;
  return { amount: num * multiplier, display };
}

// Match "Anthropic raises", "Together AI lands", "Acme.ai secures", etc.
// Captures the leading proper-noun chunk before the trigger verb.
const COMPANY_RE =
  /^([A-Z][\w&.+\-]*(?:\s+[A-Z][\w&.+\-]*){0,3}?)\s+(?:raises|secures|closes|lands|nabs|gets|announces|scores|bags|completes|hauls|locks|grabs)\b/;

function extractCompany(title: string): string | null {
  const m = title.match(COMPANY_RE);
  return m ? m[1].trim() : null;
}

function extractRound(text: string): FundingRoundType {
  const lower = text.toLowerCase();
  if (lower.match(/\bseries\s+([a-z])\b/)) {
    const letter = lower.match(/\bseries\s+([a-z])\b/)?.[1];
    if (letter === "a") return "series-a";
    if (letter === "b") return "series-b";
    if (letter === "c") return "series-c";
    if (letter === "d") return "series-d-plus";
    if (letter === "e" || letter === "f") return "series-d-plus";
  }
  if (lower.includes("pre-seed")) return "pre-seed";
  if (lower.match(/\bseed\b/)) return "seed";
  if (lower.match(/\bgrowth\b/)) return "growth";
  if (lower.match(/\bipo\b/)) return "ipo";
  if (lower.match(/\bacqui(red|sition)\b/)) return "acquisition";
  return "undisclosed";
}

/**
 * Infer a likely company website domain from the display name. Heuristic:
 *   "Anthropic" → "anthropic.com"
 *   "Together AI" → "togetherai.com" (we strip spaces)
 *   "Acme.ai" → "acme.ai" (we keep TLD when present)
 *
 * Used to fetch favicons via Google's public favicon service. Wrong guesses
 * still resolve to a generic/empty image — the UI shows a letter-mark
 * fallback when the <img> errors.
 */
export function inferCompanyDomain(name: string): string {
  const trimmed = name.trim();
  if (trimmed.includes(".")) {
    // Already looks domain-y ("acme.ai", "x.com")
    const lower = trimmed.toLowerCase().replace(/\s+/g, "");
    return lower.replace(/^https?:\/\//, "").replace(/\/$/, "");
  }
  return trimmed.toLowerCase().replace(/[^a-z0-9]+/g, "") + ".com";
}

/** Google's free favicon API — no auth, public, fast CDN. */
export function faviconUrl(domain: string, size = 64): string {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=${size}`;
}

function makeSignalId(source: string, link: string, idx: number): string {
  // Stable-ish id: source + last URL path segment + idx. Avoids collisions
  // across sources publishing the same headline.
  try {
    const u = new URL(link);
    const slug = u.pathname.split("/").filter(Boolean).pop() ?? `i${idx}`;
    return `live-${source}-${slug}`;
  } catch {
    return `live-${source}-${idx}`;
  }
}

async function fetchFeed(feed: RssSource): Promise<FundingSignal[]> {
  try {
    const res = await fetch(feed.url, {
      headers: { "User-Agent": FEED_UA, Accept: "application/rss+xml,application/xml" },
      next: { revalidate: 300 },
    });
    if (!res.ok) return [];
    const xml = await res.text();
    const items = parseRss(xml);
    const out: FundingSignal[] = [];
    items.forEach((item, idx) => {
      if (!item.title || !item.link) return;
      const company = extractCompany(item.title);
      const amount = extractAmount(item.title) ?? extractAmount(item.description);
      if (!company || !amount) return;
      const round = extractRound(`${item.title} ${item.description}`);
      const publishedIso =
        new Date(item.pubDate || Date.now()).toISOString();
      const domain = inferCompanyDomain(company);

      out.push({
        id: makeSignalId(feed.platform, item.link, idx),
        headline: item.title,
        description: item.description.slice(0, 280),
        sourceUrl: item.link,
        sourcePlatform: feed.platform,
        publishedAt: publishedIso,
        discoveredAt: new Date().toISOString(),
        tags: ["funding", "live-rss"],
        extracted: {
          companyName: company,
          companyWebsite: `https://${domain}`,
          companyLogoUrl: faviconUrl(domain, 64),
          amount: amount.amount,
          amountDisplay: amount.display,
          currency: "USD",
          roundType: round,
          investors: [],
          investorsEnriched: [],
          confidence: "medium",
        },
      });
    });
    return out;
  } catch {
    return [];
  }
}

/**
 * Fetch all configured RSS feeds in parallel, extract structured rounds,
 * dedupe by company+amount, return sorted by amount desc.
 *
 * Empty array on full failure — never fabricates rows.
 */
export async function fetchLiveFundingSignals(): Promise<FundingSignal[]> {
  const perFeed = await Promise.all(FEEDS.map(fetchFeed));
  const flat = perFeed.flat();

  // Dedupe by company name + amount band (in case TC and VB both cover the
  // same Series F — keep the earlier-published one).
  const seen = new Map<string, FundingSignal>();
  for (const s of flat) {
    const key =
      `${s.extracted?.companyName ?? ""}:${s.extracted?.amount ?? 0}`.toLowerCase();
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, s);
      continue;
    }
    if (Date.parse(s.publishedAt) < Date.parse(existing.publishedAt)) {
      seen.set(key, s);
    }
  }

  return Array.from(seen.values()).sort(
    (a, b) => (b.extracted?.amount ?? 0) - (a.extracted?.amount ?? 0),
  );
}
