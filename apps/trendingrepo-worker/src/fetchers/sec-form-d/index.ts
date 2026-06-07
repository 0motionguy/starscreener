// SEC EDGAR Form D funding fetcher.
//
// Produces the same FundingNewsFile-shaped payload as scripts/scrape-sec-form-d.mjs,
// but runs inside the HOSTUP worker fleet so SEC is not dependent on a manual
// GitHub backfill. Output slug: `funding-news-sec`.

import type { Fetcher, FetcherContext, RunResult } from '../../lib/types.js';
import { readDataStore, writeDataStore } from '../../lib/redis.js';
import { mergeAndCap, shouldPreserveCache } from '../../lib/util/cache-merge.js';
import { fetchWithTimeout, sleep } from '../../lib/util/http-helpers.js';

const USER_AGENT = 'TrendingRepo Bot ai-funding-radar contact@trendingrepo.com';
const WINDOW_DAYS = 30;
const MAX_HITS_PER_QUERY = 200;
const MAX_DETAILS_PER_RUN = 120;
const MAX_SIGNALS_CACHE = 200;
const SLEEP_MS_BETWEEN_REQUESTS = 150;
const SLEEP_MS_BETWEEN_DETAIL_FETCHES = 100;
const MAX_FETCH_ATTEMPTS = 3;
const RETRY_BACKOFF_MS = [200, 800];

const QUERIES = [
  'AI',
  'GPT',
  'LLM',
  'Neural',
  'AGI',
  'Anthropic',
  'OpenAI',
  'Mistral',
  'Cohere',
  'Perplexity',
  'Robotics',
  'Autonomous',
];

const AI_NAME_HINT_RE =
  /\b(ai|a\.i\.|artificial intelligence|machine learning|ml|deep learning|llm|llms|foundation model|generative|gen-?ai|agi|agents?|copilot|gpt|transformer|diffusion|multimodal|nlp|neural|inference|fine-?tun\w*|rag|vector database|embeddings?|openai|anthropic|mistral|cohere|perplexity|hugging ?face|robotics?|autonomy|autonomous|computer vision|cv|vision)\b/i;

const BAD_NAME_PATTERN =
  /\b(series|fund|capital|partners|management|advisors|trust|holdings|acquisition|acquisitions|insider|nonpublic|pe |private equity|hedge|asset management|family office|spv)\b|^(hii|gaingels|bip|nv |ac )\s|\s+(i{1,3}v?|[0-9]{1,4}|[a-z])\s*(llc|lp|inc|corp)?\s*$/i;

interface SecSearchHit {
  _id?: string;
  _source?: {
    adsh?: string;
    display_names?: unknown;
    file_date?: string;
    ciks?: unknown;
  };
}

interface SecSearchResponse {
  hits?: {
    hits?: SecSearchHit[];
  };
}

interface FilingCandidate {
  adsh: string;
  issuerName: string;
  fileDate: string | null;
  cik: string | null;
}

interface FilingDetail {
  amount: number | null;
  industryGroup: string | null;
  isFund: boolean;
}

interface FundingSignal {
  id: string;
  headline: string;
  description: string;
  sourceUrl: string;
  sourcePlatform: 'sec-form-d';
  publishedAt: string;
  discoveredAt: string;
  extracted: {
    companyName: string;
    companyWebsite: null;
    companyLogoUrl: null;
    amount: number | null;
    amountDisplay: string;
    currency: 'USD';
    roundType: 'undisclosed';
    investors: string[];
    investorsEnriched: string[];
    confidence: 'high' | 'medium' | 'low';
    industryGroup: string | null;
  };
  tags: string[];
}

interface SecFormDPayload {
  status: 'ok' | 'degraded';
  fetchedAt: string;
  source: 'sec-form-d-edgar';
  windowDays: number;
  signals: FundingSignal[];
  errors: Array<{ stage: string; message: string }>;
}

function isoDateNDaysAgo(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

async function fetchWithRetry(
  url: string,
  options: { headers: Record<string, string>; timeoutMs?: number },
  label: string,
): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_FETCH_ATTEMPTS; attempt += 1) {
    try {
      const res = await fetchWithTimeout(url, options);
      if (res.ok) return res;
      if (res.status >= 400 && res.status < 500) {
        throw new Error(`${label} ${res.status} ${res.statusText}`);
      }
      lastErr = new Error(`${label} ${res.status} ${res.statusText}`);
    } catch (err) {
      lastErr = err;
    }
    if (attempt < MAX_FETCH_ATTEMPTS) {
      await sleep(RETRY_BACKOFF_MS[attempt - 1] ?? 1_000);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(`${label} failed`);
}

async function fetchSearch(
  query: string,
  startdt: string,
  enddt: string,
): Promise<SecSearchHit[]> {
  const url = new URL('https://efts.sec.gov/LATEST/search-index');
  url.searchParams.set('q', query);
  url.searchParams.set('forms', 'D');
  url.searchParams.set('dateRange', 'custom');
  url.searchParams.set('startdt', startdt);
  url.searchParams.set('enddt', enddt);
  url.searchParams.set('hits', String(MAX_HITS_PER_QUERY));

  const res = await fetchWithRetry(
    url.toString(),
    {
      timeoutMs: 20_000,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/json',
      },
    },
    `[sec-form-d] search ${query}`,
  );
  const json = (await res.json()) as SecSearchResponse;
  return Array.isArray(json?.hits?.hits) ? json.hits.hits : [];
}

