import { createHmac, randomUUID } from 'node:crypto';

const REQUEST_TIMEOUT_MS = 5_000;
const MAX_EVENTS_PER_BATCH = 500;
const PRODUCED_BY = 'trendingrepo';

type ToolboxNormalized = {
  key: string;
  value: unknown;
  confidence: number;
};

export type ToolboxEvent = {
  scan_id: string;
  target_url: string;
  signal_type: string;
  normalized: ToolboxNormalized[];
  produced_by: string;
  produced_at: string;
};

export type ToolboxIngestResult = {
  status: 'ok' | 'skipped' | 'failed';
  reason?: string;
  http_status?: number;
  duration_ms?: number;
  error?: string;
  accepted?: number;
  rejected?: number;
  batches?: number;
};

type DeltaValue = {
  value: number | null;
  basis?: string;
  age_seconds?: number;
};

type DeltasPayload = {
  repos?: Record<string, unknown>;
};

type MentionBucket = {
  count7d?: number;
  scoreSum7d?: number;
  everHitFrontPage?: boolean;
  topStory?: unknown;
  stories?: unknown[];
};

type HnMentionsPayload = {
  mentions?: Record<string, MentionBucket>;
};

type NpmPackageRow = {
  name?: string;
  npmUrl?: string;
  latestVersion?: string | null;
  publishedAt?: string | null;
  description?: string | null;
  repositoryUrl?: string | null;
  linkedRepo?: string | null;
  homepage?: string | null;
  keywords?: string[];
  downloads24h?: number;
  downloads7d?: number;
  downloads30d?: number;
  delta24h?: number;
  delta7d?: number;
  delta30d?: number;
};

type NpmPackagesPayload = {
  packages?: NpmPackageRow[];
};

function githubRepoUrl(fullName: string): string | null {
  const trimmed = fullName.trim();
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(trimmed)) return null;
  return `https://github.com/${trimmed}`;
}

export function pushNormalized(
  arr: ToolboxNormalized[],
  key: string,
  value: unknown,
  confidence: number,
): void {
  if (value === null || value === undefined) return;
  arr.push({ key, value, confidence });
}

