// /top10 — multi-platform share intent builders.
//
// One pure function per platform, mirroring the shape of
// `src/lib/twitter/outbound/share.ts:buildShareToXUrl`. V1 ships X + Reddit
// only (user-scoped decision in the redesign brief); the file is scaffolded
// so V2 can drop in builders for LinkedIn / Bluesky / Threads / HN /
// Telegram / WhatsApp / Email without touching the ShareSheet wiring.
//
// Each builder returns a fully-encoded URL safe to use as an anchor href.
// Callers compose the canonical /top10 page URL with utm tags via withUtm()
// before passing it in — these builders don't mutate the URL.

import { buildShareToXUrl } from "@/lib/twitter/outbound/share";

export interface ShareInput {
  /** The page URL the recipient should land on. Must be absolute. */
  url: string;
  /** Pre-filled post body. Platforms that don't accept text (LinkedIn) ignore. */
  text: string;
  /** Display title — Reddit / HN use this as the post title. */
  title?: string;
  /** "via @handle" if the platform supports it. X only in V1. */
  via?: string;
}

// ---------------------------------------------------------------------------
// X / Twitter — re-export the existing builder so consumers can import
// everything from one module. Same shape; do NOT duplicate the impl.
// ---------------------------------------------------------------------------

export function buildXShareUrl(input: ShareInput): string {
  return buildShareToXUrl({
    text: input.text,
    url: input.url,
    via: input.via ? [input.via] : undefined,
  });
}

// ---------------------------------------------------------------------------
// Reddit — opens the submit composer pre-filled with URL + title. Reddit
// ignores `text` for link posts (the post type submit-link creates); the
// title is what shows up in feeds.
// https://www.reddit.com/wiki/api#wiki_submission_url_format
// ---------------------------------------------------------------------------

const REDDIT_INTENT_URL = "https://www.reddit.com/submit";

export function buildRedditShareUrl(input: ShareInput): string {
  const params = new URLSearchParams();
  params.set("url", input.url);
  // Reddit caps title at 300 chars; we pass our own (always shorter).
  if (input.title) params.set("title", input.title);
  return `${REDDIT_INTENT_URL}?${params.toString()}`;
}

// ---------------------------------------------------------------------------
// V2 platform list (commented out — uncomment + wire when shipping).
//
// LinkedIn:   https://www.linkedin.com/sharing/share-offsite/?url=${url}
// Bluesky:    https://bsky.app/intent/compose?text=${text + " " + url}
// Threads:    https://threads.net/intent/post?text=${text + " " + url}
// Hacker News: https://news.ycombinator.com/submitlink?u=${url}&t=${title}
// Telegram:   https://t.me/share/url?url=${url}&text=${text}
// WhatsApp:   https://wa.me/?text=${text + " " + url}
// Email:      mailto:?subject=${title}&body=${text + "\n\n" + url}
// Mastodon:   https://${instance}/share?text=${text + " " + url}
//
// All follow the ShareInput contract above; ShareSheet enumerates a
// platform array, so adding one is: builder fn + ShareSheet button row entry.
// ---------------------------------------------------------------------------

/**
 * Platform metadata for the ShareSheet UI. V1 only lists X + Reddit; V2 adds
 * the rest. Order in this array drives the button row order on the page.
 */
export interface SharePlatform {
  id: "x" | "reddit";
  /** Human label on the button. */
  label: string;
  /** Single glyph or emoji — kept short, the row is space-constrained. */
  glyph: string;
  /** UTM medium tag — feeds analytics so the team can see which platforms convert. */
  utmMedium: string;
  /** Build the intent URL. Receives a fully-composed (UTM-tagged) page URL + text + title. */
  build(input: ShareInput): string;
}

export const SHARE_PLATFORMS: SharePlatform[] = [
  {
    id: "x",
    label: "Post on X",
    glyph: "𝕏",
    utmMedium: "x",
    build: buildXShareUrl,
  },
  {
    id: "reddit",
    label: "Post on Reddit",
    // Stylized "/r/" reads instantly as Reddit to anyone familiar with subs.
    // Avoids the emoji-rendering gap on platforms that don't have Reddit's
    // brand icon.
    glyph: "r/",
    utmMedium: "reddit",
    build: buildRedditShareUrl,
  },
];
