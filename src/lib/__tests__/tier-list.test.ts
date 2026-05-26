// Tier list pure-logic tests: URL encoder, state hash, schema validators,
// short-id generator. These are the layers most likely to silently break
// on a refactor — pure functions with deterministic outputs.

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  DEFAULT_TIERS,
  MAX_ITEMS_PER_TIER,
  MAX_ITEMS_TOTAL,
  TIER_COLORS,
} from "../tier-list/constants";
import {
  tierListDraftSchema,
  tierListPayloadSchema,
} from "../tier-list/schema";
import { generateShortId, isShortId } from "../tier-list/short-id";
import {
  buildTierListShareUrl,
  decodeTierListUrl,
  emptyDraft,
  encodeTierListUrl,
  hasTierListUrlState,
  stateHash,
} from "../tier-list/url";
import { composeTierShareText } from "../tier-list/share-text";
import { decodeStateParam, pickFirst } from "../tier-list/state-url";

// ---------------------------------------------------------------------------
// short-id
// ---------------------------------------------------------------------------

test("generateShortId returns an 8-char Crockford base32 token", () => {
  const id = generateShortId();
  assert.equal(id.length, 8);
  assert.ok(isShortId(id), `expected ${id} to satisfy isShortId`);
});

test("isShortId rejects invalid alphabets and lengths", () => {
  assert.equal(isShortId(""), false);
  // Letters in the Crockford-forbidden set (I/L/O/U):
  assert.equal(isShortId("ABCDEFGI"), false);
  assert.equal(isShortId("ABCDEFGL"), false);
  assert.equal(isShortId("ABCDEFGO"), false);
  assert.equal(isShortId("ABCDEFGU"), false);
  // Lowercase rejected — Crockford is uppercase only here.
  assert.equal(isShortId("abcdefgh"), false);
  // 7 chars — too short.
  assert.equal(isShortId("ABCDEFG"), false);
  // 9 chars — too long.
  assert.equal(isShortId("ABCDEFGHJ"), false);
});

test("isShortId accepts a well-formed 8-char Crockford token", () => {
  // Every char in ABCDEFGH is in the Crockford alphabet (no I/L/O/U).
  assert.equal(isShortId("ABCDEFGH"), true);
  assert.equal(isShortId("01234567"), true);
  assert.equal(isShortId("ZYXWVTSR"), true);
});

test("generateShortId values are unique across many calls", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 500; i++) seen.add(generateShortId());
  // 500 random 8-char Crockford ids: collisions astronomically unlikely.
  assert.equal(seen.size, 500);
});

// ---------------------------------------------------------------------------
// URL encoder / decoder
// ---------------------------------------------------------------------------

test("emptyDraft seeds the canonical 7-tier S→F grid", () => {
  const d = emptyDraft();
  assert.equal(d.tiers.length, DEFAULT_TIERS.length);
  assert.deepEqual(
    d.tiers.map((t) => t.label),
    ["S", "A", "B", "C", "D", "E", "F"],
  );
  for (const tier of d.tiers) {
    assert.deepEqual(tier.items, []);
    assert.ok(
      (TIER_COLORS as readonly string[]).includes(tier.color),
      `tier color ${tier.color} not in palette`,
    );
  }
  assert.deepEqual(d.unrankedItems, []);
});

test("encode → decode is lossless for a typical draft", () => {
  const draft = emptyDraft();
  draft.title = "Agent stacks · April 2026";
  draft.tiers[0].items = ["vercel/next.js", "anthropics/claude-code"];
  draft.tiers[2].items = ["langchain-ai/langchain"];
  draft.unrankedItems = ["openai/codex", "facebook/react"];

  const params = encodeTierListUrl(draft);
  const decoded = decodeTierListUrl(params);

  assert.equal(decoded.title, draft.title);
  assert.equal(decoded.tiers.length, draft.tiers.length);
  for (let i = 0; i < draft.tiers.length; i++) {
    assert.equal(decoded.tiers[i].id, draft.tiers[i].id);
    assert.equal(decoded.tiers[i].label, draft.tiers[i].label);
    assert.equal(decoded.tiers[i].color, draft.tiers[i].color);
    assert.deepEqual(decoded.tiers[i].items, draft.tiers[i].items);
  }
  assert.deepEqual(decoded.unrankedItems, draft.unrankedItems);
});

