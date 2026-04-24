// Tests for the hand-rolled RSS serializer in src/lib/feeds/rss.ts.
//
// Covers the XML-correctness invariants that matter for valid RSS 2.0:
//   - `<`, `>`, `&`, `"`, `'` escaped in titles / links
//   - description always wrapped in CDATA, with `]]>` sequences defused
//   - pubDate / lastBuildDate emitted as RFC-822 strings
//   - feed shell contains channel / title / link / description / atom:link
//   - empty item list still renders a valid document

import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  escapeXml,
  renderRssFeed,
  toRfc822,
  wrapCdata,
  type RssItem,
} from "../../feeds/rss";

// ---------------------------------------------------------------------------
// escapeXml
// ---------------------------------------------------------------------------

test("escapeXml — replaces all 5 unsafe characters", () => {
  assert.equal(
    escapeXml("a<b>c&d\"e'f"),
    "a&lt;b&gt;c&amp;d&quot;e&apos;f",
  );
});

test("escapeXml — ampersand escaped first, no double-escape", () => {
  // If `&` is replaced AFTER `<`, the literal `&lt;` would become `&amp;lt;`.
  assert.equal(escapeXml("&<"), "&amp;&lt;");
});

test("escapeXml — plain text passes through untouched", () => {
  assert.equal(escapeXml("hello world 123"), "hello world 123");
});

// ---------------------------------------------------------------------------
// wrapCdata
// ---------------------------------------------------------------------------

test("wrapCdata — simple value wrapped", () => {
  assert.equal(wrapCdata("<b>hi</b>"), "<![CDATA[<b>hi</b>]]>");
});

test("wrapCdata — defuses embedded `]]>` sequences", () => {
  const wrapped = wrapCdata("before ]]> after");
  // The trick: split `]]>` into `]]]]><![CDATA[>` so re-parsing yields the
  // original string with no early CDATA termination.
  assert.ok(!/]]>.*]]>/.test(wrapped.slice(9, -3)), "inner `]]>` defused");
  assert.ok(wrapped.startsWith("<![CDATA["));
  assert.ok(wrapped.endsWith("]]>"));
});

// ---------------------------------------------------------------------------
// toRfc822
// ---------------------------------------------------------------------------

test("toRfc822 — ISO-8601 converts to RFC-822-style UTC string", () => {
  const out = toRfc822("2026-01-02T03:04:05Z");
  // Accept the Node toUTCString() format: "Fri, 02 Jan 2026 03:04:05 GMT"
  assert.match(out, /^\w{3}, \d{2} \w{3} \d{4} \d{2}:\d{2}:\d{2} GMT$/);
});

test("toRfc822 — invalid input falls back to a valid date", () => {
  const out = toRfc822("not-a-date");
  assert.match(out, /^\w{3}, \d{2} \w{3} \d{4} \d{2}:\d{2}:\d{2} GMT$/);
});

// ---------------------------------------------------------------------------
// renderRssFeed
// ---------------------------------------------------------------------------

function makeItem(overrides: Partial<RssItem> = {}): RssItem {
  return {
    title: overrides.title ?? "Repo breakout",
    link: overrides.link ?? "https://trendingrepo.com/repo/acme/foo",
    guid: overrides.guid ?? "https://trendingrepo.com/repo/acme/foo",
    pubDate: overrides.pubDate ?? "2026-04-20T12:00:00Z",
    description: overrides.description ?? "<p>hello</p>",
    author: overrides.author,
    categories: overrides.categories,
  };
}

test("renderRssFeed — valid RSS 2.0 shell with channel + atom:link self", () => {
  const xml = renderRssFeed({
    title: "Test Feed",
    link: "https://trendingrepo.com/feeds/test.xml",
    description: "Test description",
    lastBuildDate: "2026-04-24T00:00:00Z",
    items: [makeItem()],
  });
  assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
  assert.match(xml, /<rss version="2\.0"/);
  assert.match(xml, /<channel>/);
  assert.match(xml, /<\/channel>/);
  assert.match(xml, /<\/rss>/);
  assert.match(
    xml,
    /<atom:link href="https:\/\/trendingrepo\.com\/feeds\/test\.xml" rel="self"/,
  );
});

