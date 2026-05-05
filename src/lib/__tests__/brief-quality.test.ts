import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

interface ParsedBrief {
  file: string;
  frontmatter: string;
  body: string;
  sources: string[];
}

function splitFrontmatter(raw: string): { frontmatter: string; body: string } {
  const normalized = raw.replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---\n")) return { frontmatter: "", body: normalized.trim() };
  const close = normalized.indexOf("\n---\n", 4);
  if (close === -1) return { frontmatter: "", body: normalized.trim() };
  return {
    frontmatter: normalized.slice(4, close),
    body: normalized.slice(close + 5).trim(),
  };
}

function parseSources(frontmatter: string): string[] {
  const lines = frontmatter.split("\n");
  const out: string[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (!lines[i]?.trim().startsWith("sources:")) continue;
    for (let j = i + 1; j < lines.length; j += 1) {
      const line = lines[j]?.trim() ?? "";
      if (line.startsWith("- ")) {
        out.push(line.slice(2).trim());
        continue;
      }
      break;
    }
    break;
  }
  return out;
}

function sentenceStats(body: string): { sentenceCount: number; avgWords: number } {
  const sentences = body
    .replace(/\n+/g, " ")
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  if (sentences.length === 0) return { sentenceCount: 0, avgWords: 0 };
  const totalWords = sentences.reduce((sum, sentence) => {
    return sum + sentence.split(/\s+/).filter(Boolean).length;
  }, 0);
  return {
    sentenceCount: sentences.length,
    avgWords: totalWords / sentences.length,
  };
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function loadSlopBlacklist(): string[] {
  const soulPath = resolve(
    "C:\\Users\\mirko\\.paperclip\\instances\\default\\companies\\4a60095d-470f-4bc8-a99b-278230e7e6bd\\agents\\17ef895d-d08d-4f0c-bcca-3c4265dc78f3\\instructions\\SOUL.md",
  );
  const soul = readFileSync(soulPath, "utf8");
  const lines = soul.replace(/\r\n/g, "\n").split("\n");
  const start = lines.findIndex((line) => line.toLowerCase().includes("## slop blacklist"));
  assert.ok(start >= 0, "SOUL.md missing 'Slop blacklist' section");
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (lines[i]?.startsWith("## ")) {
      end = i;
      break;
    }
  }
  const section = lines.slice(start + 1, end).join("\n").trim();

  return section
    .replace(/\s+Â·\s+/g, "·")
    .split(/[·\n]/)
    .map((item) => item.replace(/^- /, "").trim())
    .filter(Boolean)
    .map((item) => item.toLowerCase());
}

function loadBriefs(): ParsedBrief[] {
  const dir = resolve(process.cwd(), "data", "briefs");
  return readdirSync(dir)
    .filter((name) => name.endsWith(".md") && name !== ".gitkeep")
    .map((name) => {
      const raw = readFileSync(resolve(dir, name), "utf8");
      const { frontmatter, body } = splitFrontmatter(raw);
      return {
        file: name,
        frontmatter,
        body,
        sources: parseSources(frontmatter),
      };
    });
}

test("brief quality bars", () => {
  const slop = loadSlopBlacklist();
  const briefs = loadBriefs();
  assert.ok(briefs.length > 0, "no briefs found under data/briefs");

  for (const brief of briefs) {
    const lowerBody = brief.body.toLowerCase();
    const violations = slop.filter((phrase) => lowerBody.includes(phrase));
    assert.equal(violations.length, 0, `${brief.file}: slop blacklist hit(s): ${violations.join(", ")}`);

    const wc = wordCount(brief.body);
    assert.ok(wc >= 130 && wc <= 180, `${brief.file}: body word count ${wc} outside 130-180`);

    assert.ok(brief.sources.length >= 3, `${brief.file}: expected >=3 sources, got ${brief.sources.length}`);
    assert.match(brief.body, /\d/, `${brief.file}: body must include at least one numeric token`);

    const { avgWords, sentenceCount } = sentenceStats(brief.body);
    assert.ok(sentenceCount > 0, `${brief.file}: body has no detectable sentences`);
    assert.ok(avgWords < 20, `${brief.file}: avg sentence length ${avgWords.toFixed(2)} must be < 20`);
  }
});
