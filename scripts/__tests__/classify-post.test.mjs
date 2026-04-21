import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CONTENT_TAGS,
  VALUE_TAGS,
  classifyPost,
  ensurePostClassification,
} from "../classify-post.mjs";

function tagged(result, tag) {
  return result.content_tags.includes(tag);
}

const LONG_TUTORIAL = [
  "Step 1: install the deps\n",
  "a".repeat(600),
  "\nStep 2: wire the config\n",
  "b".repeat(600),
  "\nStep 3: ship it\n",
  "c".repeat(600),
].join("");

test("has-github-repo: tags github URLs in the body", () => {
  const result = classifyPost({
    title: "starter repo",
    selftext: "Built on https://github.com/anthropics/claude-code today",
    url: "",
  });
  assert.ok(tagged(result, "has-github-repo"));
});

test("has-github-repo: ignores posts without github URLs", () => {
  const result = classifyPost({
    title: "starter repo",
    selftext: "No code links here",
    url: "https://example.com/post",
  });
  assert.ok(!tagged(result, "has-github-repo"));
});

test("has-github-repo: tags github URLs in the link URL", () => {
  const result = classifyPost({
    title: "repo drop",
    selftext: "",
    url: "https://github.com/openai/gym",
  });
  assert.ok(tagged(result, "has-github-repo"));
});

test("has-md-file: tags .md URLs", () => {
  const result = classifyPost({
    title: "readme link",
    selftext: "",
    url: "https://github.com/acme/tool/blob/main/README.md",
  });
  assert.ok(tagged(result, "has-md-file"));
});

test("has-md-file: ignores plain text with one later header", () => {
  const result = classifyPost({
    title: "notes",
    selftext: "intro first\n## one header later\nnot enough structure",
    url: "",
  });
  assert.ok(!tagged(result, "has-md-file"));
});

test("has-md-file: tags selftext that starts with a markdown header", () => {
  const result = classifyPost({
    title: "guide",
    selftext: "# Overview\n\n## Setup\n\n## Run",
    url: "",
  });
  assert.ok(tagged(result, "has-md-file"));
});

test("has-code-block: tags fenced code blocks", () => {
  const result = classifyPost({
    title: "setup",
    selftext: "```bash\nnpm install\n```",
    url: "",
  });
  assert.ok(tagged(result, "has-code-block"));
});

test("has-code-block: ignores plain prose", () => {
  const result = classifyPost({
    title: "setup",
    selftext: "plain text without code markers",
    url: "",
  });
  assert.ok(!tagged(result, "has-code-block"));
});

test("has-code-block: tags 5 indented code lines", () => {
  const result = classifyPost({
    title: "setup",
    selftext: [
      "    const a = 1",
      "    const b = 2",
      "    const c = 3",
      "    const d = 4",
      "    console.log(a + b + c + d)",
    ].join("\n"),
    url: "",
  });
  assert.ok(tagged(result, "has-code-block"));
});

test("has-prompt: tags long system prompts", () => {
  const result = classifyPost({
    title: "Claude prompt",
    selftext: `System:\n"You are a senior engineer."\n${"x".repeat(650)}`,
    url: "",
  });
  assert.ok(tagged(result, "has-prompt"));
});

test("has-prompt: ignores short prompt mentions", () => {
  const result = classifyPost({
    title: "best prompt",
    selftext: "tiny body",
    url: "",
  });
  assert.ok(!tagged(result, "has-prompt"));
});

test("has-prompt: tags title prompt posts with long enough bodies", () => {
  const result = classifyPost({
    title: "my coding prompt",
    selftext: "a".repeat(350),
    url: "",
  });
  assert.ok(tagged(result, "has-prompt"));
});

test("has-mcp: tags model context protocol mentions", () => {
  const result = classifyPost({
    title: "model context protocol walk-through",
    selftext: "",
    url: "",
  });
  assert.ok(tagged(result, "has-mcp"));
});

test("has-mcp: ignores unrelated AI chatter", () => {
  const result = classifyPost({
    title: "model routing notes",
    selftext: "no mcp mention here",
    url: "",
  });
  assert.ok(!tagged(result, "has-mcp"));
});

test("has-mcp: tags claude_desktop_config mentions", () => {
  const result = classifyPost({
    title: "desktop config question",
    selftext: "I changed claude_desktop_config and now my tool fails",
    url: "",
  });
  assert.ok(tagged(result, "has-mcp"));
});

test("has-cli: tags shell install commands", () => {
  const result = classifyPost({
    title: "new package",
    selftext: "```bash\n$ npm install foo\n```",
    url: "",
  });
  assert.ok(tagged(result, "has-cli"));
});

