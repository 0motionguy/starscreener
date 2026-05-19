import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildCsv,
  buildShareImageUrl,
  buildXIntentUrl,
  decodeStarActivityUrl,
  encodeStarActivityUrl,
} from "../star-activity-url";

test("decode default state from empty params", () => {
  const state = decodeStarActivityUrl(new URLSearchParams());
  assert.deepEqual(state.repos, []);
  assert.equal(state.mode, "date");
  assert.equal(state.scale, "lin");
  assert.equal(state.legend, "tr");
});

test("decode trims, filters invalid slugs, caps at 4 repos", () => {
  const params = new URLSearchParams(
    "repos=vercel/next.js, openai/codex,  bad slug ,one/two,three/four,five/six",
  );
  const state = decodeStarActivityUrl(params);
  assert.deepEqual(state.repos, [
    "vercel/next.js",
    "openai/codex",
    "one/two",
    "three/four",
  ]);
});

test("encode roundtrips through decode", () => {
  const out = encodeStarActivityUrl({
    repos: ["vercel/next.js", "openai/codex"],
    mode: "timeline",
    scale: "log",
    legend: "bl",
  });
  const url = new URL(`http://x${out}`);
  const back = decodeStarActivityUrl(url.searchParams);
  assert.deepEqual(back.repos, ["vercel/next.js", "openai/codex"]);
  assert.equal(back.mode, "timeline");
  assert.equal(back.scale, "log");
  assert.equal(back.legend, "bl");
});

test("encode omits default values to keep URLs clean", () => {
  const out = encodeStarActivityUrl({
    repos: ["vercel/next.js"],
    mode: "date",
    scale: "lin",
    legend: "tr",
  });
  // Just repos= should be present; defaults stripped.
  assert.equal(out, "/compare?repos=vercel%2Fnext.js");
});

test("buildShareImageUrl honors aspect and format", () => {
  const url = buildShareImageUrl(
    {
      repos: ["vercel/next.js"],
      mode: "date",
      scale: "lin",
      legend: "tr",
      aspect: "v",
    },
    { format: "svg", download: true },
  );
  assert.match(url, /^\/api\/og\/star-activity\?/);
  assert.match(url, /repos=vercel%2Fnext\.js/);
  assert.match(url, /aspect=v/);
  assert.match(url, /format=svg/);
  assert.match(url, /download=1/);
});

test("buildXIntentUrl encodes tweet text + URL + via", () => {
  const intent = buildXIntentUrl(
    {
      repos: ["vercel/next.js", "openai/codex"],
      mode: "date",
      scale: "lin",
      legend: "tr",
    },
    "https://trendingrepo.com/compare?repos=vercel/next.js,openai/codex",
  );
  assert.match(intent, /^https:\/\/twitter\.com\/intent\/tweet\?/);
  assert.match(intent, /via=TrendingRepo/);
  assert.match(intent, /url=https/);
  // Tweet body should mention both repos.
  assert.match(intent, /vercel.*next\.js/);
});

test("buildCsv single-series emits date,stars header", () => {
  const csv = buildCsv([
    {
      repoId: "vercel/next.js",
      points: [
        { d: "2026-04-01", s: 100 },
        { d: "2026-04-02", s: 110 },
      ],
    },
  ]);
  assert.equal(csv, "date,stars\n2026-04-01,100\n2026-04-02,110\n");
});

test("buildCsv multi-series emits one column per repo, union of dates", () => {
  const csv = buildCsv([
    {
      repoId: "vercel/next.js",
      points: [
        { d: "2026-04-01", s: 100 },
        { d: "2026-04-02", s: 110 },
      ],
    },
    {
      repoId: "openai/codex",
      points: [
        { d: "2026-04-02", s: 50 },
        { d: "2026-04-03", s: 65 },
      ],
    },
  ]);
  // Header
  assert.match(csv, /^date,vercel\/next\.js,openai\/codex\n/);
  // Row 1: only first repo had data on 04-01
  assert.match(csv, /2026-04-01,100,\n/);
  // Row 2: both repos
  assert.match(csv, /2026-04-02,110,50\n/);
  // Row 3: only second repo
  assert.match(csv, /2026-04-03,,65\n/);
});
