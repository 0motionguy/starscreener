// StarScreener — Nitter (Twitter/X replacement) social adapter.
//
// Twitter doesn't publish an unauthenticated search endpoint any more and
// their API access is gated behind paid tiers. Nitter is a public,
// open-source alternative front-end that mirrors Twitter content and still
// exposes RSS for searches. We probe a handful of public mirrors on module
// load; the first reachable one wins and is cached. If none respond, the
// adapter returns `[]` for every call and `isTwitterAvailable()` stays false so
// the UI can hide the Twitter section entirely (cleanest UX — no error text).
//
// Probe results (as of 2026-04-17, verified first run):
//   - nitter.net            : often 302s to a login/captcha page; sometimes up.
//   - nitter.privacydev.net : typically up; stable RSS endpoint.
//   - nitter.poast.org      : intermittent; Cloudflare-protected.
//   - nitter.tiekoetter.com : up most days; good fallback.
// Add new mirrors to NITTER_MIRRORS below as they come online.
//
// Contract: fetchMentionsForRepo NEVER throws and NEVER returns mock data.
// On any error (timeout, non-200, parse failure) we log `[social:nitter] ...`
// and return []. Rate-limited to 1 request / 10s across the whole process.

import type { SocialPlatform } from "@/lib/types";
import { slugToId } from "@/lib/utils";
import { sourceHealthTracker } from "@/lib/source-health-tracker";
import type { RepoMention, SocialAdapter } from "../types";
import { inferSentiment } from "./social-adapters";

// ---------------------------------------------------------------------------
// Mirror probe
// ---------------------------------------------------------------------------

const NITTER_MIRRORS: string[] = [
  "nitter.net",
  "nitter.privacydev.net",
  "nitter.poast.org",
  "nitter.tiekoetter.com",
];

const USER_AGENT = "TrendingRepo/1.0 (+https://trendingrepo.com)";
const PROBE_TIMEOUT_MS = 3000;
const FETCH_TIMEOUT_MS = 5000;
const RATE_LIMIT_MS = 10_000;

/**
 * Nitter host that won the probe, or null if no mirror was reachable.
 * Module-level so every NitterAdapter instance in the process shares it.
 */
let nitterHost: string | null = null;

let _twitterAvailable = false;

/**
 * Returns whether at least one Nitter mirror is reachable.
 * The UI uses this to decide whether to render the Twitter tab.
 */
export function isTwitterAvailable(): boolean {
  return _twitterAvailable;
}

/**
 * In-flight probe promise — prevents racing callers from launching the same
 * fan-out probe multiple times. `await ensureProbed()` anywhere is safe.
 */
let probePromise: Promise<void> | null = null;

/**
 * Last fetch timestamp (epoch ms) used to space RSS requests >=RATE_LIMIT_MS
 * apart. Module-level so it applies globally, not per-instance.
 */
let lastFetchAt = 0;

function timeoutSignal(ms: number): { signal: AbortSignal; clear: () => void } {
  type TimeoutFn = (ms: number) => AbortSignal;
  const native = (AbortSignal as unknown as { timeout?: TimeoutFn }).timeout;
  if (typeof native === "function") {
    return { signal: native.call(AbortSignal, ms), clear: () => {} };
  }
  const controller = new AbortController();
  const handle = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, clear: () => clearTimeout(handle) };
}

/**
 * Probe a single mirror. Returns true iff it serves 200 and the HTML
 * advertises the Nitter generator meta tag (cheap sanity check against
 * captive portals / parked domains).
 */
async function probeMirror(host: string): Promise<boolean> {
  const url = `https://${host}/about`;
  const { signal, clear } = timeoutSignal(PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal,
      headers: { Accept: "text/html", "User-Agent": USER_AGENT },
      redirect: "manual",
    });
    if (res.status !== 200) return false;
    const body = await res.text();
    // Loose match — nitter forks sometimes customise the content attribute
    // casing but keep the `generator` name.
    return /<meta\s+name=["']generator["']\s+content=["']Nitter/i.test(body);
  } catch {
    return false;
  } finally {
    clear();
  }
}

/**
 * Run the probe across all mirrors in parallel; the first one to answer
 * positively wins. Safe to await concurrently — only one probe ever runs.
 */
async function ensureProbed(): Promise<void> {
  if (nitterHost || probePromise) {
    if (probePromise) await probePromise;
    return;
  }
  probePromise = (async () => {
    for (const host of NITTER_MIRRORS) {
      // Serial probe keeps load predictable and gives us a deterministic
      // winner order (cheap / preferred first).
      const ok = await probeMirror(host);
      if (ok) {
        nitterHost = host;
        _twitterAvailable = true;
        console.log(`[social:nitter] using mirror ${host}`);
        return;
      }
    }
    nitterHost = null;
    _twitterAvailable = false;
    console.warn(
      `[social:nitter] no working mirror found (tried ${NITTER_MIRRORS.join(", ")})`,
    );
  })();
  await probePromise;
}

