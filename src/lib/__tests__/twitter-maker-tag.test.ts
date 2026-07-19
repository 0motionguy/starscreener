// Maker-tagging (WS1): owner -> X handle resolution + budget-safe tweet append.
//
// The append runs AFTER the LLM polish pass, so these pure functions are the
// whole trust boundary for "the tweet tags the right account and never busts
// the length budget". The copywriter's own mention-ban (it rejects any @handle
// the model tries to add) is covered separately in copywriter.test.ts.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  appendMakerTag,
  composeModelSpotlight,
  SINGLE_TEXT_BUDGET,
} from "../twitter/outbound/composer";
import {
  AI_LAB_HANDLES,
  PROVIDER_HANDLES,
  resolveProviderHandle,
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

test("resolveProviderHandle maps model providers to verified handles", () => {
  assert.equal(resolveProviderHandle("moonshotai"), "Kimi_Moonshot");
  assert.equal(resolveProviderHandle("moonshot"), "Kimi_Moonshot");
  assert.equal(resolveProviderHandle("Anthropic"), "AnthropicAI"); // case-insensitive
  assert.equal(resolveProviderHandle("deepseek"), "deepseek_ai");
  // Unknown provider / nullish -> no tag (never guesses).
  assert.equal(resolveProviderHandle("some-startup"), null);
  assert.equal(resolveProviderHandle(""), null);
  assert.equal(resolveProviderHandle(null), null);
  // Every mapped handle is itself legal.
  for (const h of Object.values(PROVIDER_HANDLES)) {
    assert.equal(sanitizeHandle(h), h, `provider handle invalid: ${h}`);
  }
});

test("composeModelSpotlight sells the reason to care, budget-safe", () => {
  const post = composeModelSpotlight({
    name: "Kimi K2",
    provider: "Moonshot AI",
    inputPricePerMillion: 0.6,
    outputPricePerMillion: 2.5,
    contextLength: 256_000,
    usageRank: 3,
    wowChange: 0.44,
    isNew: true,
  });
  assert.equal(post.kind, "model_spotlight");
  assert.ok(post.text.startsWith("Kimi K2 (Moonshot AI)"));
  assert.ok(post.text.includes("256K context"));
  assert.ok(post.text.includes("$0.60/M in"));
  assert.ok(post.text.includes("$2.50/M out"));
  assert.ok(post.text.includes("New on OpenRouter"));
  assert.ok(post.text.includes("#3 by usage this week"));
  assert.ok(post.text.includes("+44% WoW"));
  // +24 t.co URL still clears 280.
  assert.ok(post.text.length <= SINGLE_TEXT_BUDGET);
});

test("composeModelSpotlight handles free models and no signals", () => {
  const post = composeModelSpotlight({
    name: "DeepSeek V3",
    provider: "DeepSeek",
    inputPricePerMillion: 0,
    outputPricePerMillion: 0,
    contextLength: 128_000,
  });
  assert.ok(post.text.includes("free in"));
  assert.ok(post.text.includes("free out"));
  assert.ok(post.text.includes("128K context"));
  // No usageRank / wowChange / isNew -> only 3 lines (head, blank, spec).
  assert.equal(post.text.split("\n").length, 3);
});
