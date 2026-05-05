// AGN-919 / QUE-16 — verify the sitemap index emits per-child lastmod
// derived from the max(lastmod) of each child's URL list.
//
// Strategy:
//   1. Pure tests for `maxLastmod` and `entryLastmodMs` (no IO).
//   2. Integration-ish test for the news resolver: write fixture JSON
//      into a temp cwd and assert the resolver returns the newest
//      timestamp across HN + ProductHunt entries.
//   3. End-to-end test on the index renderer: wire mocked child-lastmod
//      results through `renderSitemapIndex` and assert each <sitemap>
//      block carries the correct child max.

import { strict as assert } from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import {
  entryLastmodMs,
  getNewsLastmod,
  maxLastmod,
} from "../sitemap-lastmod";
import { renderSitemapIndex } from "../sitemap-xml";

test("entryLastmodMs — handles Date, ISO string, epoch ms, missing", () => {
  assert.equal(entryLastmodMs({ lastmod: undefined }), null);
  assert.equal(entryLastmodMs({ lastmod: null as unknown as undefined }), null);
  assert.equal(entryLastmodMs({ lastmod: "not-a-date" }), null);
  const t = Date.UTC(2026, 3, 1);
  assert.equal(entryLastmodMs({ lastmod: new Date(t) }), t);
  assert.equal(entryLastmodMs({ lastmod: "2026-04-01T00:00:00.000Z" }), t);
  assert.equal(entryLastmodMs({ lastmod: t }), t);
});

test("maxLastmod — empty list returns undefined", () => {
  assert.equal(maxLastmod([]), undefined);
});

test("maxLastmod — picks the newest lastmod across entries", () => {
  const oldest = new Date("2026-01-01T00:00:00Z");
  const middle = new Date("2026-02-15T12:00:00Z");
  const newest = new Date("2026-04-30T23:00:00Z");
  const got = maxLastmod([
    { lastmod: oldest },
    { lastmod: newest },
    { lastmod: middle },
    { lastmod: undefined },
  ]);
  assert.equal(got?.toISOString(), newest.toISOString());
});

test("maxLastmod — ignores invalid timestamps", () => {
  const valid = new Date("2026-03-01T00:00:00Z");
  const got = maxLastmod([
    { lastmod: "garbage" },
    { lastmod: valid },
    { lastmod: 0 },
  ]);
  assert.equal(got?.toISOString(), valid.toISOString());
});

