// IndexNow client for TrendingRepo (STARSCREENER).
//
// Pings api.indexnow.org with newly-published URLs so Bing/Yandex/Seznam
// (and Google indirectly via the Bing index) can crawl within seconds
// instead of waiting on sitemap polling.
//
// Triggers: trending refresh (compute-deltas tail of the trending pipeline)
// and the funding ingest flow. Both are content-creation events that mint
// or materially update public pages — repo detail pages, the homepage
// leaderboard, and the breakouts page.
//
// Spec: https://www.indexnow.org/documentation
// Key file lives at /<key>.txt — see app/[indexnowKey].txt/route.ts
//
// All functions are fire-and-forget: failure to ping does NOT block the
// caller. Errors are logged via console.warn.

import { SITE_URL } from "@/lib/seo";

const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";

export function getIndexNowKey(): string | null {
  const k = process.env.INDEXNOW_KEY?.trim();
  if (!k) return null;
  // Spec: 8-128 chars, [a-zA-Z0-9-]
  if (!/^[a-zA-Z0-9-]{8,128}$/.test(k)) {
    console.warn("[indexnow] INDEXNOW_KEY env var is set but malformed");
    return null;
  }
  return k;
}

export async function pingIndexNow(
  urls: string[],
): Promise<{ ok: boolean; status?: number; reason?: string }> {
  if (urls.length === 0) return { ok: false, reason: "no urls" };
  const key = getIndexNowKey();
  if (!key) return { ok: false, reason: "INDEXNOW_KEY not set — skipping ping" };

  const host = new URL(SITE_URL).host;
  const keyLocation = `${SITE_URL}/${key}.txt`;

  // IndexNow accepts up to 10,000 urls per ping. We'll cap at 100 to be safe.
  const urlList = urls.slice(0, 100);

  const body = JSON.stringify({ host, key, keyLocation, urlList });

  try {
    const res = await fetch(INDEXNOW_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body,
    });
    if (res.ok || res.status === 202) {
      return { ok: true, status: res.status };
    }
    return { ok: false, status: res.status, reason: `HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, reason: (err as Error).message };
  }
}

/**
 * Fire-and-forget version that doesn't block the caller and logs failures.
 * Use this from request handlers and background jobs.
 */
export function pingIndexNowAsync(urls: string[]): void {
  pingIndexNow(urls)
    .then((result) => {
      if (!result.ok) {
        console.warn(
          `[indexnow] ping failed: ${result.reason ?? "unknown"} (${urls.length} urls)`,
        );
      } else {
        console.log(
          `[indexnow] pinged ${urls.length} urls (status ${result.status})`,
        );
      }
    })
    .catch((err) => {
      console.warn(`[indexnow] unhandled error: ${(err as Error).message}`);
    });
}
