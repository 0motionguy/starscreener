#!/usr/bin/env node
// Scrape OpenAI's news RSS feed.
//
// Output (dual-write):
//   - data/openai-rss.json
//   - Redis key  ss:data:v1:openai-rss

import { writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { fetchFeed } from "./_rss-shared.mjs";
import { writeDataStore, closeDataStore } from "./_data-store-write.mjs";
import { writeSourceMetaFromOutcome } from "./_data-meta.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, "..", "data", "openai-rss.json");
const FEED_URL = "https://openai.com/news/rss.xml";
const STORE_KEY = "openai-rss";
const SOURCE_LABEL = "openai";
const KEEP = 30;

function log(msg) {
  process.stdout.write(`[openai-rss] ${msg}\n`);
}

function classifyCategory(title, summary) {
  const text = `${title} ${summary}`.toLowerCase();
  if (/\bgpt-?\d|o\d-?(?:mini|preview|deep)?\b|\bsora\b/i.test(text))
    return "MODEL";
  if (/\b(api|realtime|assistant|function|fine-tune|tool|sdk)\b/.test(text))
    return "PLATFORM";
  if (/\b(safety|preparedness|policy|alignment|red team|risk|disclosure)\b/.test(text))
    return "SAFETY";
  if (/\b(enterprise|chatgpt team|chatgpt enterprise|business|partnership)\b/.test(text))
    return "BUSINESS";
  return "POST";
}

async function main() {
  log(`fetching ${FEED_URL}`);
  const { items, fetchedAt, error } = await fetchFeed(FEED_URL);
  if (error) {
    log(`fetch error: ${error}`);
  }
  log(`parsed ${items.length} entries`);

  const enriched = items.slice(0, KEEP).map((it) => ({
    ...it,
    source: SOURCE_LABEL,
    category: classifyCategory(it.title, it.summary),
  }));

  const payload = {
    fetchedAt,
    source: SOURCE_LABEL,
    feedUrl: FEED_URL,
    error: error ?? null,
    items: enriched,
  };

  await writeFile(OUT, JSON.stringify(payload, null, 2) + "\n", "utf8");
  log(`wrote ${OUT}`);

  const writeResult = await writeDataStore(STORE_KEY, payload, {
    stampPerRecord: false,
  });
  log(`store write: ${writeResult.source} (${writeResult.writtenAt})`);

  await closeDataStore();
}

const startedAt = Date.now();
main()
  .then(async () => {
    try {
      await writeSourceMetaFromOutcome({
        source: "openai-rss",
        count: 1,
        durationMs: Date.now() - startedAt,
      });
    } catch (metaErr) {
      console.error("[meta] openai-rss.json write failed:", metaErr);
    }
  })
  .catch(async (err) => {
    process.stderr.write(`[openai-rss] FATAL: ${err?.stack ?? err}\n`);
    try {
      await writeSourceMetaFromOutcome({
        source: "openai-rss",
        count: 0,
        durationMs: Date.now() - startedAt,
        error: err,
      });
    } catch (metaErr) {
      console.error("[meta] openai-rss.json error-write failed:", metaErr);
    }
    process.exit(1);
  });
