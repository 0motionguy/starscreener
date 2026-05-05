import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

test("about page metadata exports expected title", async () => {
  (globalThis as { React?: typeof React }).React = React;
  const mod = await import("../page");
  const { metadata } = mod;
  assert.equal(metadata.title, "About TrendingRepo");
});

test("about page emits parseable AboutPage JSON-LD with required fields", async () => {
  (globalThis as { React?: typeof React }).React = React;
  const mod = await import("../page");
  const AboutPage = mod.default;
  const html = renderToStaticMarkup(<AboutPage />);
  const match = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);

  assert.ok(match?.[1], "expected one application/ld+json script tag");

  const parsed = JSON.parse(match[1]);
  assert.equal(parsed["@context"], "https://schema.org");
  assert.equal(parsed["@type"], "AboutPage");
  assert.equal(parsed.name, "About TrendingRepo");
});