test("decode of empty/missing tiers params falls back to default grid", () => {
  const params = new URLSearchParams("title=Foo");
  const decoded = decodeTierListUrl(params);
  assert.equal(decoded.title, "Foo");
  assert.equal(decoded.tiers.length, DEFAULT_TIERS.length);
});

test("pool-only URL state hydrates onto the default grid", () => {
  const params = new URLSearchParams("pool=vercel%2Fnext.js,openai%2Fcodex");
  assert.equal(hasTierListUrlState(params), true);
  const decoded = decodeTierListUrl(params);
  assert.equal(decoded.tiers.length, DEFAULT_TIERS.length);
  assert.deepEqual(decoded.unrankedItems, ["vercel/next.js", "openai/codex"]);
});

test("URL-state detection ignores cache-only params", () => {
  assert.equal(hasTierListUrlState(new URLSearchParams("v=abcd1234")), false);
  assert.equal(hasTierListUrlState(new URLSearchParams("title=AI")), true);
  assert.equal(hasTierListUrlState(new URLSearchParams("tiers=")), true);
});

test("buildTierListShareUrl serializes the current draft", () => {
  const draft = emptyDraft();
  draft.title = "Current board";
  draft.unrankedItems = ["vercel/next.js"];
  const url = buildTierListShareUrl("https://trendingrepo.com", draft);
  assert.ok(url.startsWith("https://trendingrepo.com/tierlist?"));
  assert.ok(url.includes("title=Current+board"));
  assert.ok(url.includes("pool=vercel%252Fnext.js"));
});

// ---------------------------------------------------------------------------
// state hash
// ---------------------------------------------------------------------------

test("stateHash is deterministic for identical drafts", () => {
  const a = emptyDraft();
  const b = emptyDraft();
  assert.equal(stateHash(a), stateHash(b));
});

test("stateHash flips when ANY field changes", () => {
  const base = emptyDraft();
  const before = stateHash(base);

  const titleChange = { ...base, title: base.title + "!" };
  assert.notEqual(stateHash(titleChange), before);

  const itemChange = {
    ...base,
    tiers: base.tiers.map((t, i) =>
      i === 0 ? { ...t, items: ["foo/bar"] } : t,
    ),
  };
  assert.notEqual(stateHash(itemChange), before);

  const colorChange = {
    ...base,
    tiers: base.tiers.map((t, i) =>
      i === 0 ? { ...t, color: TIER_COLORS[3] } : t,
    ),
  };
  assert.notEqual(stateHash(colorChange), before);
});

test("stateHash output is exactly 8 chars", () => {
  assert.equal(stateHash(emptyDraft()).length, 8);
});

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

interface DraftTier {
  id: string;
  label: string;
  color: (typeof TIER_COLORS)[number];
  items: string[];
}

interface ValidDraft {
  title: string;
  tiers: DraftTier[];
  unrankedItems: string[];
}

function makeValidDraft(): ValidDraft {
  return {
    title: "Test list",
    tiers: [
      { id: "S", label: "S", color: TIER_COLORS[0], items: ["foo/bar"] },
      { id: "A", label: "A", color: TIER_COLORS[1], items: [] },
    ],
    unrankedItems: ["baz/qux"],
  };
}

test("draft schema accepts a minimal valid draft", () => {
  const result = tierListDraftSchema.safeParse(makeValidDraft());
  assert.equal(result.success, true);
});

test("draft schema rejects a repo appearing in two tiers", () => {
  const draft = makeValidDraft();
  draft.tiers[1].items = ["foo/bar"]; // collide with tier 0
  const result = tierListDraftSchema.safeParse(draft);
  assert.equal(result.success, false);
});