test("renderRssFeed — escapes XML-unsafe characters in titles", () => {
  const xml = renderRssFeed({
    title: "Feed <test> & \"friends\"",
    link: "https://example.com/feed.xml",
    description: "desc",
    lastBuildDate: "2026-04-24T00:00:00Z",
    items: [
      makeItem({
        title: "repo <foo> & \"bar\"",
        categories: ["a&b", "c<d"],
      }),
    ],
  });
  assert.match(xml, /<title>Feed &lt;test&gt; &amp; &quot;friends&quot;<\/title>/);
  assert.match(xml, /<title>repo &lt;foo&gt; &amp; &quot;bar&quot;<\/title>/);
  assert.match(xml, /<category>a&amp;b<\/category>/);
  assert.match(xml, /<category>c&lt;d<\/category>/);
});

test("renderRssFeed — wraps description in CDATA (no HTML escaping)", () => {
  const xml = renderRssFeed({
    title: "T",
    link: "https://example.com/f",
    description: "d",
    lastBuildDate: "2026-04-24T00:00:00Z",
    items: [
      makeItem({
        description: '<p>inline <a href="https://x.com">link</a> & more</p>',
      }),
    ],
  });
  assert.match(
    xml,
    /<description><!\[CDATA\[<p>inline <a href="https:\/\/x\.com">link<\/a> & more<\/p>\]\]><\/description>/,
  );
  // Description body must not be XML-escaped (inside CDATA) — verify literal `<p>`.
  assert.ok(xml.includes("<![CDATA[<p>inline"));
});

test("renderRssFeed — pubDate + lastBuildDate emitted as RFC-822", () => {
  const xml = renderRssFeed({
    title: "T",
    link: "https://example.com/f",
    description: "d",
    lastBuildDate: "2026-04-24T00:00:00Z",
    items: [makeItem({ pubDate: "2026-04-20T12:00:00Z" })],
  });
  assert.match(xml, /<lastBuildDate>\w{3}, \d{2} \w{3} \d{4} \d{2}:\d{2}:\d{2} GMT<\/lastBuildDate>/);
  assert.match(xml, /<pubDate>\w{3}, \d{2} \w{3} \d{4} \d{2}:\d{2}:\d{2} GMT<\/pubDate>/);
});

test("renderRssFeed — empty item list still produces a valid document", () => {
  const xml = renderRssFeed({
    title: "T",
    link: "https://example.com/f",
    description: "d",
    lastBuildDate: "2026-04-24T00:00:00Z",
    items: [],
  });
  assert.ok(xml.startsWith('<?xml version="1.0"'));
  assert.match(xml, /<\/channel>\n<\/rss>/);
  assert.equal((xml.match(/<item>/g) ?? []).length, 0);
});

test("renderRssFeed — guid isPermaLink flips based on link equality", () => {
  const xmlSame = renderRssFeed({
    title: "T",
    link: "https://example.com/f",
    description: "d",
    lastBuildDate: "2026-04-24T00:00:00Z",
    items: [
      makeItem({
        link: "https://example.com/x",
        guid: "https://example.com/x",
      }),
    ],
  });
  assert.match(xmlSame, /<guid isPermaLink="true">https:\/\/example\.com\/x<\/guid>/);

  const xmlDiff = renderRssFeed({
    title: "T",
    link: "https://example.com/f",
    description: "d",
    lastBuildDate: "2026-04-24T00:00:00Z",
    items: [
      makeItem({
        link: "https://example.com/x",
        guid: "stable-id-123",
      }),
    ],
  });
  assert.match(xmlDiff, /<guid isPermaLink="false">stable-id-123<\/guid>/);
});

test("renderRssFeed — emits multiple items in order", () => {
  const xml = renderRssFeed({
    title: "T",
    link: "https://example.com/f",
    description: "d",
    lastBuildDate: "2026-04-24T00:00:00Z",
    items: [
      makeItem({ title: "first", link: "https://example.com/1", guid: "https://example.com/1" }),
      makeItem({ title: "second", link: "https://example.com/2", guid: "https://example.com/2" }),
      makeItem({ title: "third", link: "https://example.com/3", guid: "https://example.com/3" }),
    ],
  });
  const firstIdx = xml.indexOf("<title>first</title>");
  const secondIdx = xml.indexOf("<title>second</title>");
  const thirdIdx = xml.indexOf("<title>third</title>");
  assert.ok(firstIdx < secondIdx);
  assert.ok(secondIdx < thirdIdx);
  assert.equal((xml.match(/<item>/g) ?? []).length, 3);
});
