// Apify Proxy adapter for fetchers that need to bypass per-IP blocks
// (Reddit's anti-bot rejects GitHub Actions IPs and likely Railway IPs too).
//
// Mirrors scripts/_apify-proxy.mjs. Native fetch is used unless both
// APIFY_API_TOKEN and TRENDINGREPO_ENABLE_APIFY=operator-approved are set.
//
// Tunables (env):
//   APIFY_API_TOKEN     - token for approved temporary proxy routing
//   TRENDINGREPO_ENABLE_APIFY=operator-approved - required approval gate
//   APIFY_PROXY_GROUPS  - default 'RESIDENTIAL'
//   APIFY_PROXY_COUNTRY - optional ISO-2 country code (e.g. 'US')

import { ProxyAgent, fetch as undiciFetch, type Dispatcher } from 'undici';

import { isApifyTokenApproved } from '../apify-policy.js';

const PROXY_URL = 'http://proxy.apify.com:8000';

let cachedAgent: ProxyAgent | null = null;
let cachedAgentKey: string | null = null;

function agentCacheKey(): string {
  const token = process.env.APIFY_API_TOKEN ?? '';
  const approval = process.env.TRENDINGREPO_ENABLE_APIFY ?? '';
  const groups = process.env.APIFY_PROXY_GROUPS ?? 'RESIDENTIAL';
  const country = process.env.APIFY_PROXY_COUNTRY ?? '';
  return `${token}::${approval}::${groups}::${country}`;
}

function buildProxyAgent(): ProxyAgent | null {
  const token = process.env.APIFY_API_TOKEN?.trim();
  if (!isApifyTokenApproved(token)) return null;

  const groups = process.env.APIFY_PROXY_GROUPS ?? 'RESIDENTIAL';
  const country = process.env.APIFY_PROXY_COUNTRY ?? '';
  const userParts = [`groups-${groups}`];
  if (country) userParts.push(`country-${country}`);
  const username = userParts.join(',');

  const authHeader = `Basic ${Buffer.from(`${username}:${token}`, 'utf8').toString('base64')}`;

  return new ProxyAgent({
    uri: PROXY_URL,
    token: authHeader,
  });
}

function getAgent(): ProxyAgent | null {
  const key = agentCacheKey();
  if (cachedAgent && cachedAgentKey === key) return cachedAgent;
  cachedAgent = buildProxyAgent();
  cachedAgentKey = key;
  return cachedAgent;
}

export function isApifyProxyEnabled(): boolean {
  return isApifyTokenApproved(process.env.APIFY_API_TOKEN);
}

export interface ApifyFetchOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string | Buffer | undefined;
  timeoutMs?: number;
}

export interface ApifyFetchResult {
  ok: boolean;
  status: number;
  statusText: string;
  text(): Promise<string>;
  json(): Promise<unknown>;
  headers: Headers;
}

export async function apifyAwareFetch(url: string, options: ApifyFetchOptions = {}): Promise<ApifyFetchResult> {
  const { timeoutMs = 15_000, ...rest } = options;
  const agent = getAgent();
  const init: Parameters<typeof undiciFetch>[1] = {
    method: rest.method ?? 'GET',
    headers: rest.headers,
    body: rest.body,
    signal: AbortSignal.timeout(timeoutMs),
  };
  if (agent) {
    (init as { dispatcher?: Dispatcher }).dispatcher = agent;
  }
  const res = await undiciFetch(url, init);
  return {
    ok: res.ok,
    status: res.status,
    statusText: res.statusText,
    text: () => res.text(),
    json: () => res.json(),
    headers: res.headers as unknown as Headers,
  };
}