test("getNewsLastmod — returns max(createdUtc, createdAt) across HN + PH fixtures", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "agn919-news-"));
  const dataDir = path.join(tmp, "data");
  fs.mkdirSync(dataDir, { recursive: true });

  const hnNewerSec = Math.floor(Date.UTC(2026, 4, 4, 12, 0, 0) / 1000);
  fs.writeFileSync(
    path.join(dataDir, "hackernews-trending.json"),
    JSON.stringify({
      stories: [
        { id: 1, title: "old", createdUtc: hnNewerSec - 86400 },
        { id: 2, title: "new", createdUtc: hnNewerSec },
      ],
    }),
  );

  // ProductHunt has an entry NEWER than the HN max — resolver must pick it.
  const phNewest = "2026-05-04T18:30:00.000Z";
  fs.writeFileSync(
    path.join(dataDir, "producthunt-launches.json"),
    JSON.stringify({
      launches: [
        { id: "a", name: "X", createdAt: "2026-05-01T00:00:00.000Z" },
        { id: "b", name: "Y", createdAt: phNewest },
      ],
    }),
  );

  const prevCwd = process.cwd();
  try {
    process.chdir(tmp);
    const got = getNewsLastmod();
    assert.equal(got?.toISOString(), phNewest);
  } finally {
    process.chdir(prevCwd);
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("getNewsLastmod — returns undefined when no fixtures exist", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "agn919-empty-"));
  const prevCwd = process.cwd();
  try {
    process.chdir(tmp);
    assert.equal(getNewsLastmod(), undefined);
  } finally {
    process.chdir(prevCwd);
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("renderSitemapIndex — when fed per-child max(lastmod), emits matching <lastmod>", () => {
  // Simulate three children with different freshness points. Each child's
  // <lastmod> in the index MUST equal its own max — not `now`, not the
  // global max, not the same value across all children.
  const childA = new Date("2026-04-10T00:00:00Z");
  const childB = new Date("2026-04-30T12:00:00Z");
  const childC = new Date("2026-03-15T08:00:00Z");

  const xml = renderSitemapIndex([
    { loc: "https://trendingrepo.com/sitemap-a.xml", lastmod: childA },
    { loc: "https://trendingrepo.com/sitemap-b.xml", lastmod: childB },
    { loc: "https://trendingrepo.com/sitemap-c.xml", lastmod: childC },
  ]);

  // Every child's lastmod is present in the document.
  assert.ok(xml.includes(`<lastmod>${childA.toISOString()}</lastmod>`));
  assert.ok(xml.includes(`<lastmod>${childB.toISOString()}</lastmod>`));
  assert.ok(xml.includes(`<lastmod>${childC.toISOString()}</lastmod>`));

  // And — critically — they appear in their own <sitemap> block, paired
  // to the right <loc>. We split on </sitemap> and verify pairing.
  const blocks = xml.split("</sitemap>").slice(0, -1);
  function lastmodFor(loc: string): string | null {
    const blk = blocks.find((b) => b.includes(`<loc>${loc}</loc>`));
    if (!blk) return null;
    const m = blk.match(/<lastmod>([^<]+)<\/lastmod>/);
    return m ? m[1] : null;
  }
  assert.equal(
    lastmodFor("https://trendingrepo.com/sitemap-a.xml"),
    childA.toISOString(),
  );
  assert.equal(
    lastmodFor("https://trendingrepo.com/sitemap-b.xml"),
    childB.toISOString(),
  );
  assert.equal(
    lastmodFor("https://trendingrepo.com/sitemap-c.xml"),
    childC.toISOString(),
  );
});

test("renderSitemapIndex — entries without lastmod (resolver failed) omit the tag", () => {
  const xml = renderSitemapIndex([
    { loc: "https://trendingrepo.com/sitemap-broken.xml" },
    {
      loc: "https://trendingrepo.com/sitemap-ok.xml",
      lastmod: new Date("2026-04-30T00:00:00Z"),
    },
  ]);

  const blocks = xml.split("</sitemap>").slice(0, -1);
  const broken = blocks.find((b) => b.includes("sitemap-broken.xml"));
  const ok = blocks.find((b) => b.includes("sitemap-ok.xml"));
  assert.ok(broken && !broken.includes("<lastmod>"), "broken child must omit lastmod");
  assert.ok(ok && ok.includes("<lastmod>2026-04-30T00:00:00.000Z</lastmod>"));
});

test("AGN-919 acceptance — mutating one child's data only advances that child's lastmod", () => {
  // Acceptance criterion from the ticket:
  //   "Test: mutate one child's data → only that child's lastmod (and the
  //    index aggregate) advances."
  //
  // We simulate two passes through the index renderer with stable
  // resolver outputs for unchanged children and a bumped value for the
  // mutated child. Then we assert the unchanged children's <lastmod>
  // strings are byte-identical across passes while the mutated one
  // moves forward.

  const stableA = new Date("2026-04-10T00:00:00Z");
  const stableC = new Date("2026-03-15T00:00:00Z");

  const before = renderSitemapIndex([
    { loc: "https://trendingrepo.com/sitemap-a.xml", lastmod: stableA },
    { loc: "https://trendingrepo.com/sitemap-b.xml", lastmod: new Date("2026-04-01T00:00:00Z") },
    { loc: "https://trendingrepo.com/sitemap-c.xml", lastmod: stableC },
  ]);

  const after = renderSitemapIndex([
    { loc: "https://trendingrepo.com/sitemap-a.xml", lastmod: stableA },
    { loc: "https://trendingrepo.com/sitemap-b.xml", lastmod: new Date("2026-05-04T18:00:00Z") },
    { loc: "https://trendingrepo.com/sitemap-c.xml", lastmod: stableC },
  ]);

  function blockFor(xml: string, loc: string): string {
    const blocks = xml.split("</sitemap>").slice(0, -1);
    const blk = blocks.find((b) => b.includes(`<loc>${loc}</loc>`));
    if (!blk) throw new Error(`block missing for ${loc}`);
    return blk;
  }

  // Unchanged children: byte-identical block.
  assert.equal(
    blockFor(before, "https://trendingrepo.com/sitemap-a.xml"),
    blockFor(after, "https://trendingrepo.com/sitemap-a.xml"),
  );
  assert.equal(
    blockFor(before, "https://trendingrepo.com/sitemap-c.xml"),
    blockFor(after, "https://trendingrepo.com/sitemap-c.xml"),
  );
  // Mutated child: lastmod advanced.
  assert.notEqual(
    blockFor(before, "https://trendingrepo.com/sitemap-b.xml"),
    blockFor(after, "https://trendingrepo.com/sitemap-b.xml"),
  );
  assert.ok(blockFor(after, "https://trendingrepo.com/sitemap-b.xml").includes(
    "<lastmod>2026-05-04T18:00:00.000Z</lastmod>",
  ));
});
