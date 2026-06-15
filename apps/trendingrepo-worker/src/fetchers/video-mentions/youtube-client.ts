// youtube-client — thin wrapper around the YouTube Data API v3 search endpoint.
//
// We use the Search:list endpoint (https://developers.google.com/youtube/v3/docs/search/list)
// with `part=snippet,id`, `type=video`, `publishedAfter=<ISO>`, `q=<query>` and
// `maxResults=50`. The endpoint returns `pageInfo.totalResults` which is the
// total number of matching videos across the whole result set — we use that
// as the 7-day mention count, and pull the first 5 snippet items as a sample
// for `topVideos`.
//
// QUOTA NOTE
// Each Search:list call costs 100 quota units against the API key. The default
// daily quota on the free tier is 10,000 units, so the practical ceiling is
// ~100 search calls per day per project. The fetcher caps repos per run via
// YOUTUBE_MAX_REPOS_PER_RUN (default 100, see index.ts) — operators tuning to
// the free tier should drop this to ~4 so 24 hourly runs stay under quota.
// To run the full top-200 sweep every 2h as designed, request a quota bump
// in Google Cloud Console; the fetcher itself does no quota accounting.

const YOUTUBE_SEARCH_ENDPOINT = 'https://www.googleapis.com/youtube/v3/search';

export interface YouTubeSearchVideoSample {
  title: string;
  url: string;
  channelTitle?: string;
  publishedAt?: string;
}

export interface YouTubeSearchResult {
  /** `pageInfo.totalResults` — the upstream-reported total match count. */
  totalResults: number;
  /** Up to 5 of the most relevant videos for context. */
  topVideos: YouTubeSearchVideoSample[];
}

interface YouTubeSearchResponse {
  pageInfo?: {
    totalResults?: number;
    resultsPerPage?: number;
  };
  items?: Array<{
    id?: { videoId?: string };
    snippet?: {
      title?: string;
      channelTitle?: string;
      publishedAt?: string;
    };
  }>;
  error?: {
    code?: number;
    message?: string;
    errors?: Array<{ reason?: string; message?: string }>;
  };
}

export class YouTubeQuotaExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'YouTubeQuotaExceededError';
  }
}

export class YouTubeApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'YouTubeApiError';
    this.status = status;
  }
}

export interface SearchVideosOptions {
  query: string;
  apiKey: string;
  publishedAfter: string;
  maxResults?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

/**
 * Run a single Search:list call against the YouTube Data API v3. Returns the
 * upstream `pageInfo.totalResults` and the first up-to-5 snippet items.
 *
 * Throws `YouTubeQuotaExceededError` when the upstream returns 403 + a
 * `quotaExceeded`/`dailyLimitExceeded` reason — callers should stop the run
 * rather than burning more quota.
 *
 * Throws `YouTubeApiError` for any other non-OK status with the upstream message.
 */
export async function searchVideos(opts: SearchVideosOptions): Promise<YouTubeSearchResult> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const maxResults = Math.max(1, Math.min(50, opts.maxResults ?? 50));
  const params = new URLSearchParams({
    part: 'snippet',
    q: opts.query,
    type: 'video',
    publishedAfter: opts.publishedAfter,
    maxResults: String(maxResults),
    key: opts.apiKey,
  });
  const url = `${YOUTUBE_SEARCH_ENDPOINT}?${params.toString()}`;
  const res = await fetchImpl(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(opts.timeoutMs ?? 15_000),
  });
  let body: YouTubeSearchResponse;
  try {
    body = (await res.json()) as YouTubeSearchResponse;
  } catch {
    throw new YouTubeApiError(`youtube: non-JSON response (${res.status})`, res.status);
  }
  if (!res.ok) {
    const reasons = body.error?.errors?.map((e) => e.reason).filter(Boolean) ?? [];
    const quotaHit = reasons.includes('quotaExceeded') || reasons.includes('dailyLimitExceeded');
    const message = body.error?.message ?? `${res.status} ${res.statusText}`;
    if (quotaHit) {
      throw new YouTubeQuotaExceededError(`youtube: quota exceeded — ${message}`);
    }
    throw new YouTubeApiError(`youtube: ${message}`, res.status);
  }
  const totalResults =
    typeof body.pageInfo?.totalResults === 'number' && Number.isFinite(body.pageInfo.totalResults)
      ? body.pageInfo.totalResults
      : 0;
  const items = Array.isArray(body.items) ? body.items : [];
  const topVideos: YouTubeSearchVideoSample[] = items
    .slice(0, 5)
    .map((it) => {
      const videoId = it.id?.videoId;
      if (!videoId || !it.snippet?.title) return null;
      const sample: YouTubeSearchVideoSample = {
        title: it.snippet.title,
        url: `https://www.youtube.com/watch?v=${videoId}`,
      };
      if (it.snippet.channelTitle) sample.channelTitle = it.snippet.channelTitle;
      if (it.snippet.publishedAt) sample.publishedAt = it.snippet.publishedAt;
      return sample;
    })
    .filter((v): v is YouTubeSearchVideoSample => v !== null);
  return { totalResults, topVideos };
}

/**
 * Build the 7-day `publishedAfter` ISO timestamp the fetcher passes to the
 * YouTube API for every query. Pure — exported so the fetcher and tests can
 * agree on the window without dragging Date.now() into the units under test.
 */
export function sevenDaysAgo(now: Date = new Date()): string {
  const past = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  return past.toISOString();
}
