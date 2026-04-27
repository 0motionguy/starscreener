// Canonicalize a post URL so the same post fetched twice (different feed
// shape, utm_source on share, trailing slash difference) collapses to one
// trending_items.source_id row.

const TRACKING_PREFIXES = ['utm_', 'mc_'];
const TRACKING_EXACT = new Set([
  'ref', 'ref_src', 'gclid', 'fbclid', 'igshid', 'source',
  '_gl', '_ga', 'yclid', 'msclkid', 'mkt_tok',
]);

export function canonicalUrl(input: string): string | null {
  if (!input || typeof input !== 'string') return null;
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;

  url.hostname = url.hostname.toLowerCase();
  url.hash = '';
  if ((url.protocol === 'http:' && url.port === '80') ||
      (url.protocol === 'https:' && url.port === '443')) {
    url.port = '';
  }

  const params = url.searchParams;
  const drop: string[] = [];
  for (const key of params.keys()) {
    const lower = key.toLowerCase();
    if (TRACKING_EXACT.has(lower) || TRACKING_PREFIXES.some((p) => lower.startsWith(p))) {
      drop.push(key);
    }
  }
  for (const key of drop) params.delete(key);

  const remaining = Array.from(params.entries()).sort(([a], [b]) => a.localeCompare(b));
  url.search = '';
  for (const [k, v] of remaining) url.searchParams.append(k, v);

  let pathname = url.pathname;
  if (pathname.length > 1 && pathname.endsWith('/')) {
    pathname = pathname.replace(/\/+$/, '');
    url.pathname = pathname || '/';
  }

  return url.toString();
}