test("draft schema rejects a repo appearing in a tier AND the pool", () => {
  const draft = makeValidDraft();
  draft.unrankedItems = ["foo/bar"]; // already in tier S
  const result = tierListDraftSchema.safeParse(draft);
  assert.equal(result.success, false);
});

test("draft schema rejects an unknown tier color", () => {
  const draft = makeValidDraft();
  // Force a random non-palette hex.
  (draft.tiers[0] as unknown as { color: string }).color = "#123456";
  const result = tierListDraftSchema.safeParse(draft);
  assert.equal(result.success, false);
});

test("draft schema rejects a malformed repoId", () => {
  const draft = makeValidDraft();
  draft.tiers[0].items = ["not a repo id"];
  const result = tierListDraftSchema.safeParse(draft);
  assert.equal(result.success, false);
});

test("draft schema rejects fewer than MIN_TIERS rows", () => {
  const draft = makeValidDraft();
  draft.tiers = [draft.tiers[0]];
  const result = tierListDraftSchema.safeParse(draft);
  assert.equal(result.success, false);
});

test("draft schema rejects more than MAX_ITEMS_PER_TIER in one row", () => {
  const draft = makeValidDraft();
  draft.tiers[0].items = Array.from(
    { length: MAX_ITEMS_PER_TIER + 1 },
    (_v, i) => `owner/repo${i}`,
  );
  const result = tierListDraftSchema.safeParse(draft);
  assert.equal(result.success, false);
});

test("draft schema rejects more than MAX_ITEMS_TOTAL across the whole list", () => {
  const draft = makeValidDraft();
  // MAX_ITEMS_TOTAL = 70. Spread MAX_ITEMS_TOTAL+1 unique repos across
  // many tiers, each respecting MAX_ITEMS_PER_TIER (10).
  const total = MAX_ITEMS_TOTAL + 1;
  const repos = Array.from({ length: total }, (_v, i) => `owner/repo${i}`);
  draft.tiers = [];
  for (let i = 0; i * MAX_ITEMS_PER_TIER < total; i++) {
    const slice = repos.slice(
      i * MAX_ITEMS_PER_TIER,
      (i + 1) * MAX_ITEMS_PER_TIER,
    );
    draft.tiers.push({
      id: `T${i}`,
      label: `T${i}`,
      color: TIER_COLORS[i % TIER_COLORS.length],
      items: slice,
    });
  }
  draft.unrankedItems = [];
  const result = tierListDraftSchema.safeParse(draft);
  assert.equal(result.success, false);
});

test("payload schema rejects a draft missing shortId / timestamps", () => {
  // The payload schema extends the draft schema — a draft alone should fail.
  const result = tierListPayloadSchema.safeParse(makeValidDraft());
  assert.equal(result.success, false);
});

test("payload schema accepts a complete persisted shape", () => {
  const payload = {
    ...makeValidDraft(),
    shortId: "ABCDEFGH",
    createdAt: "2026-04-29T00:00:00.000Z",
    updatedAt: "2026-04-29T00:00:00.000Z",
    viewCount: 0,
    published: false,
    ownerHandle: null,
  };
  const result = tierListPayloadSchema.safeParse(payload);
  assert.equal(result.success, true);
});

// ---------------------------------------------------------------------------
// composeTierShareText — Twitter body composer for the share intent.
// Regression coverage for the 2026-05-25 "tier summary missing from tweet"
// bug. The helper must (a) include non-empty tier lines, (b) skip empty
// tiers, (c) strip the owner/ prefix, (d) stay within maxChars, (e) ellipse
// long tiers with "+N more" instead of overflowing.
// ---------------------------------------------------------------------------

