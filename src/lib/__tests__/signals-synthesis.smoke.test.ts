// Smoke test for the cross-source synthesis pipeline used by /signals.
//
// During the V3→V4 migration the page was stuck in a debug-bisect harness
// because the synthesis layer was suspected of throwing. Live testing
// confirmed the layer was healthy; this test locks that down so a future
// refactor can't regress without flagging.
//
// Fixture: 8 SignalItems, one per source, all linking to the same canonical
// repo "anthropics/skills" — exercises the consensus group merger, the
// per-source volume bucketer, and the tag-momentum extractor.

import assert from "node:assert/strict";
import { test } from "node:test";

import { buildVolume } from "../signals/volume";
import { buildConsensus } from "../signals/consensus";
import { buildTagMomentum } from "../signals/tag-momentum";
import type { SignalItem, SourceKey } from "../signals/types";

function makeItem(source: SourceKey, postedAtMs: number): SignalItem {
  return {
    source,
    id: `${source}:1`,
    title: "Anthropic ships Claude Skills v2",
    url: `https://example.test/${source}`,
    postedAtMs,
    linkedRepo: "anthropics/skills",
    tags: ["skills", "claude", "agents"],
    engagement: 100,
    signalScore: 50,
    attribution: "fixture",
  };
}

const SOURCES: SourceKey[] = [
  "hn",
  "github",
  "x",
  "reddit",
  "bluesky",
  "devto",
  "claude",
  "openai",
];

test("buildVolume aggregates 8 single-item sources into a 24-bucket grid", () => {
  const now = Date.UTC(2026, 3, 30, 12, 0, 0);
  const items: SignalItem[] = SOURCES.map((s, i) =>
    makeItem(s, now - i * 60_000),
  );

  const v = buildVolume(items, { nowMs: now, lookbackHours: 24 });

  assert.equal(v.totalItems, 8);
  assert.equal(v.buckets.length, 24);
  for (const k of SOURCES) {
    assert.equal(
      v.perSource[k],
      1,
      `expected one ${k} item, got ${v.perSource[k]}`,
    );
  }
  // dominantSource is whichever happens to win the per-source tie-break;
  // assertion only checks it's one of our 8.
  assert.ok(SOURCES.includes(v.dominantSource));
});

test("buildConsensus groups the 8 items into a single 8-source story", () => {
  const now = Date.UTC(2026, 3, 30, 12, 0, 0);
  const items: SignalItem[] = SOURCES.map((s, i) =>
    makeItem(s, now - i * 60_000),
  );

  const stories = buildConsensus(items, {
    nowMs: now,
    minSources: 3,
    limit: 10,
    lookbackHours: 24,
  });

  assert.equal(stories.length, 1, "expected exactly one consensus group");
  const lead = stories[0];
  assert.equal(lead.sources.length, 8);
  assert.equal(lead.linkedRepo, "anthropics/skills");
  assert.equal(lead.items.length, 8);
});

test("buildTagMomentum surfaces shared tags as a heatmap row", () => {
  const now = Date.UTC(2026, 3, 30, 12, 0, 0);
  const items: SignalItem[] = SOURCES.map((s, i) =>
    makeItem(s, now - i * 60_000),
  );

  const m = buildTagMomentum(items, {
    nowMs: now,
    topN: 12,
    lookbackHours: 24,
  });

  assert.ok(m.rows.length >= 1, "expected at least one tag row");
  assert.ok(m.topTag, "expected a topTag");
  // Each row's pattern is exactly 24 normalized intensities.
  for (const r of m.rows) {
    assert.equal(r.pattern.length, 24);
  }
});

test("buildVolume + buildConsensus + buildTagMomentum tolerate an empty input array", () => {
  const now = Date.now();
  const v = buildVolume([], { nowMs: now, lookbackHours: 24 });
  assert.equal(v.totalItems, 0);
  assert.equal(v.buckets.length, 24);

  const stories = buildConsensus([], {
    nowMs: now,
    minSources: 3,
    limit: 8,
    lookbackHours: 24,
  });
  assert.equal(stories.length, 0);

  const m = buildTagMomentum([], {
    nowMs: now,
    topN: 12,
    lookbackHours: 24,
  });
  assert.equal(m.rows.length, 0);
  assert.equal(m.topTag, null);
});
