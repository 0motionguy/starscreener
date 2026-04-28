// Pure-function funding extraction helpers ported from
// scripts/scrape-funding-news.mjs. Detects company name, $ amount, round
// type, and tags from a headline + description string. No HTTP, no I/O.

const ROUND_PATTERNS: { type: string; patterns: RegExp[] }[] = [
  { type: 'pre-seed', patterns: [/\bpre[-\s]?seed\b/i, /\bpreseed\b/i] },
  { type: 'seed', patterns: [/\bseed\b/i] },
  { type: 'series-a', patterns: [/\bseries\s*A\b/i] },
  { type: 'series-b', patterns: [/\bseries\s*B\b/i] },
  { type: 'series-c', patterns: [/\bseries\s*C\b/i] },
  { type: 'series-d-plus', patterns: [/\bseries\s*[D-Z]\b/i] },
  { type: 'growth', patterns: [/\bgrowth\b/i, /\blate[-\s]?stage\b/i] },
  { type: 'ipo', patterns: [/\bIPO\b/i] },
  { type: 'acquisition', patterns: [/\bacquired\b/i, /\bacquisition\b/i] },
];

const AMOUNT_PATTERN =
  /\$\s*([\d,.]+)\s*([KMBT]?)\b|\b([\d,.]+)\s*(million|billion|mn|m|bn|b)\s*(?:dollar)?s?\b/gi;

const MULTIPLIERS: Record<string, number> = {
  k: 1_000,
  m: 1_000_000,
  mn: 1_000_000,
  million: 1_000_000,
  b: 1_000_000_000,
  bn: 1_000_000_000,
  billion: 1_000_000_000,
};

interface AmountResult {
  amount: number;
  display: string;
}

function normalizeAmount(value: string, suffix: string): AmountResult | null {
  const cleanValue = value.replace(/,/g, '');
  const numeric = Number.parseFloat(cleanValue);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  const multiplier = MULTIPLIERS[suffix.toLowerCase().trim()] ?? 1;
  const amount = numeric * multiplier;
  let display: string;
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

export function extractAmount(text: string): AmountResult | null {
  const matches = Array.from(text.matchAll(AMOUNT_PATTERN));
  if (matches.length === 0) return null;
  const valuationMatches = Array.from(text.matchAll(/\bvaluation\b/gi));

  const candidates: Array<AmountResult & { raw: string; isValuation: boolean }> = [];
  for (const match of matches) {
    const value = match[1] ?? match[3] ?? '';
    const suffix = match[2] ?? match[4] ?? '';
    const normalized = normalizeAmount(value, suffix);
    if (!normalized) continue;
    const matchEnd = (match.index ?? 0) + match[0].length;
    let isValuation = false;
    for (const v of valuationMatches) {
      const vIdx = v.index ?? 0;
      const dist = vIdx - matchEnd;
      if (dist >= 0 && dist <= 5) {
        isValuation = true;
        break;
      }
    }
    if (!isValuation) {
      const idx = match.index ?? 0;
      const context = text.slice(Math.max(0, idx - 40), idx + 40);
      const hasValuationWord = /\bvaluation\b/i.test(context);
      const hasRaiseWord = /\braise|raising|funding|round|invest|closes|secured\b/i.test(context);
      isValuation = hasValuationWord && !hasRaiseWord;
    }
    candidates.push({ ...normalized, raw: match[0], isValuation });
  }
  if (candidates.length === 0) return null;
  const nonValuations = candidates.filter((c) => !c.isValuation);
  if (nonValuations.length > 0) {
    return nonValuations.reduce((best, c) => (c.amount > best.amount ? c : best));
  }
  return candidates.reduce((best, c) => (c.amount > best.amount ? c : best));
}

export function extractRoundType(text: string): string | null {
  for (const { type, patterns } of ROUND_PATTERNS) {
    for (const pattern of patterns) {
      if (pattern.test(text)) return type;
    }
  }
  return null;
}

const COMPANY_STOP_WORDS = new Set<string>([
  'raises', 'raised', 'secures', 'secured', 'gets', 'got', 'lands', 'closed', 'closes',
  'announces', 'announce', 'funding', 'round', 'investment', 'million', 'billion',
  'startup', 'company', 'ai', 'the', 'and', 'for', 'from', 'with', 'in',
  'alumni', 'founders', 'executives', 'team', 'employees', 'founder',
]);

function stripCompanyPrefix(name: string): string {
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
    result = result.replace(prefix, '');
  }
  return result.trim();
}