test("composeTierShareText emits one line per non-empty tier with owner/ stripped", () => {
  const out = composeTierShareText(
    {
      title: "AI Coding Agents",
      tiers: [
        {
          id: "S",
          label: "S",
          color: TIER_COLORS[0]!,
          items: ["anthropics/claude-code", "openai/codex"],
        },
        {
          id: "A",
          label: "A",
          color: TIER_COLORS[1]!,
          items: ["cline/cline"],
        },
        // Empty tier — must NOT appear in output.
        { id: "B", label: "B", color: TIER_COLORS[2]!, items: [] },
      ],
    },
    220,
  );
  assert.ok(out.startsWith("AI Coding Agents\n\n"), `prefix: ${out}`);
  assert.match(out, /S — claude-code, codex/);
  assert.match(out, /A — cline/);
  assert.ok(!out.includes("B —"), "empty B tier must be omitted");
  assert.ok(!out.includes("anthropics/"), "owner prefix must be stripped");
});

test("composeTierShareText returns title only when all tiers are empty", () => {
  const out = composeTierShareText(
    {
      title: "Empty board",
      tiers: [
        { id: "S", label: "S", color: TIER_COLORS[0]!, items: [] },
        { id: "A", label: "A", color: TIER_COLORS[1]!, items: [] },
      ],
    },
    220,
  );
  assert.equal(out, "Empty board");
});

test("composeTierShareText ellipses an overflowing tier with `+N more`", () => {
  const longItems = Array.from(
    { length: 12 },
    (_, i) => `org/super-long-repo-name-${i}`,
  );
  const out = composeTierShareText(
    {
      title: "Stress",
      tiers: [
        { id: "S", label: "S", color: TIER_COLORS[0]!, items: longItems },
      ],
    },
    220,
  );
  assert.ok(out.length <= 220, `body ${out.length} > 220 chars: ${out}`);
  assert.match(out, /\+\d+ more$/, `expected trailing "+N more": ${out}`);
});

test("composeTierShareText never exceeds maxChars even with many populated tiers", () => {
  const out = composeTierShareText(
    {
      title: "All tiers full",
      tiers: TIER_COLORS.slice(0, 7).map((color, i) => ({
        id: String.fromCharCode(65 + i),
        label: String.fromCharCode(65 + i),
        color,
        items: Array.from({ length: 5 }, (_, j) => `org/repo-${i}-${j}`),
      })),
    },
    220,
  );
  assert.ok(out.length <= 220, `body ${out.length} > 220 chars`);
});

// ---------------------------------------------------------------------------
// decodeStateParam — base64 → validated payload.
// ---------------------------------------------------------------------------

test("pickFirst returns undefined for empty/missing input", () => {
  assert.equal(pickFirst(undefined), undefined);
  assert.equal(pickFirst(""), undefined);
  assert.equal(pickFirst([]), undefined);
  assert.equal(pickFirst([""]), undefined);
});

test("pickFirst unwraps the first non-empty entry from an array", () => {
  assert.equal(pickFirst("abc"), "abc");
  assert.equal(pickFirst(["abc"]), "abc");
  assert.equal(pickFirst(["abc", "def"]), "abc");
});

test("decodeStateParam returns null for malformed/empty input", () => {
  assert.equal(decodeStateParam(undefined), null);
  assert.equal(decodeStateParam(""), null);
  assert.equal(decodeStateParam("not-base64-!@#"), null);
  // Valid base64 but invalid JSON:
  assert.equal(decodeStateParam(Buffer.from("not json").toString("base64")), null);
  // Valid JSON but doesn't satisfy the schema:
  assert.equal(
    decodeStateParam(Buffer.from(JSON.stringify({ foo: 1 })).toString("base64")),
    null,
  );
});

test("decodeStateParam round-trips a well-formed payload", () => {
  const payload = {
    ...makeValidDraft(),
    shortId: "ABCDEFGH",
    createdAt: "2026-05-25T00:00:00.000Z",
    updatedAt: "2026-05-25T00:00:00.000Z",
    viewCount: 0,
    published: false,
    ownerHandle: null,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64");
  const decoded = decodeStateParam(encoded);
  assert.ok(decoded);
  assert.equal(decoded.title, payload.title);
  assert.equal(decoded.tiers.length, payload.tiers.length);
});
