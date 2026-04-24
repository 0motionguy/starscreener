// StarScreener — hand-rolled RSS 2.0 serializer.
//
// Pure string builder used by the /feeds/*.xml routes. No deps, no I/O —
// callers supply already-shaped `RssItem[]` and this returns a valid
// RSS 2.0 document with:
//   - XML-escaped title / link / guid / author / category values
//   - Descriptions wrapped in `<![CDATA[ ... ]]>` so inline HTML doesn't
//     need escaping and passes RSS validators
//   - RFC-822 pubDate/lastBuildDate (RSS 2.0 spec requires RFC-822, not ISO)
//   - `atom:link rel="self"` so auto-discovery & validators are happy
//
// Why hand-rolled? Brief 60-line helper, zero new deps, and the output is
// fully deterministic — important because the routes are cacheable.

/** A single RSS item. All fields already normalized; serializer only escapes. */
export interface RssItem {
  /** Plain-text title. Will be XML-escaped. */
  title: string;
  /** Absolute URL. Will be XML-escaped. */
  link: string;
  /** Stable identifier (usually == link). Will be XML-escaped. */
  guid: string;
  /** ISO-8601 timestamp; serialized as RFC-822 per RSS 2.0 spec. */
  pubDate: string;
  /** HTML-or-plain-text body. Wrapped in CDATA so callers don't escape. */
  description: string;
  /** Optional author string (free-form, not strict email format). */
  author?: string;
  /** Optional category labels. */
  categories?: string[];
}

export interface RssFeedOptions {
  title: string;
  /** Canonical feed URL (emitted as `<atom:link rel="self">` + `<link>`). */
  link: string;
  description: string;
  /** ISO-8601 timestamp; serialized as RFC-822. */
  lastBuildDate: string;
  items: RssItem[];
}

// ---------------------------------------------------------------------------
// Escapers
// ---------------------------------------------------------------------------

/**
 * Escape the 5 XML-unsafe characters in attribute + element text.
 * Order matters: `&` must be replaced first so the literal `&amp;` we
 * subsequently emit doesn't get double-escaped.
 */
export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Wrap a string in CDATA, defusing any `]]>` closers that would otherwise
 * terminate the CDATA block early. The standard trick is to split the
 * sequence `]]>` into `]]]]><![CDATA[>` so the serialized text remains
 * bytewise identical when unwrapped.
 */
export function wrapCdata(value: string): string {
  const safe = value.replace(/]]>/g, "]]]]><![CDATA[>");
  return `<![CDATA[${safe}]]>`;
}

/**
 * Convert an ISO-8601 timestamp to RFC-822 (required by RSS 2.0). Falls back
 * to the current time when the input can't be parsed — keeps the feed valid
 * rather than emitting an invalid date node.
 */
export function toRfc822(iso: string): string {
  const t = Date.parse(iso);
  const date = Number.isFinite(t) ? new Date(t) : new Date();
  return date.toUTCString();
}

// ---------------------------------------------------------------------------
// Item + feed serialization
// ---------------------------------------------------------------------------

function renderItem(item: RssItem): string {
  const parts: string[] = [];
  parts.push("    <item>");
  parts.push(`      <title>${escapeXml(item.title)}</title>`);
  parts.push(`      <link>${escapeXml(item.link)}</link>`);
  parts.push(
    `      <guid isPermaLink="${item.guid === item.link ? "true" : "false"}">${escapeXml(item.guid)}</guid>`,
  );
  parts.push(`      <pubDate>${toRfc822(item.pubDate)}</pubDate>`);
  if (item.author && item.author.trim().length > 0) {
    parts.push(`      <author>${escapeXml(item.author)}</author>`);
  }
  if (item.categories) {
    for (const cat of item.categories) {
      if (cat && cat.trim().length > 0) {
        parts.push(`      <category>${escapeXml(cat)}</category>`);
      }
    }
  }
  parts.push(`      <description>${wrapCdata(item.description)}</description>`);
  parts.push("    </item>");
  return parts.join("\n");
}

/** Render a complete RSS 2.0 feed document. */
export function renderRssFeed(opts: RssFeedOptions): string {
  const { title, link, description, lastBuildDate, items } = opts;
  const head = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    "  <channel>",
    `    <title>${escapeXml(title)}</title>`,
    `    <link>${escapeXml(link)}</link>`,
    `    <description>${escapeXml(description)}</description>`,
    `    <lastBuildDate>${toRfc822(lastBuildDate)}</lastBuildDate>`,
    `    <atom:link href="${escapeXml(link)}" rel="self" type="application/rss+xml" />`,
    "    <language>en-us</language>",
  ].join("\n");

  const body = items.map(renderItem).join("\n");

  const tail = ["  </channel>", "</rss>", ""].join("\n");

  return [head, body, tail].filter(Boolean).join("\n");
}