export function extractCompanyName(headline: string): string | null {
  let cleanHeadline = headline
    .replace(/^\s*(?:sources?[:\s]+|report[:\s]+|breaking[:\s]+)/i, '')
    .replace(/^\s*ex[-–]/i, '');
  cleanHeadline = cleanHeadline.replace(/\s+in\s+(?:talks|discussions)\s+to\s+.*$/i, '');
  cleanHeadline = cleanHeadline.replace(/^\s*\w+-\w+-old\s+/i, '');

  const patterns: RegExp[] = [
    /(?:alumni|founders|executives)\s+(?:raise|raised)\s+.*?(?:for|to\s+build)\s+([A-Z][A-Za-z0-9\s&\-\.]+?)(?:\s+(?:to|for|with)|\s*$)/i,
    /^([A-Z][A-Za-z0-9\s&\-\.]+?)\s+(?:raises?|secures?|gets?|lands?|closes?|closed)\b/i,
    /^([A-Z][A-Za-z0-9\s&\-\.]+?)\s+(?:announces?|announced)\b/i,
    /^([A-Z][A-Za-z0-9\s&\-\.]+?)\s+(?:has\s+raised)\b/i,
    /(?:raise[d-s]?\s+\$?[\d.,]+\s*(?:[KMB]|million|billion)?\s+(?:for|to\s+build)\s+)([A-Z][A-Za-z0-9\s&\-\.]+?)(?:\s+(?:to|for|with)|\s*$)/i,
  ];
  for (const pattern of patterns) {
    const match = cleanHeadline.match(pattern);
    if (match && match[1]) {
      const candidate = stripCompanyPrefix(match[1].trim());
      if (candidate.length >= 2 && !COMPANY_STOP_WORDS.has(candidate.toLowerCase())) {
        return candidate;
      }
    }
  }
  const words = cleanHeadline.match(
    /^([A-Z][a-zA-Z0-9]*(?:[-'][A-Za-z]+)*(?:\s+[A-Z][a-zA-Z0-9]*(?:[-'][A-Za-z]+)*){0,2})/,
  );
  if (words && words[1]) {
    const candidate = stripCompanyPrefix(words[1].trim());
    if (candidate.length >= 2 && !COMPANY_STOP_WORDS.has(candidate.toLowerCase())) {
      return candidate;
    }
  }
  return null;
}

const TAG_KEYWORDS: { tag: string; keywords: string[] }[] = [
  { tag: 'ai', keywords: ['ai', 'artificial intelligence', 'machine learning', 'ml', 'llm', 'generative ai', 'agent', 'mcp'] },
  { tag: 'fintech', keywords: ['fintech', 'payments', 'banking', 'crypto', 'blockchain', 'defi', 'web3'] },
  { tag: 'healthcare', keywords: ['healthcare', 'health', 'biotech', 'medical', 'pharma', 'drug'] },
  { tag: 'climate', keywords: ['climate', 'carbon', 'clean energy', 'sustainability', 'green'] },
  { tag: 'europe', keywords: ['european', 'europe', 'uk', 'germany', 'france', 'netherlands', 'sweden', 'berlin', 'london', 'paris'] },
  { tag: 'india', keywords: ['india', 'indian', 'bangalore', 'mumbai', 'delhi'] },
  { tag: 'hardware', keywords: ['hardware', 'robotics', 'semiconductor', 'chip', 'iot', 'drone'] },
  { tag: 'saas', keywords: ['saas', 'enterprise', 'b2b', 'developer tools', 'devtools'] },
  { tag: 'consumer', keywords: ['consumer', 'social', 'marketplace', 'e-commerce', 'retail'] },
  { tag: 'defense', keywords: ['defense', 'military', 'aerospace', 'space', 'satellite'] },
];

