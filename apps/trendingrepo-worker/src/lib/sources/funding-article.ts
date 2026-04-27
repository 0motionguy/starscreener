// Funding article enrichment helpers ported from scripts/_funding-article.mjs.
//
// The original used linkedom for DOM parsing of article HTML. The worker
// avoids the new dep and ships a lighter version: regex-based investor
// extraction from raw HTML text + Clearbit logo URL builder. This drops
// link-scraped website detection (which needed DOM traversal); the funding
// fetcher leans on the seeded KNOWN_COMPANY_LOGOS map instead.

import { fetchWithTimeout } from '../util/http-helpers.js';

const USER_AGENT =
  'Mozilla/5.0 (compatible; TrendingRepoBot/1.0; +https://trendingrepo.com)';

const INVESTOR_PATTERNS: RegExp[] = [
  /(?:led|co-led)\s+by\s+([A-Z][A-Za-z0-9\s&\.]+?)(?:,|;|\.|\band\b|\bwith\b|\bin\b|$)/gi,
  /(?:backed|funded|supported)\s+by\s+([A-Z][A-Za-z0-9\s&\.]+?)(?:,|;|\.|\band\b|\bwith\b|\bin\b|$)/gi,
  /investors?\s+(?:include|were|are)\s+([A-Z][A-Za-z0-9\s&\.]+?)(?:,|;|\.|\band\b|\bwith\b|$)/gi,
  /(?:participated|joined)\s+(?:by|in)\s+([A-Z][A-Za-z0-9\s&\.]+?)(?:,|;|\.|\band\b|\bwith\b|$)/gi,
  /([A-Z][A-Za-z0-9\s&\.]+?)\s+(?:led|co-led|participated\s+in)\s+(?:the\s+)?(?:round|investment|financing)/gi,
  /(?:money|funding|investment)\s+from\s+([A-Z][A-Za-z0-9\s&\.]+?)(?:,|;|\.|\band\b|\bwith\b|$)/gi,
];

const INVESTOR_STOP_WORDS = new Set<string>([
  'the', 'a', 'an', 'this', 'that', 'it', 'its', 'company', 'startup', 'firm',
  'fund', 'capital', 'ventures', 'partners', 'group', 'llc', 'inc', 'corp',
  'previous', 'existing', 'new', 'several', 'multiple', 'various', 'other',
  'investors', 'backers', 'funders', 'including', 'among', 'such', 'as',
  'us', 'shareholders', 'existing shareholders', 'current', 'former', 'undisclosed', 'eic',
  'yesterday', 'today', 'last', 'year', 'month', 'week',
]);

const KNOWN_VCS = new Set<string>([
  'a16z', 'andreessen horowitz', 'sequoia', 'sequoia capital',
  'benchmark', 'greylock', 'accel', 'index ventures', 'bessemer',
  'khosla ventures', 'first round', 'neo', 'dcm', 'ivp',
  'thrive capital', 'tiger global', 'softbank', 'vision fund',
  'founders fund', '8vc', 'general catalyst',
  'bain capital', 'insight partners', 'lightspeed',
  'menlo ventures', 'mayfield', 'kleiner perkins',
  'y combinator', 'yc', 'techstars', '500 startups',
  'google ventures', 'gv', 'gradient ventures',
  'intel capital', 'salesforce ventures', 'microsoft m12',
  'aws', 'amazon', 'google', 'meta', 'nvidia',
  'valor equity partners', 'valor', 'fidelity',
  'bond capital', 'bond', 'coatue', 'd1 capital',
  'dragoneer', 't. rowe price', 't rowe price',
  'wellington', 'baillie gifford', 'alkeon',
  'redpoint', 'norwest',
  'true ventures', 'uncork capital', 'slow ventures',
  'homebrew', 'haystack', 'sv angel', 'ron conway',
  'naval ravikant', 'elad gil', 'lenny rachitsky',
]);

function cleanInvestorName(raw: string): string | null {
  const cleaned = raw
    .replace(/^\s*the\s+/i, '')
    .replace(/\s+/g, ' ')
    .replace(/\b(?:the\s+)?(firm|fund|company)\b/gi, '')
    .replace(/\b(?:and|with|along|together)\s+with\b/gi, '')
    .trim();

  if (cleaned.length < 2) return null;
  if (INVESTOR_STOP_WORDS.has(cleaned.toLowerCase())) return null;

  const trailingWords = ['and', 'with', 'as', 'in', 'on', 'at', 'for', 'from', 'to', 'existing'];
  let result = cleaned;
  for (const word of trailingWords) {
    if (result.toLowerCase().endsWith(` ${word}`)) {
      result = result.slice(0, -(word.length + 1)).trim();
    }
  }
  return result.length >= 2 ? result : null;
}

export interface InvestorMatch {
  name: string;
  isKnown: boolean;
  confidence: 'high' | 'medium' | 'low';
}

export function extractInvestorsFromText(text: string): InvestorMatch[] {
  const found = new Map<string, InvestorMatch>();
  for (const pattern of INVESTOR_PATTERNS) {
    const matches = Array.from(text.matchAll(pattern));
    for (const match of matches) {
      const raw = (match[1] ?? '').trim();
      if (!raw) continue;
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
            confidence: isKnown ? 'high' : 'medium',
          });
        }
      }
    }
  }
  return Array.from(found.values());
}

export function buildClearbitLogoUrl(website: string | null | undefined): string | null {
  if (!website) return null;
  try {
    const url = new URL(website);
    const domain = url.hostname.toLowerCase().replace(/^www\./, '');
    return `https://logo.clearbit.com/${domain}`;
  } catch {
    return null;
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#x?[0-9a-f]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface ArticleData {
  ok: boolean;
  articleText?: string;
  website?: string | null;
  logoUrl?: string | null;
  investors: InvestorMatch[];
  textLength?: number;
  error?: string;
}

export async function fetchArticleData(
  articleUrl: string,
  _companyName: string,
  timeoutMs = 10_000,
): Promise<ArticleData> {
  try {
    const res = await fetchWithTimeout(articleUrl, {
      timeoutMs,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
      },
    });
    if (!res.ok) {
      return { ok: false, investors: [], error: `HTTP ${res.status}` };
    }
    const html = await res.text();
    const text = stripHtml(html).slice(0, 50_000);
    const investors = extractInvestorsFromText(text);
    return {
      ok: true,
      articleText: text.slice(0, 8_000),
      investors,
      website: null,
      logoUrl: null,
      textLength: text.length,
    };
  } catch (err) {
    return {
      ok: false,
      investors: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