function normalizeIssuerName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const cleaned = raw
    .replace(/\s+\(CIK[^)]+\)\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.length > 0 ? cleaned : null;
}

function isLikelyFund(issuerName: string): boolean {
  return BAD_NAME_PATTERN.test(issuerName);
}

function passesAiHint(issuerName: string): boolean {
  return AI_NAME_HINT_RE.test(issuerName);
}

function buildFilingUrl(cik: string | null, adsh: string): string {
  if (!cik || !adsh) return 'https://www.sec.gov/cgi-bin/browse-edgar';
  const cleanCik = String(cik).replace(/^0+/, '') || '0';
  return `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cleanCik}&type=D&dateb=&owner=include&count=40`;
}

function buildPrimaryDocUrl(cik: string | null, adsh: string): string | null {
  if (!cik || !adsh) return null;
  const cleanCik = String(cik).replace(/^0+/, '') || '0';
  const cleanAdsh = adsh.replace(/-/g, '');
  return `https://www.sec.gov/Archives/edgar/data/${cleanCik}/${cleanAdsh}/primary_doc.xml`;
}

function pluckTag(xml: string, tag: string): string | null {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const match = xml.match(re);
  const inner = match?.[1]?.trim();
  return inner && inner.length > 0 ? inner : null;
}

function isFundFiling(xml: string): boolean {
  const industry = pluckTag(xml, 'industryGroupType');
  if (industry && /\bfund\b/i.test(industry)) return true;
  if (/<investmentFundInfo[\s>]/i.test(xml)) return true;
  return /<isPooledInvestmentFundType>\s*true\s*<\/isPooledInvestmentFundType>/i.test(xml);
}

function formatAmountDisplay(amount: number | null): string {
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
    return 'Undisclosed';
  }
  if (amount >= 1_000_000_000) {
    const v = amount / 1_000_000_000;
    return `$${v % 1 === 0 ? v.toFixed(0) : v.toFixed(1)}B`;
  }
  if (amount >= 1_000_000) {
    const v = amount / 1_000_000;
    return `$${v % 1 === 0 ? v.toFixed(0) : v.toFixed(1)}M`;
  }
  if (amount >= 1_000) return `$${(amount / 1_000).toFixed(0)}K`;
  return `$${amount}`;
}

async function fetchFilingDetail(primaryDocUrl: string | null): Promise<FilingDetail | null> {
  if (!primaryDocUrl) return null;
  try {
    const res = await fetchWithRetry(
      primaryDocUrl,
      {
        timeoutMs: 20_000,
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'application/xml,text/xml,*/*',
        },
      },
      '[sec-form-d] detail',
    );
    const xml = await res.text();
    const amountRaw = pluckTag(xml, 'totalOfferingAmount');
    const amount = amountRaw && Number.isFinite(Number(amountRaw)) && Number(amountRaw) > 0
      ? Number(amountRaw)
      : null;
    return {
      amount,
      industryGroup: pluckTag(xml, 'industryGroupType'),
      isFund: isFundFiling(xml),
    };
  } catch {
    return null;
  }
}

function candidateFromHit(hit: SecSearchHit): FilingCandidate | null {
  const adsh = hit?._source?.adsh ?? hit?._id ?? null;
  if (!adsh) return null;
  const displayNames = hit?._source?.display_names ?? [];
  const issuerNameRaw = Array.isArray(displayNames) ? displayNames[0] : null;
  const issuerName = normalizeIssuerName(issuerNameRaw);
  if (!issuerName || isLikelyFund(issuerName)) return null;
  const ciks = hit?._source?.ciks ?? [];
  const cik = Array.isArray(ciks) && ciks[0] ? String(ciks[0]) : null;
  return {
    adsh,
    issuerName,
    fileDate: hit?._source?.file_date ?? null,
    cik,
  };
}

function signalFromCandidate(
  candidate: FilingCandidate,
  detail: FilingDetail | null,
  discoveredAt: string,
): FundingSignal {
  const primaryDocUrl = buildPrimaryDocUrl(candidate.cik, candidate.adsh);
  const amount = detail?.amount ?? null;
  const nameHints = passesAiHint(candidate.issuerName);
  const confidence = nameHints && amount !== null
    ? 'high'
    : nameHints || amount !== null
      ? 'medium'
      : 'low';
  const tags = ['sec', 'form-d', 'ai', nameHints ? 'ai-confirmed' : 'ai-keyword'];
  if (detail?.industryGroup) {
    tags.push(`industry:${detail.industryGroup.toLowerCase().replace(/\s+/g, '-')}`);
  }
  return {
    id: `sec-form-d-${candidate.adsh}`,
    headline: `${candidate.issuerName} filed Form D`,
    description: `SEC Form D - private offering disclosure (full filing: ${primaryDocUrl ?? 'n/a'})`,
    sourceUrl: buildFilingUrl(candidate.cik, candidate.adsh),
    sourcePlatform: 'sec-form-d',
    publishedAt: candidate.fileDate
      ? new Date(`${candidate.fileDate}T00:00:00Z`).toISOString()
      : discoveredAt,
    discoveredAt,
    extracted: {
      companyName: candidate.issuerName,
      companyWebsite: null,
      companyLogoUrl: null,
      amount,
      amountDisplay: formatAmountDisplay(amount),
      currency: 'USD',
      roundType: 'undisclosed',
      investors: [],
      investorsEnriched: [],
      confidence,
      industryGroup: detail?.industryGroup ?? null,
    },
    tags,
  };
}

