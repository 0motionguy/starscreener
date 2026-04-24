// "Share to X" URL builder — opens the user's own Twitter composer
// pre-populated with text + the canonical TrendingRepo URL. Zero auth
// required on our side; the intent flow hands off to Twitter to
// authenticate the end user.
//
// Pure function so the UI can use it without bundling any server code.
// Lives under the outbound/ tree because it's semantically part of
// the same "outbound social" capability even though it doesn't use
// an adapter.

const INTENT_URL = "https://twitter.com/intent/tweet";

export interface ShareToXInput {
  /**
   * Tweet body — composed by the caller so each surface (idea card,
   * repo card, breakout) can style its text. Do NOT include the URL
   * here; pass it via `url` so Twitter's intent flow wraps it in an
   * unfurl preview card.
   */
  text: string;
  /** Canonical URL to share. Must be absolute (https://...). */
  url: string;
  /**
   * Up to 2 via-handles appended as "via @handle". Twitter only
   * respects the first `via=` param but we keep the list API shape
   * simple — callers pass `[SITE_HANDLE]` by convention.
   */
  via?: string[];
}

/**
 * Build a twitter.com/intent/tweet URL. All parameters are
 * URL-encoded. The returned string is safe to use as an anchor href
 * or window.open target.
 */
export function buildShareToXUrl(input: ShareToXInput): string {
  const params = new URLSearchParams();
  params.set("text", input.text);
  params.set("url", input.url);
  if (input.via && input.via.length > 0) {
    // Strip leading @ if present — Twitter appends it back.
    const handle = (input.via[0] ?? "").replace(/^@+/, "").trim();
    if (handle) params.set("via", handle);
  }
  return `${INTENT_URL}?${params.toString()}`;
}
