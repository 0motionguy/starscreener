import { SITE_URL } from "./seo";

const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";

export function getIndexNowKey(): string | null {
  const key = process.env.INDEXNOW_KEY?.trim();
  if (!key) return null;
  if (!/^[a-zA-Z0-9-]{8,128}$/.test(key)) {
    console.warn("[indexnow] INDEXNOW_KEY env var is set but malformed");
    return null;
  }
  return key;
}

export async function pingIndexNow(
  urls: string[],
): Promise<{ ok: boolean; status?: number; reason?: string }> {
  if (urls.length === 0) return { ok: false, reason: "no urls" };

  const key = getIndexNowKey();
  if (!key) return { ok: false, reason: "INDEXNOW_KEY not set - skipping ping" };

  const host = new URL(SITE_URL).host;
  const keyLocation = `${SITE_URL}/${key}.txt`;
  const urlList = urls.slice(0, 100);

  try {
    const response = await fetch(INDEXNOW_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({ host, key, keyLocation, urlList }),
    });

    if (response.ok || response.status === 202) {
      return { ok: true, status: response.status };
    }
    return {
      ok: false,
      status: response.status,
      reason: `HTTP ${response.status}`,
    };
  } catch (err) {
    return { ok: false, reason: (err as Error).message };
  }
}

export function pingIndexNowAsync(urls: string[]): void {
  pingIndexNow(urls)
    .then((result) => {
      if (!result.ok) {
        console.warn(
          `[indexnow] ping failed: ${result.reason ?? "unknown"} (${urls.length} urls)`,
        );
      }
    })
    .catch((err) => {
      console.warn(`[indexnow] unhandled error: ${(err as Error).message}`);
    });
}
