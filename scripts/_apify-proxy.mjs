// Apify Proxy adapter — routes fetch() calls through Apify's residential
// IP pool so Reddit (and any other host that IP-blocks GitHub Actions
// runners) sees traffic from a non-datacenter address.
//
// Usage:
//   import { apifyAwareFetch } from "./_apify-proxy.mjs";
//   const res = await apifyAwareFetch(url, options);
//
// Behavior:
//   - With APIFY_API_TOKEN unset → passes through to native fetch.
//     No cost, no proxy.
//   - With APIFY_API_TOKEN set → routes through
//     http://proxy.apify.com:8000 using HTTP Basic auth
//     `groups-RESIDENTIAL:<token>`. Residential pool rotates IPs
//     per request so Reddit's per-IP throttles reset.
//
// Uses undici's ProxyAgent (Node 18+ bundles undici). No new dep needed.
//
// Tunables via env:
//   APIFY_PROXY_GROUPS — override pool group. Default "RESIDENTIAL".
//     Set to "SHADER_RESIDENTIAL" or "BUYPROXIES94952" for cheaper
//     datacenter IPs if RESIDENTIAL is blocked for the request type.
//   APIFY_PROXY_COUNTRY — ISO-2 country code to pin residential IPs
//     (e.g. "US"). Useful when targeting US-only sites.

import { ProxyAgent, fetch as undiciFetch } from "undici";

const PROXY_URL = "http://proxy.apify.com:8000";

let cachedAgent = null;
let cachedAgentKey = null;

function agentCacheKey() {
  const token = process.env.APIFY_API_TOKEN ?? "";
  const groups = process.env.APIFY_PROXY_GROUPS ?? "RESIDENTIAL";
  const country = process.env.APIFY_PROXY_COUNTRY ?? "";
  return `${token}::${groups}::${country}`;
}

function buildProxyAgent() {
  const token = process.env.APIFY_API_TOKEN;
  if (!token) return null;

  // Apify Proxy Basic-Auth username encodes pool + targeting.
  // Format: `groups-<GROUP1>+<GROUP2>,country-<CC>,session-<id>`
  const groups = process.env.APIFY_PROXY_GROUPS ?? "RESIDENTIAL";
  const country = process.env.APIFY_PROXY_COUNTRY ?? "";
  const userParts = [`groups-${groups}`];
  if (country) userParts.push(`country-${country}`);
  const username = userParts.join(",");

  const authHeader = `Basic ${Buffer.from(`${username}:${token}`, "utf8").toString("base64")}`;

  return new ProxyAgent({
    uri: PROXY_URL,
    token: authHeader,
  });
}

function getAgent() {
  const key = agentCacheKey();
  if (cachedAgent && cachedAgentKey === key) return cachedAgent;
  cachedAgent = buildProxyAgent();
  cachedAgentKey = key;
  return cachedAgent;
}

export function isApifyProxyEnabled() {
  return Boolean(process.env.APIFY_API_TOKEN?.trim());
}

/**
 * Fetch that routes through Apify Proxy when APIFY_API_TOKEN is set,
 * falls through to native fetch otherwise. Drop-in replacement for fetch.
 */
export async function apifyAwareFetch(url, options = {}) {
  const agent = getAgent();
  if (!agent) return fetch(url, options);
  return undiciFetch(url, { ...options, dispatcher: agent });
}

/** Test-only cache reset so env overrides take effect between tests. */
export function resetApifyProxyCacheForTests() {
  cachedAgent = null;
  cachedAgentKey = null;
}
