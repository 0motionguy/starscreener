// X engagement — pre-compose on-topic classifier.
//
// A cheap, high-precision gate that runs BEFORE the LLM composer so we never
// spend a call (or risk a reply) on posts we should never touch. SKIP is the
// default posture — this only lets through posts that look genuinely
// AI/dev-relevant. The nuanced "is there a real repo/number to add?" decision
// still belongs to the composer (which is prompted to reply SKIP when not).
//
// Rules:
//   - GLOBAL brand safety: never engage crypto or politics, on any account.
//   - Per-account cautionFlags (from targets.ts):
//       no-hot-takes   → skip hot-takes / drama / opinion bait (e.g. @theo)
//       skip-hype      → skip pure-hype posts (e.g. @heyBarsee)
//       skip-link-only → skip link-only reposts with no substance (e.g. @aiedge_)
//
// Pure + deterministic — unit tested.

import type { EngagementCandidate, EngagementTarget } from "./types";

export interface ClassifyResult {
  engage: boolean;
  reason: string;
}

// Crypto / politics — brand-safety exclusions. Word-boundary anchored to avoid
// false hits (e.g. "ethereal", "solid").
const CRYPTO_POLITICS_RE =
  /\b(crypto|bitcoin|btc|ethereum|\$?eth|airdrop|memecoin|shitcoin|solana|\$?sol|nft|web3|defi|token(?:s|ized)?|presidential|election|senate|congress|politics?|political|democrat|republican|trump|biden|geopolit)\b/i;

// Hot-take / drama / opinion bait.
const HOT_TAKE_RE =
  /\b(hot ?take|unpopular opinion|controversial|change my mind|fight me|am i the only|overrated|underrated|is dead|will kill|worse than|better than|\bvs\.?\b|ratio(?:'?d)?|cope|copium|\bmid\b|clown|dunk)\b/i;

// Pure hype with no technical hook.
const HYPE_RE =
  /\b(insane|mind[- ]?blowing|game[- ]?changer|this is huge|the future is here|revolutionary|will change everything|breaks? the internet|nobody is talking about|you won'?t believe)\b/i;

/** A post that is essentially just a link (link-only repost). */
function looksLinkOnly(text: string): boolean {
  const stripped = text
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return stripped.length < 15;
}

/**
 * Decide whether a candidate is worth composing a reply for. Returns
 * `{ engage:false, reason }` to skip, `{ engage:true }` to proceed to compose.
 */
export function classifyCandidate(
  post: Pick<EngagementCandidate, "text">,
  target?: Pick<EngagementTarget, "cautionFlags">,
): ClassifyResult {
  const text = post.text ?? "";
  const flags = target?.cautionFlags ?? [];

  // Global brand safety — crypto/politics is always off-limits.
  if (CRYPTO_POLITICS_RE.test(text)) {
    return { engage: false, reason: "off-topic-crypto-politics" };
  }

  if (flags.includes("no-hot-takes") && HOT_TAKE_RE.test(text)) {
    return { engage: false, reason: "hot-take" };
  }
  if (flags.includes("skip-hype") && HYPE_RE.test(text)) {
    return { engage: false, reason: "pure-hype" };
  }
  if (flags.includes("skip-link-only") && looksLinkOnly(text)) {
    return { engage: false, reason: "link-only-repost" };
  }

  return { engage: true, reason: "on-topic" };
}
