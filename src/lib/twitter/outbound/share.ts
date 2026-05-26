// "Share to X" URL builder — opens the user's own Twitter composer
// pre-populated with text + the canonical TrendingRepo URL. Zero auth
// required on our side; the intent flow hands off to Twitter to
// authenticate the end user.
//
// 2026-05-24 rewrite: Switched from the separate `?url=` parameter to
// embedding the URL inline at the top of the tweet text. Reason: the
// inline pattern is what Twitter's composer reliably unfurls into a
// preview card while the user is composing (proven by star-history.com's
// share intent — that's the model Mirko explicitly pointed at). When the
// URL is passed as `?url=` Twitter often defers the unfurl until after
// post, so the user sees a bare tweet draft and assumes the share is
// broken. Putting the URL on its own line at the top matches the working
// pattern exactly:
//
//   https://trendingrepo.com/tierlist/XYZ
//
//   <one-line description>
//
//   #hashtag1 #hashtag2 via @TrendingRepo

const INTENT_URL = "https://twitter.com/intent/tweet";

export interface ShareToXInput {
  /**
   * Tweet body — composed by the caller. Do NOT include the URL or the
   * via-handle here; pass them via the `url` / `via` fields so this
   * builder can format them inline with the right spacing.
   */
  text: string;
  /** Canonical URL to share. Must be absolute (https://...). */
  url: string;
  /**
   * Up to 2 via-handles appended as "via @handle" inline at the end of
   * the tweet. Twitter highlights the @-mention as a link automatically.
   */
  via?: string[];
  /**
   * Optional hashtags (no leading `#`). Appended inline with leading `#`
   * after the body, before the via-handle. Up to ~3 looks best.
   */
  hashtags?: string[];
}

/**
 * Build a twitter.com/intent/tweet URL with the share URL embedded
 * inline at the top of the tweet text. The returned string is safe
 * to use as an anchor href or window.open target.
 */
export function buildShareToXUrl(input: ShareToXInput): string {
  const lines: string[] = [];
  if (input.url) lines.push(input.url);

  const body = input.text.trim();
  if (body) {
    if (lines.length > 0) lines.push(""); // blank line between URL and body
    lines.push(body);
  }

  const tags = (input.hashtags ?? [])
    .map((t) => t.replace(/^#+/, "").trim())
    .filter(Boolean)
    .map((t) => `#${t}`);
  const handle = (input.via?.[0] ?? "").replace(/^@+/, "").trim();
  const tail: string[] = [];
  if (tags.length > 0) tail.push(tags.join(" "));
  if (handle) tail.push(`via @${handle}`);
  if (tail.length > 0) {
    if (lines.length > 0) lines.push(""); // blank line before tail
    lines.push(tail.join(" "));
  }

  const text = lines.join("\n");
  const params = new URLSearchParams();
  params.set("text", text);
  return `${INTENT_URL}?${params.toString()}`;
}
