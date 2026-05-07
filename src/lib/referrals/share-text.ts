// Default share copy for the X / Twitter share button on /you/refer.
//
// Lead with the personal hook ("I'm tracking…") so the link feels like a
// real recommendation, not a marketing blast. Keep it tweet-sized: ~200
// chars including the URL. The handle is unused in v1 (template is
// generic) but kept on the signature so we can A/B in personalised
// variants later without breaking call sites.

const REFER_BASE_URL = "https://trendingrepo.com";

/**
 * Build the default tweet template for a referral link.
 *
 * Returns plain text — the caller wraps it in `https://twitter.com/intent/tweet?text=...`.
 */
export function defaultShareText(_handle: string, code: string): string {
  return [
    "I'm tracking trending dev tools on TrendingRepo.",
    `Join with my link to see what's breaking out before everyone else: ${REFER_BASE_URL}?ref=${code}`,
  ].join(" ");
}
