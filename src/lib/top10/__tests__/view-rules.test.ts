import assert from "node:assert/strict";
import { test } from "node:test";

import type { Top10Category, Top10Metric } from "../types";
import { CATEGORY_META } from "../types";
import {
  coerceSelection,
  isMetricSupported,
  parseTop10Query,
} from "../view-rules";

test("isMetricSupported follows category support matrix", () => {
  assert.equal(isMetricSupported("repos", "cross-signal"), true);
  assert.equal(isMetricSupported("funding", "stars"), true);
  assert.equal(isMetricSupported("funding", "mentions"), false);
  assert.equal(isMetricSupported("news", "velocity"), false);
});

test("coerceSelection falls back unsupported metric to category default", () => {
  const selection = coerceSelection(
    {
      category: "funding",
      window: "7d",
      metric: "mentions",
      aspect: "h",
      theme: "dark",
    },
    CATEGORY_META,
  );
  assert.equal(selection.metric, "stars");
  assert.equal(selection.category, "funding");
  assert.equal(selection.window, "7d");
});

test("parseTop10Query parses valid params and coerces invalid combinations", () => {
  const parsed = parseTop10Query(
    new URLSearchParams({
      cat: "funding",
      w: "30d",
      m: "mentions",
      aspect: "sq",
      theme: "light",
    }),
    CATEGORY_META,
  );
  assert.deepEqual(parsed, {
    category: "funding",
    window: "30d",
    metric: "stars",
    aspect: "sq",
    theme: "light",
  });
});

test("parseTop10Query falls back unknown params to repo defaults", () => {
  const parsed = parseTop10Query(
    new URLSearchParams({
      cat: "unknown",
      w: "bogus",
      m: "bogus",
      aspect: "bad",
      theme: "bad",
    }),
    CATEGORY_META,
  );
  const defaults = CATEGORY_META.repos;
  assert.equal(parsed.category, "repos");
  assert.equal(parsed.window, defaults.defaultWindow);
  assert.equal(parsed.metric, defaults.defaultMetric);
  assert.equal(parsed.aspect, "h");
  assert.equal(parsed.theme, "dark");
});

test("coerceSelection keeps all supported metrics unchanged", () => {
  const categoryCases: Array<{ category: Top10Category; metric: Top10Metric }> = [
    { category: "repos", metric: "stars" },
    { category: "agents", metric: "mentions" },
    { category: "movers", metric: "velocity" },
    { category: "news", metric: "mentions" },
  ];

  for (const c of categoryCases) {
    const out = coerceSelection(
      {
        category: c.category,
        window: CATEGORY_META[c.category].defaultWindow,
        metric: c.metric,
        aspect: "h",
        theme: "dark",
      },
      CATEGORY_META,
    );
    assert.equal(out.metric, c.metric);
  }
});