test("has-cli: ignores non-shell prose", () => {
  const result = classifyPost({
    title: "new package",
    selftext: "open the UI and click run",
    url: "",
  });
  assert.ok(!tagged(result, "has-cli"));
});

test("has-cli: tags uppercase CLI titles when the body has code", () => {
  const result = classifyPost({
    title: "New CLI for git cleanup",
    selftext: "```txt\n./cleanup --help\n```",
    url: "",
  });
  assert.ok(tagged(result, "has-cli"));
});

test("has-skill: tags agent skill references", () => {
  const result = classifyPost({
    title: "agent skill starter",
    selftext: "drop skill.md into /skills/",
    url: "",
  });
  assert.ok(tagged(result, "has-skill"));
});

test("has-skill: ignores generic skill chatter", () => {
  const result = classifyPost({
    title: "skill issue",
    selftext: "casual joke",
    url: "",
  });
  assert.ok(!tagged(result, "has-skill"));
});

test("has-skill: tags uppercase SKILL.md references", () => {
  const result = classifyPost({
    title: "layout update",
    selftext: "The repo root now includes SKILL.md and examples",
    url: "",
  });
  assert.ok(tagged(result, "has-skill"));
});

test("has-agent: tags multi-agent references", () => {
  const result = classifyPost({
    title: "multi-agent router",
    selftext: "",
    url: "",
  });
  assert.ok(tagged(result, "has-agent"));
});

test("has-agent: ignores vague use of the word agent", () => {
  const result = classifyPost({
    title: "agent of chaos",
    selftext: "",
    url: "",
  });
  assert.ok(!tagged(result, "has-agent"));
});

test("has-agent: tags subagent references", () => {
  const result = classifyPost({
    title: "delegation notes",
    selftext: "subagent orchestration is finally stable",
    url: "",
  });
  assert.ok(tagged(result, "has-agent"));
});

test("has-tutorial: tags long step-based tutorials", () => {
  const result = classifyPost({
    title: "MCP tutorial",
    selftext: LONG_TUTORIAL,
    url: "",
  });
  assert.ok(tagged(result, "has-tutorial"));
});

test("has-tutorial: ignores short posts", () => {
  const result = classifyPost({
    title: "quick tip",
    selftext: "Step 1: do the thing",
    url: "",
  });
  assert.ok(!tagged(result, "has-tutorial"));
});

test("has-tutorial: tags long numbered guides", () => {
  const result = classifyPost({
    title: "deploy guide",
    selftext: `${"a".repeat(1600)}\n1. install\n2. configure\n3. ship`,
    url: "",
  });
  assert.ok(tagged(result, "has-tutorial"));
});

test("is-question: tags titles that end with a question mark", () => {
  const result = classifyPost({
    title: "What model are you using?",
    selftext: "",
    url: "",
  });
  assert.ok(tagged(result, "is-question"));
});

test("is-question: ignores release headlines", () => {
  const result = classifyPost({
    title: "Announcing Claude 4.7",
    selftext: "",
    url: "",
  });
  assert.ok(!tagged(result, "is-question"));
});

test("is-question: tags titles that start with question openers", () => {
  const result = classifyPost({
    title: "How I wired MCP into my workflow",
    selftext: "",
    url: "",
  });
  assert.ok(tagged(result, "is-question"));
});

test("is-meme: tags meme flair", () => {
  const result = classifyPost({
    title: "workflow post",
    selftext: "serious body",
    url: "https://example.com/post",
    linkFlairText: "Funny Meme",
  });
  assert.ok(tagged(result, "is-meme"));
});

test("is-meme: ignores serious technical posts", () => {
  const result = classifyPost({
    title: "release notes",
    selftext: "serious technical details",
    url: "https://github.com/acme/tool",
  });
  assert.ok(!tagged(result, "is-meme"));
});

test("is-meme: tags image posts with empty bodies and meme titles", () => {
  const result = classifyPost({
    title: "we're so cooked",
    selftext: "",
    url: "https://i.redd.it/abc.png",
  });
  assert.ok(tagged(result, "is-meme"));
});

test("is-news: tags allowed news domains", () => {
  const result = classifyPost({
    title: "funding round",
    selftext: "",
    url: "https://www.techcrunch.com/2026/04/20/startup",
  });
  assert.ok(tagged(result, "is-news"));
});

test("is-news: ignores non-news domains", () => {
  const result = classifyPost({
    title: "funding round",
    selftext: "",
    url: "https://myblog.dev/post",
  });
  assert.ok(!tagged(result, "is-news"));
});