const fetcher: Fetcher = {
  name: 'sec-form-d',
  schedule: '17 */2 * * *',
  async run(ctx: FetcherContext): Promise<RunResult> {
    const startedAt = new Date().toISOString();
    const errors: RunResult['errors'] = [];

    if (ctx.dryRun) {
      ctx.log.info('sec-form-d dry-run');
      return done(startedAt, 0, false, errors);
    }

    const enddt = todayIsoDate();
    const startdt = isoDateNDaysAgo(WINDOW_DAYS);
    const seenAdsh = new Set<string>();
    const candidates: FilingCandidate[] = [];

    for (const query of QUERIES) {
      try {
        const hits = await fetchSearch(query, startdt, enddt);
        ctx.log.info({ query, hits: hits.length }, 'sec-form-d search');
        for (const hit of hits) {
          const candidate = candidateFromHit(hit);
          if (!candidate || seenAdsh.has(candidate.adsh)) continue;
          seenAdsh.add(candidate.adsh);
          candidates.push(candidate);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push({ stage: `search:${query}`, message });
        ctx.log.warn({ query, error: message }, 'sec-form-d search failed');
      }
      await sleep(SLEEP_MS_BETWEEN_REQUESTS);
    }

    if (errors.length === QUERIES.length) {
      return done(startedAt, 0, false, errors);
    }

    const discoveredAt = new Date().toISOString();
    const signals: FundingSignal[] = [];
    let droppedAsFund = 0;
    let amountResolved = 0;

    for (const candidate of candidates.slice(0, MAX_DETAILS_PER_RUN)) {
      const detail = await fetchFilingDetail(buildPrimaryDocUrl(candidate.cik, candidate.adsh));
      await sleep(SLEEP_MS_BETWEEN_DETAIL_FETCHES);
      if (detail?.isFund) {
        droppedAsFund += 1;
        continue;
      }
      if (detail?.amount !== null && detail?.amount !== undefined) amountResolved += 1;
      signals.push(signalFromCandidate(candidate, detail, discoveredAt));
    }

    const existing = await readDataStore<SecFormDPayload>('funding-news-sec').catch(() => null);
    const existingSignals = Array.isArray(existing?.signals) ? existing.signals : [];
    if (shouldPreserveCache({ fresh: signals, existing: existingSignals })) {
      ctx.log.warn(
        { existingSignals: existingSignals.length, errors: errors.length },
        'sec-form-d: run produced 0 fresh rows - preserving prior payload',
      );
    }
    const mergedSignals = mergeSecFormDSignals(existingSignals, signals, MAX_SIGNALS_CACHE);

    const payload: SecFormDPayload = {
      status: errors.length > 0 ? 'degraded' : 'ok',
      fetchedAt: discoveredAt,
      source: 'sec-form-d-edgar',
      windowDays: WINDOW_DAYS,
      signals: mergedSignals,
      errors,
    };

    const result = await writeDataStore('funding-news-sec', payload);
    ctx.log.info(
      {
        candidates: candidates.length,
        freshSignals: signals.length,
        existingSignals: existingSignals.length,
        mergedSignals: mergedSignals.length,
        droppedAsFund,
        amountResolved,
        errors: errors.length,
        redisSource: result.source,
      },
      'sec-form-d published',
    );
    return done(startedAt, mergedSignals.length, result.source === 'redis', errors);
  },
};

export default fetcher;

export function mergeSecFormDSignals(
  existing: readonly FundingSignal[],
  fresh: readonly FundingSignal[],
  max: number = MAX_SIGNALS_CACHE,
): FundingSignal[] {
  return mergeAndCap({
    existing,
    fresh,
    key: (signal) => signal.id || signal.sourceUrl,
    compare: compareSignals,
    max,
  });
}

function compareSignals(a: FundingSignal, b: FundingSignal): number {
  const ta = Date.parse(a.publishedAt);
  const tb = Date.parse(b.publishedAt);
  return (Number.isFinite(tb) ? tb : 0) - (Number.isFinite(ta) ? ta : 0);
}

function done(
  startedAt: string,
  items: number,
  redisPublished: boolean,
  errors: RunResult['errors'],
): RunResult {
  return {
    fetcher: 'sec-form-d',
    startedAt,
    finishedAt: new Date().toISOString(),
    itemsSeen: items,
    itemsUpserted: 0,
    metricsWritten: 0,
    redisPublished,
    errors,
  };
}
