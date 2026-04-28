// Sitemap helper smoke tests — verify the building blocks behind the
// multi-sitemap surface (`/sitemap.xml` index + `/sitemap-pages.xml` +
// `/sitemap-repos.xml` + `/sitemap-news.xml`):
//   - priorityFromRepo stays inside the documented 0.30–0.95 band
//   - isSitemapEligible rejects archived/deleted/bad-slug repos
//   - renderUrlset emits valid XML with the right namespaces per extension
//   - renderSitemapIndex emits a valid <sitemapindex>
//   - escapeXml escapes the five predefined entities
//
// The end-to-end sitemap response is covered by `tests/e2e/sitemap-and-robots.spec.ts`
// against a running dev server. This file pins the pure helpers so a
// regression in priority scaling or XML escaping is caught in CI.

import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  escapeXml,
  isSitemapEligible,
  priorityFromRepo,
  renderSitemapIndex,
  renderUrlset,
} from "../../sitemap-xml";
import type { Repo } from "../../types";

function makeRepo(overrides: Partial<Repo> = {}): Repo {
  return {
    id: "owner/name",
    fullName: "owner/name",
    owner: "owner",
    name: "name",
    description: "test repo",
    stars: 1000,
    forks: 100,
    language: "TypeScript",
    momentumScore: 50,
    lastCommitAt: new Date().toISOString(),
    createdAt: new Date(Date.now() - 365 * 24 * 3600 * 1000).toISOString(),
    ...overrides,
  } as Repo;
}

test("priorityFromRepo — clamped to [0.30, 0.95]", () => {
  const samples: Repo[] = [
    makeRepo({ momentumScore: 0, stars: 0, lastCommitAt: undefined }),
    makeRepo({ momentumScore: 100, stars: 1_000_000, lastCommitAt: new Date().toISOString() }),
    makeRepo({ momentumScore: 50, stars: 5_000 }),
  ];
  for (const r of samples) {
    const p = priorityFromRepo(r);
    assert.ok(p >= 0.3 && p <= 0.95, `priority out of band for ${r.fullName}: ${p}`);
  }
});

test("priorityFromRepo — hot repo > cold repo", () => {
  const hot = makeRepo({
    momentumScore: 95,
    stars: 50_000,
    lastCommitAt: new Date().toISOString(),
  });
  const cold = makeRepo({
    momentumScore: 5,
    stars: 50,
    lastCommitAt: new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString(),
  });
  assert.ok(priorityFromRepo(hot) > priorityFromRepo(cold));
});

test("isSitemapEligible — rejects archived, deleted, bad slugs", () => {
  assert.equal(isSitemapEligible(makeRepo()), true);
  assert.equal(isSitemapEligible(makeRepo({ archived: true })), false);
  assert.equal(isSitemapEligible(makeRepo({ deleted: true })), false);
  assert.equal(isSitemapEligible(makeRepo({ owner: "bad slug!" })), false);
  assert.equal(isSitemapEligible(makeRepo({ name: "" })), false);
});

test("renderUrlset — empty input produces valid <urlset>", () => {
  const xml = renderUrlset([]);
  assert.ok(xml.startsWith(`<?xml version="1.0" encoding="UTF-8"?>`));
  assert.ok(xml.includes(`<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"`));
  assert.ok(xml.endsWith(`</urlset>`));
});

test("renderUrlset — image extension adds xmlns:image namespace", () => {
  const xml = renderUrlset([], ["image"]);
  assert.ok(xml.includes(`xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"`));
});

test("renderUrlset — news extension adds xmlns:news namespace", () => {
  const xml = renderUrlset([], ["news"]);
  assert.ok(xml.includes(`xmlns:news="http://www.google.com/schemas/sitemap-news/0.9"`));
});

test("renderUrlset — a real entry serialises every field", () => {
  const xml = renderUrlset(
    [
      {
        loc: "https://trendingrepo.com/repo/owner/name",
        lastmod: new Date("2026-04-28T00:00:00Z"),
        changefreq: "daily",
        priority: 0.75,
        images: [
          {
            loc: "https://trendingrepo.com/repo/owner/name/opengraph-image",
            title: "owner/name",
            caption: "A test repo",
          },
        ],
      },
    ],
    ["image"],
  );
  assert.ok(xml.includes(`<loc>https://trendingrepo.com/repo/owner/name</loc>`));
  assert.ok(xml.includes(`<lastmod>2026-04-28T00:00:00.000Z</lastmod>`));
  assert.ok(xml.includes(`<changefreq>daily</changefreq>`));
  assert.ok(xml.includes(`<priority>0.75</priority>`));
  assert.ok(xml.includes(`<image:image>`));
  assert.ok(xml.includes(`<image:title>owner/name</image:title>`));
});

test("renderSitemapIndex — references sub-sitemaps", () => {
  const xml = renderSitemapIndex([
    { loc: "https://trendingrepo.com/sitemap-pages.xml", lastmod: new Date() },
    { loc: "https://trendingrepo.com/sitemap-repos.xml", lastmod: new Date() },
  ]);
  assert.ok(xml.includes(`<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`));
  assert.ok(xml.includes(`<loc>https://trendingrepo.com/sitemap-pages.xml</loc>`));
  assert.ok(xml.includes(`<loc>https://trendingrepo.com/sitemap-repos.xml</loc>`));
});

test("escapeXml — escapes the five predefined entities", () => {
  assert.equal(
    escapeXml(`& < > " '`),
    `&amp; &lt; &gt; &quot; &apos;`,
  );
});