export async function postToolboxEvents(events: ToolboxEvent[]): Promise<ToolboxIngestResult> {
  const url = process.env.TOOLBOX_INGEST_URL?.trim();
  const secret = process.env.TOOLBOX_INGEST_HMAC_SECRET?.trim();
  if (!url || !secret) return { status: 'skipped', reason: 'env_unset' };
  if (events.length === 0) return { status: 'skipped', reason: 'no_events' };

  if (events.length > MAX_EVENTS_PER_BATCH) {
    const results: ToolboxIngestResult[] = [];
    for (let i = 0; i < events.length; i += MAX_EVENTS_PER_BATCH) {
      results.push(await postToolboxEvents(events.slice(i, i + MAX_EVENTS_PER_BATCH)));
    }
    const accepted = results.reduce((sum, r) => sum + (r.accepted ?? 0), 0);
    const rejected = results.reduce((sum, r) => sum + (r.rejected ?? 0), 0);
    return {
      status: results.every((r) => r.status === 'ok') ? 'ok' : 'failed',
      accepted,
      rejected,
      batches: results.length,
    };
  }

  const body = JSON.stringify({ source: 'trendingrepo', events });
  const signature = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
  const startedAt = Date.now();

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-toolbox-signature': signature,
      },
      body,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const duration_ms = Date.now() - startedAt;
    const parsed = (await res.json().catch(() => null)) as
      | { accepted?: number; rejected?: unknown[] | number }
      | null;
    const rejected =
      typeof parsed?.rejected === 'number'
        ? parsed.rejected
        : Array.isArray(parsed?.rejected)
          ? parsed.rejected.length
          : undefined;
    return {
      status: res.ok ? 'ok' : 'failed',
      http_status: res.status,
      duration_ms,
      accepted: parsed?.accepted,
      rejected,
    };
  } catch (err) {
    return {
      status: 'failed',
      duration_ms: Date.now() - startedAt,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export function deltasToToolboxEvents(
  payload: DeltasPayload,
  repoFullNamesById: Map<string, string>,
): ToolboxEvent[] {
  const repos = payload.repos;
  if (!repos) return [];

  const producedAt = new Date().toISOString();
  const scanId = randomUUID();
  const events: ToolboxEvent[] = [];

  for (const [repoId, deltas] of Object.entries(repos)) {
    if (!deltas || typeof deltas !== 'object') continue;
    const record = deltas as Record<string, unknown>;
    const fullName = repoFullNamesById.get(String(repoId));
    if (!fullName) continue;
    const targetUrl = githubRepoUrl(fullName);
    if (!targetUrl) continue;

    const starsNormalized: ToolboxNormalized[] = [];
    pushNormalized(starsNormalized, 'stars_now', record.stars_now ?? 0, 1);
    for (const win of ['1h', '24h', '7d', '30d']) {
      const d = record[`delta_${win}`] as DeltaValue | undefined;
      if (!d || typeof d !== 'object') continue;
      const confidence = d.basis === 'exact' ? 1 : d.basis === 'nearest' ? 0.7 : 0.5;
      pushNormalized(starsNormalized, `delta_${win}`, d.value, confidence);
      pushNormalized(starsNormalized, `delta_${win}_basis`, d.basis, 1);
      pushNormalized(starsNormalized, `delta_${win}_age_seconds`, d.age_seconds, 1);
    }
    if (starsNormalized.length > 0) {
      events.push({
        scan_id: scanId,
        target_url: targetUrl,
        signal_type: 'trending.github.stars.velocity',
        normalized: starsNormalized,
        produced_by: `${PRODUCED_BY}-deltas`,
        produced_at: producedAt,
      });
    }

    if (typeof record.forks_now === 'number') {
      const forkNormalized: ToolboxNormalized[] = [];
      pushNormalized(forkNormalized, 'forks_now', record.forks_now, 1);
      for (const win of ['1h', '24h', '7d', '30d']) {
        const d = record[`fork_delta_${win}`] as DeltaValue | undefined;
        if (!d || typeof d !== 'object') continue;
        pushNormalized(forkNormalized, `fork_delta_${win}`, d.value, 0.7);
        pushNormalized(forkNormalized, `fork_delta_${win}_basis`, d.basis, 1);
        pushNormalized(forkNormalized, `fork_delta_${win}_age_seconds`, d.age_seconds, 1);
      }
      if (forkNormalized.length > 0) {
        events.push({
          scan_id: scanId,
          target_url: targetUrl,
          signal_type: 'trending.github.fork.velocity',
          normalized: forkNormalized,
          produced_by: `${PRODUCED_BY}-deltas`,
          produced_at: producedAt,
        });
      }
    }
  }

  return events;
}

export function hnMentionsToToolboxEvents(payload: HnMentionsPayload): ToolboxEvent[] {
  const mentions = payload.mentions;
  if (!mentions) return [];

  const producedAt = new Date().toISOString();
  const scanId = randomUUID();
  const events: ToolboxEvent[] = [];

  for (const [fullName, mention] of Object.entries(mentions)) {
    const targetUrl = githubRepoUrl(fullName);
    if (!targetUrl) continue;
    const stories = Array.isArray(mention.stories) ? mention.stories.slice(0, 10) : [];
    const normalized: ToolboxNormalized[] = [
      { key: 'count_7d', value: mention.count7d ?? 0, confidence: 1 },
      { key: 'score_sum_7d', value: mention.scoreSum7d ?? 0, confidence: 1 },
      { key: 'ever_hit_front_page', value: mention.everHitFrontPage === true, confidence: 1 },
      { key: 'stories_top10', value: stories, confidence: 1 },
    ];
    pushNormalized(normalized, 'top_story', mention.topStory, 1);
    events.push({
      scan_id: scanId,
      target_url: targetUrl,
      signal_type: 'trending.hn.mentions',
      normalized,
      produced_by: `${PRODUCED_BY}-hn`,
      produced_at: producedAt,
    });
  }

  return events;
}

export function npmPackagesToToolboxEvents(payload: NpmPackagesPayload): ToolboxEvent[] {
  const packages = payload.packages;
  if (!Array.isArray(packages)) return [];

  const producedAt = new Date().toISOString();
  const scanId = randomUUID();
  const events: ToolboxEvent[] = [];

  for (const pkg of packages) {
    const targetUrl = typeof pkg.npmUrl === 'string' ? pkg.npmUrl : '';
    if (!/^https?:\/\//i.test(targetUrl)) continue;
    const normalized: ToolboxNormalized[] = [];
    pushNormalized(normalized, 'name', pkg.name, 1);
    pushNormalized(normalized, 'latest_version', pkg.latestVersion, 1);
    pushNormalized(normalized, 'published_at', pkg.publishedAt, 1);
    pushNormalized(normalized, 'description', pkg.description, 1);
    pushNormalized(normalized, 'repository_url', pkg.repositoryUrl, 1);
    pushNormalized(normalized, 'linked_repo', pkg.linkedRepo, 1);
    pushNormalized(normalized, 'homepage', pkg.homepage, 1);
    pushNormalized(normalized, 'downloads_24h', pkg.downloads24h, 1);
    pushNormalized(normalized, 'downloads_7d', pkg.downloads7d, 1);
    pushNormalized(normalized, 'downloads_30d', pkg.downloads30d, 1);
    pushNormalized(normalized, 'delta_24h', pkg.delta24h, 1);
    pushNormalized(normalized, 'delta_7d', pkg.delta7d, 1);
    pushNormalized(normalized, 'delta_30d', pkg.delta30d, 1);
    if (Array.isArray(pkg.keywords) && pkg.keywords.length > 0) {
      pushNormalized(normalized, 'keywords', pkg.keywords.slice(0, 20), 1);
    }
    if (normalized.length === 0) continue;
    events.push({
      scan_id: scanId,
      target_url: targetUrl,
      signal_type: 'trending.npm.packages',
      normalized,
      produced_by: `${PRODUCED_BY}-npm`,
      produced_at: producedAt,
    });
  }

  return events;
}
