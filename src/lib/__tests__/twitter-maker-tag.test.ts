// Maker-tagging (WS1): owner -> X handle resolution + budget-safe tweet append.
//
// The append runs AFTER the LLM polish pass, so these pure functions are the
// whole trust boundary for "the tweet tags the right account and never busts
// the length budget". The copywriter's own mention-ban (it rejects any @handle
// the model tries to add) is covered separately in copywriter.test.ts.

import { test } from "node:test";
import assert from "node:assert/strict";

import { appendMakerTag, SINGLE_TEXT_BUDGET } from "../twitter/outbound/composer";
import {
  AI_LAB_HANDLES,
  resolveRepoHandle,
  sanitizeHandle,
} from "../twitter/outbound/handles";

test("sanitizeHandle strips @ and accepts only legal X handles", () => {
  assert.equal(sanitizeHandle("@OpenAI"), "OpenAI");
  assert.equal(sanitizeHandle("OpenAI"), "OpenAI");
  assert.equal(sanitizeHandle("  @deepseek_ai  "), "deepseek_ai");
  assert.equal(sanitizeHandle("Kimi_Moonshot"), "Kimi_Moonshot");
  // Rejections: URL, email, hyphen, too long (>15), empty / nullish.
  assert.equal(sanitizeHandle("https://x.com/foo"), null);
  assert.equal(sanitizeHandle("a@b.com"), null);
  assert.equal(sanitizeHandle("bad-handle"), null);
  assert.equal(sanitizeHandle("a".repeat(16)), null);
  assert.equal(sanitizeHandle(""), null);
  assert.equal(sanitizeHandle(null), null);
  assert.equal(sanitizeHandle(undefined), null);
});

test("resolveRepoHandle: curated AI-lab map wins over GitHub, else self-declared", () => {
  // Curated marquee lab (GitHub twitter_username is blank for these).
  assert.equal(resolveRepoHandle("moonshotai/Kimi-K2"), "Kimi_Moonshot");
  assert.equal(resolveRepoHandle("openai/whisper"), "OpenAI");
  // Owner match is case-insensitive (same repo, different casing).
  assert.equal(resolveRepoHandle("MoonshotAI/Kimi-K2"), "Kimi_Moonshot");
  // Curated override wins even over a real, different declared handle.
  assert.equal(resolveRepoHandle("openai/whisper", "OpenAIDevs"), "OpenAI");
  // Non-curated owner falls back to the self-declared GitHub handle, sanitized
  // (real declarations: ollama -> "ollama", unslothai -> "unslothai").
  assert.equal(resolveRepoHandle("ollama/ollama", "ollama"), "ollama");
  assert.equal(resolveRepoHandle("unslothai/unsloth", "@unslothai"), "unslothai");
  // Nothing declared -> no tag.
  assert.equal(resolveRepoHandle("tinygrad/tinygrad", null), null);
  assert.equal(resolveRepoHandle("tinygrad/tinygrad"), null);
  // Every curated handle is itself a legal X handle (no typo'd entry ships).
  for (const h of Object.values(AI_LAB_HANDLES)) {
    assert.equal(sanitizeHandle(h), h, `curated handle invalid: ${h}`);
  }
});

test("appendMakerTag appends the tag and never exceeds the text budget", () => {
  const short = "vercel/next.js\n+512 stars today | TypeScript\n\nThe React framework.";
  const tagged = appendMakerTag(short, "vercel", SINGLE_TEXT_BUDGET);
  assert.ok(tagged.endsWith("\n\nby @vercel"));
  assert.ok(tagged.includes("@vercel"));
  assert.ok(tagged.length <= SINGLE_TEXT_BUDGET);
  // With the 24-char t.co URL added by the runner it still clears 280.
  assert.ok(tagged.length + 24 <= 270);
});

test("appendMakerTag with no handle is a no-op", () => {
  const text = "owner/name\n+5 stars today";
  assert.equal(appendMakerTag(text, null, SINGLE_TEXT_BUDGET), text);
});

test("appendMakerTag trims the tail to fit when the text is at budget", () => {
  // A maxed-out post: exactly the text budget in ASCII chars.
  const maxed = "x".repeat(SINGLE_TEXT_BUDGET);
  const tagged = appendMakerTag(maxed, "Kimi_Moonshot", SINGLE_TEXT_BUDGET);
  assert.ok(tagged.length <= SINGLE_TEXT_BUDGET, `len ${tagged.length}`);
  assert.ok(tagged.endsWith("by @Kimi_Moonshot"));
  // The tag earned its space over the tail, which was ellipsized.
  assert.ok(tagged.includes("..."));
});

test("appendMakerTag skips when almost nothing would survive the trim", () => {
  const text = "y".repeat(40);
  // maxLen 30: suffix (12) leaves room 18 (<24) -> not worth mangling, skip.
  assert.equal(appendMakerTag(text, "OpenAI", 30), text);
});