// LIB-03: Nitter is deprecated — cookie-based access has been killed by
// 2026 anti-bot waves and CLAUDE.md explicitly lists cookie scrapers as
// dead. The supported path is the Apify-backed twitter collector. We
// keep this adapter compiled (a few tests + dev tools still reference
// the type surface) but the probe — and thus actual network requests —
// only runs when ENABLE_NITTER_ADAPTER=1 is set explicitly. Default in
// every env is "off"; prod stays clean of the rate-limited probe traffic.
if (process.env.ENABLE_NITTER_ADAPTER === "1") {
  void ensureProbed();
} else if (process.env.NODE_ENV !== "test") {
  // One-time stale notice so a dev poking at adapters knows the path is
  // off by default. Test env stays quiet to avoid log noise.
  console.warn(
    "[social:nitter] adapter disabled (LIB-03) — Apify provider is the supported Twitter path. " +
      "Set ENABLE_NITTER_ADAPTER=1 to re-enable for offline replay.",
  );
}

// ---------------------------------------------------------------------------
// Rate limiter (global, shared across every instance)
// ---------------------------------------------------------------------------

async function waitForRateLimit(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastFetchAt;
  if (elapsed < RATE_LIMIT_MS) {
    const wait = RATE_LIMIT_MS - elapsed;
    await new Promise((r) => setTimeout(r, wait));
  }
  lastFetchAt = Date.now();
}

// ---------------------------------------------------------------------------
// RSS parsing
// ---------------------------------------------------------------------------

interface RawItem {
  title: string;
  link: string;
  pubDate: string;
  creator: string;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function unwrapCdata(s: string): string {
  const m = s.match(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/);
  return m ? m[1] : s;
}

function extractTag(block: string, tag: string): string | null {
  // Defensive: limit block size to avoid catastrophic backtracking on malformed XML.
  const safeBlock = block.length > 50_000 ? block.slice(0, 50_000) : block;
  // Support optional namespace on tag (e.g. dc:creator) by escaping.
  const esc = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`<${esc}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${esc}>`, "i");
  const m = safeBlock.match(re);
  if (!m) return null;
  return decodeEntities(unwrapCdata(m[1])).trim();
}

function parseRss(xml: string): RawItem[] {
  const items: RawItem[] = [];
  const itemRe = /<item\b[\s\S]*?<\/item>/gi;
  const matches = xml.match(itemRe) ?? [];
  for (const block of matches) {
    const title = extractTag(block, "title");
    const link = extractTag(block, "link");
    const pubDate = extractTag(block, "pubDate");
    const creator =
      extractTag(block, "dc:creator") ?? extractTag(block, "creator") ?? "";
    if (!title || !link || !pubDate) continue;
    items.push({ title, link, pubDate, creator });
  }
  return items;
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export class NitterAdapter implements SocialAdapter {
  public readonly id = "nitter";
  public readonly platform: SocialPlatform = "twitter";

  async fetchMentionsForRepo(
    fullName: string,
    since?: string,
  ): Promise<RepoMention[]> {
    try {
      await ensureProbed();
      if (!nitterHost) return [];
      if (sourceHealthTracker.isOpen("nitter")) return [];

      await waitForRateLimit();

      const q = encodeURIComponent(fullName);
      const url = `https://${nitterHost}/search/rss?f=tweets&q=${q}`;
      const { signal, clear } = timeoutSignal(FETCH_TIMEOUT_MS);
      let xml: string;
      try {
        const res = await fetch(url, {
          signal,
          headers: {
            Accept: "application/rss+xml, application/xml, text/xml",
            "User-Agent": USER_AGENT,
          },
        });
        if (!res.ok) {
          console.error(
            `[social:nitter] HTTP ${res.status} for ${fullName} via ${nitterHost}`,
          );
          sourceHealthTracker.recordFailure("nitter", `HTTP ${res.status}`);
          return [];
        }
        xml = await res.text();
      } finally {
        clear();
      }

      const items = parseRss(xml);
      const repoId = slugToId(fullName);
      const sinceMs = since ? new Date(since).getTime() : null;
      const now = new Date().toISOString();
      const out: RepoMention[] = [];

      for (const item of items) {
        const postedMs = new Date(item.pubDate).getTime();
        if (!Number.isFinite(postedMs) || postedMs <= 0) continue;
        if (sinceMs !== null && postedMs < sinceMs) continue;

        const author = item.creator.replace(/^@/, "").trim() || "anonymous";
        const content = stripHtml(item.title);
        if (!content) continue;

        // Link shape: https://<host>/<user>/status/<id> — derive a stable id.
        const idMatch = item.link.match(/status\/(\d+)/);
        const id = idMatch ? `tw-${idMatch[1]}` : `tw-${postedMs}-${author}`;

        // Prefer the canonical x.com link over the mirror link so
        // clicks go to the real post (users expect that).
        let canonical: string;
        try {
          const url = new URL(item.link);
          url.hostname = "x.com";
          canonical = url.toString();
        } catch {
          canonical = item.link;
        }

        out.push({
          id,
          repoId,
          platform: "twitter",
          author,
          authorFollowers: null,
          content,
          url: canonical,
          sentiment: inferSentiment(content),
          // Nitter RSS doesn't expose engagement metrics — default to 0.
          engagement: 0,
          reach: 0,
          postedAt: new Date(postedMs).toISOString(),
          discoveredAt: now,
          isInfluencer: false,
        });
      }

      sourceHealthTracker.recordSuccess("nitter");
      return out;
    } catch (err) {
      console.error(
        `[social:nitter] fetchMentionsForRepo ${fullName} failed`,
        err,
      );
      sourceHealthTracker.recordFailure("nitter", err);
      return [];
    }
  }
}