test("is-news: tags subdomains of approved outlets", () => {
  const result = classifyPost({
    title: "funding round",
    selftext: "",
    url: "https://eu.theverge.com/ai/breaking",
  });
  assert.ok(tagged(result, "is-news"));
});

test("is-announcement: tags release headlines with long bodies", () => {
  const result = classifyPost({
    title: "released v1.2 today",
    selftext: "a".repeat(250),
    url: "",
  });
  assert.ok(tagged(result, "is-announcement"));
});

test("is-announcement: ignores short release blurbs", () => {
  const result = classifyPost({
    title: "released v1.2 today",
    selftext: "short body",
    url: "",
  });
  assert.ok(!tagged(result, "is-announcement"));
});

test("is-announcement: tags introducing posts with long bodies", () => {
  const result = classifyPost({
    title: "Introducing a new coding assistant",
    selftext: "a".repeat(250),
    url: "",
  });
  assert.ok(tagged(result, "is-announcement"));
});

test("value_score: counts value tags and ignores question-only posts", () => {
  const result = classifyPost({
    title: "What MCP server should I use?",
    selftext: "model context protocol notes",
    url: "",
  });
  assert.ok(tagged(result, "is-question"));
  assert.ok(tagged(result, "has-mcp"));
  assert.equal(result.value_score, 1);
});

test("value_score: subtracts one for memes", () => {
  const result = classifyPost({
    title: "when prod explodes",
    selftext: "",
    url: "https://i.redd.it/abc.gif",
  });
  assert.ok(tagged(result, "is-meme"));
  assert.equal(result.value_score, -1);
});

test("value_score: stacks multiple signal tags", () => {
  const result = classifyPost({
    title: "prompt repo release",
    selftext:
      `System:\n"You are an assistant."\n` +
      "```bash\n$ npm install foo\n```\n" +
      LONG_TUTORIAL,
    url: "https://github.com/acme/prompt-pack",
  });
  assert.ok(tagged(result, "has-github-repo"));
  assert.ok(tagged(result, "has-code-block"));
  assert.ok(tagged(result, "has-cli"));
  assert.ok(tagged(result, "has-prompt"));
  assert.ok(tagged(result, "has-tutorial"));
  assert.ok(result.value_score >= 5);
});

test("classifier: emits deterministic tag order", () => {
  const left = classifyPost({
    title: "released v1.2 https://github.com/acme/tool",
    selftext: "```bash\n$ npm install foo\n```" + "a".repeat(250),
    url: "https://www.theverge.com/ai/post",
  });
  const right = classifyPost({
    title: "released v1.2 https://github.com/acme/tool",
    selftext: "```bash\n$ npm install foo\n```" + "a".repeat(250),
    url: "https://www.theverge.com/ai/post",
  });
  assert.deepEqual(left.content_tags, right.content_tags);
});

test("classifier: tolerates nullish inputs", () => {
  const result = classifyPost({
    title: undefined,
    selftext: null,
    url: undefined,
    linkFlairText: null,
  });
  assert.deepEqual(result.content_tags, []);
  assert.equal(result.value_score, 0);
});

test("classifier: only emits declared tags", () => {
  const allowed = new Set(CONTENT_TAGS);
  const result = classifyPost({
    title: "released v1.2 https://github.com/acme/tool",
    selftext: "```bash\n$ npm install foo\n```" + "a".repeat(250),
    url: "https://www.theverge.com/ai/post",
  });
  for (const tag of result.content_tags) {
    assert.ok(allowed.has(tag), `unexpected tag ${tag}`);
  }
});

test("classifier: value tags stay within the declared tag list", () => {
  for (const tag of VALUE_TAGS) {
    assert.ok(CONTENT_TAGS.includes(tag), `missing content tag ${tag}`);
  }
});

test("ensurePostClassification: backfills missing fields on stored posts", () => {
  const result = ensurePostClassification({
    title: "released v1.2 https://github.com/acme/tool",
    selftext: "```bash\n$ npm install foo\n```" + "a".repeat(250),
    url: "https://www.theverge.com/ai/post",
  });
  assert.ok(Array.isArray(result.content_tags));
  assert.equal(typeof result.value_score, "number");
  assert.ok(result.content_tags.includes("has-github-repo"));
});

test("ensurePostClassification: preserves existing tags and scores", () => {
  const result = ensurePostClassification({
    title: "released v1.2",
    selftext: "a".repeat(250),
    url: "",
    content_tags: ["is-announcement"],
    value_score: 1,
  });
  assert.deepEqual(result.content_tags, ["is-announcement"]);
  assert.equal(result.value_score, 1);
});
