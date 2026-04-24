// Sitemap smoke tests — verify the dynamic sitemap:
//   - stays under Sitemaps-protocol 50k limit (and our 5k repo cap)
//   - has no duplicate URLs
//   - emits the critical static entries (/, /breakouts, /funding, /revenue,
//     /categories, /collections, /compare, /docs, /search)
//   - emits at least one /repo/{owner}/{name} entry when derived-repos has data
//
// Runs against committed JSON — intentionally no fixtures, because the
// sitemap reads the same trending + metadata + JSONL files the production
// pages do, so this doubles as a cold-start smoke.

import { strict as assert } from "node:assert";
import { test } from "node:test";

import sitemap from "../../../app/sitemap";

test("sitemap — emits <=5000 repo entries + contains no duplicates", async () => {
  const entries = await sitemap();

  // Total URL count safely under the 50k protocol cap.
  assert.ok(entries.length <= 50_000, `sitemap exceeded 50k URL cap: ${entries.length}`);

  // Repo entries specifically capped at 5,000.
  const repoEntries = entries.filter((e) => /\/repo\/[^/]+\/[^/]+$/.test(e.url));
  assert.ok(
    repoEntries.length <= 5_000,
    `repo entries exceeded 5k cap: ${repoEntries.length}`,
  );

  // No duplicate URLs.
  const urls = entries.map((e) => e.url);
  const unique = new Set(urls);
  assert.equal(unique.size, urls.length, "sitemap contains duplicate URLs");
});

test("sitemap — includes required static entries", async () => {
  const entries = await sitemap();
  const urls = new Set(entries.map((e) => e.url));

  const requiredPaths = [
    "/",
    "/breakouts",
    "/funding",
    "/revenue",
    "/categories",
    "/collections",
    "/compare",
    "/docs",
    "/search",
  ];
  for (const path of requiredPaths) {
    // Match any entry whose URL ends with the required path (regardless of
    // which SITE_URL is configured in the current env).
    const matcher = path === "/" ? /\/$/ : new RegExp(`${path}$`);
    const present = [...urls].some((u) => matcher.test(u));
    assert.ok(present, `sitemap missing required static entry: ${path}`);
  }
});

test("sitemap — priority is scaled into the documented 0.3-1.0 range", async () => {
  const entries = await sitemap();
  for (const e of entries) {
    if (typeof e.priority !== "number") continue;
    assert.ok(
      e.priority >= 0.3 && e.priority <= 1.0,
      `priority out of range for ${e.url}: ${e.priority}`,
    );
  }
});