export function extractTags(headline: string, description: string): string[] {
  const text = `${headline} ${description}`.toLowerCase();
  const tags: string[] = [];
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

export interface FundingExtraction {
  companyName: string;
  companyWebsite: string | null;
  companyLogoUrl: string | null;
  amount: number | null;
  amountDisplay: string;
  currency: string;
  roundType: string;
  investors: string[];
  investorsEnriched: Array<{ name: string; isKnown: boolean; confidence: 'high' | 'medium' | 'low' }>;
  confidence: 'none' | 'low' | 'medium' | 'high';
}

export interface KnownCompanyInfo {
  domain: string;
  github?: string;
}

export const KNOWN_COMPANY_LOGOS: Record<string, KnownCompanyInfo> = {
  cursor: { domain: 'cursor.com', github: 'getcursor' },
  openai: { domain: 'openai.com', github: 'openai' },
  anthropic: { domain: 'anthropic.com', github: 'anthropics' },
  xai: { domain: 'x.ai' },
  perplexity: { domain: 'perplexity.ai', github: 'perplexity-ai' },
  elevenlabs: { domain: 'elevenlabs.io' },
  runway: { domain: 'runwayml.com', github: 'runwayml' },
  'hugging face': { domain: 'huggingface.co', github: 'huggingface' },
  mistral: { domain: 'mistral.ai', github: 'mistralai' },
  cohere: { domain: 'cohere.com', github: 'cohere-ai' },
  scale: { domain: 'scale.com', github: 'scaleapi' },
  anduril: { domain: 'anduril.com', github: 'anduril' },
  databricks: { domain: 'databricks.com', github: 'databricks' },
  groq: { domain: 'groq.com', github: 'groq' },
  cerebras: { domain: 'cerebras.net' },
  sambanova: { domain: 'sambanova.ai', github: 'sambanova' },
  glean: { domain: 'glean.com' },
  sierra: { domain: 'sierra.ai' },
  cognition: { domain: 'cognition.ai', github: 'cognition-ai' },
  poolside: { domain: 'poolside.ai', github: 'poolside' },
  magic: { domain: 'magic.dev' },
  adept: { domain: 'adept.ai', github: 'adept-ai' },
  inflection: { domain: 'inflection.ai' },
  coreweave: { domain: 'coreweave.com' },
  lambda: { domain: 'lambdalabs.com' },
  stability: { domain: 'stability.ai', github: 'stability-ai' },
  replit: { domain: 'replit.com', github: 'replit' },
  bolt: { domain: 'bolt.new' },
  lovable: { domain: 'lovable.dev' },
  webflow: { domain: 'webflow.com' },
  retool: { domain: 'retool.com' },
  zapier: { domain: 'zapier.com' },
  vercel: { domain: 'vercel.com', github: 'vercel' },
  supabase: { domain: 'supabase.com', github: 'supabase' },
  neon: { domain: 'neon.tech', github: 'neondatabase' },
  modal: { domain: 'modal.com' },
  together: { domain: 'together.ai', github: 'togethercomputer' },
  stripe: { domain: 'stripe.com', github: 'stripe' },
};

export function getKnownCompanyLogoUrl(companyName: string | null | undefined): string | null {
  if (!companyName) return null;
  const lower = companyName.toLowerCase().trim();
  const firstWord = lower.split(/\s+/)[0] ?? lower;
  const info = KNOWN_COMPANY_LOGOS[lower] ?? KNOWN_COMPANY_LOGOS[firstWord];
  if (!info) return null;
  if (info.github) return `https://github.com/${info.github}.png`;
  return `https://logo.clearbit.com/${info.domain}`;
}

export function getKnownCompanyDomain(companyName: string | null | undefined): string | null {
  if (!companyName) return null;
  const lower = companyName.toLowerCase().trim();
  const firstWord = lower.split(/\s+/)[0] ?? lower;
  const info = KNOWN_COMPANY_LOGOS[lower] ?? KNOWN_COMPANY_LOGOS[firstWord];
  return info?.domain ?? null;
}

export function extractFunding(headline: string, description: string): FundingExtraction | null {
  const combined = `${headline} ${description}`;
  const companyName = extractCompanyName(headline);
  const amount = extractAmount(combined);
  const roundType = extractRoundType(combined);

  if (!companyName && !amount && !roundType) return null;

  let confidence: FundingExtraction['confidence'] = 'none';
  if (companyName && amount && roundType) confidence = 'high';
  else if ((companyName && amount) || (companyName && roundType)) confidence = 'medium';
  else if (companyName || amount) confidence = 'low';

  const companyLogoUrl = getKnownCompanyLogoUrl(companyName);
  const knownDomain = getKnownCompanyDomain(companyName);
  const companyWebsite = knownDomain ? `https://${knownDomain}` : null;

  return {
    companyName: companyName ?? 'Unknown',
    companyWebsite,
    companyLogoUrl,
    amount: amount?.amount ?? null,
    amountDisplay: amount?.display ?? 'Undisclosed',
    currency: 'USD',
    roundType: roundType ?? 'undisclosed',
    investors: [],
    investorsEnriched: [],
    confidence,
  };
}

// ---------------------------------------------------------------------------
// RSS parsing (lightweight regex)
// ---------------------------------------------------------------------------

function decodeHtmlEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity: string) => {
    const named: Record<string, string> = {
      amp: '&',
      lt: '<',
      gt: '>',
      quot: '"',
      apos: "'",
      nbsp: ' ',
    };
    if (named[entity]) return named[entity];
    if (entity.startsWith('#x')) {
      const code = Number.parseInt(entity.slice(2), 16);
      if (Number.isFinite(code)) return String.fromCharCode(code);
    }
    if (entity.startsWith('#')) {
      const code = Number.parseInt(entity.slice(1), 10);
      if (Number.isFinite(code)) return String.fromCharCode(code);
    }
    return match;
  });
}

function stripHtml(value: string): string {
  return decodeHtmlEntities(
    value
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/\s+/g, ' ')
    .trim();
}

function extractTag(block: string, tag: string): string | null {
  const pattern = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const match = block.match(pattern);
  if (!match) return null;
  const raw = match[1] ?? '';
  const cdata = raw.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/i);
  return decodeHtmlEntities(cdata?.[1] ?? raw).trim();
}

export interface RssItem {
  headline: string;
  description: string;
  sourceUrl: string;
  publishedAt: string;
}

export function parseRssItems(xml: string): RssItem[] {
  const items = xml.match(/<item\b[\s\S]*?<\/item>/gi) ?? [];
  const posts: RssItem[] = [];
  for (const item of items) {
    const title = extractTag(item, 'title') ?? '';
    const link = extractTag(item, 'link') ?? extractTag(item, 'guid') ?? '';
    const description = extractTag(item, 'description') ?? '';
    const pubDate = extractTag(item, 'pubDate') ?? '';
    if (!title || !link) continue;
    posts.push({
      headline: stripHtml(title),
      description: stripHtml(description),
      sourceUrl: link,
      publishedAt: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
    });
  }
  return posts;
}
