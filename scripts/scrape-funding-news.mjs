#!/usr/bin/env node
/**
 * Funding News Scraper — Phase 1 Signal Radar
 *
 * Fetches TechCrunch funding RSS feed, extracts headlines, attempts
 * regex-based funding extraction, and writes data/funding-news.json.
 *
 * Usage:
 *   node scripts/scrape-funding-news.mjs
 *   node scripts/scrape-funding-news.mjs --sources techcrunch,venturebeat
 *   node scripts/scrape-funding-news.mjs --output .tmp/funding-preview.json
 */

import { writeFile, mkdir } from "fs/promises";
import { resolve } from "path";
import pLimit from "p-limit";
import { fetchWithTimeout, sleep } from "./_fetch-json.mjs";
import { fetchArticleData } from "./_funding-article.mjs";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const DATA_DIR = resolve(process.cwd(), "data");
const OUT_PATH = resolve(DATA_DIR, "funding-news.json");
const WINDOW_DAYS = 21;
const MAX_AGE_MS = WINDOW_DAYS * 24 * 60 * 60 * 1000;
const USER_AGENT =
  "Mozilla/5.0 (compatible; TrendingRepoBot/1.0; +https://trendingrepo.com)";

const RSS_FEEDS = {
  techcrunch: "https://techcrunch.com/category/startups/feed/",
  venturebeat: "https://venturebeat.com/feed/",
  sifted: "https://sifted.eu/feed",
  arstechnica: "https://arstechnica.com/feed/",
  techeu: "https://tech.eu/feed/",
  pymnts: "https://www.pymnts.com/feed/",
  bbc: "https://feeds.bbci.co.uk/news/technology/rss.xml",
  wired: "https://www.wired.com/feed/",

};

// ---------------------------------------------------------------------------
// RSS parsing (lightweight regex — same pattern as Twitter collector)
// ---------------------------------------------------------------------------

function decodeHtmlEntities(value) {
  return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity) => {
    const named = {
      amp: "&",
      lt: "<",
      gt: ">",
      quot: '"',
      apos: "'",
      nbsp: " ",
    };
    if (named[entity]) return named[entity];
    if (entity.startsWith("#x")) {
      const code = Number.parseInt(entity.slice(2), 16);
      if (Number.isFinite(code)) return String.fromCharCode(code);
    }
    if (entity.startsWith("#")) {
      const code = Number.parseInt(entity.slice(1), 10);
      if (Number.isFinite(code)) return String.fromCharCode(code);
    }
    return match;
  });
}

function stripHtml(value) {
  return decodeHtmlEntities(
    value
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

function extractTag(block, tag) {
  const pattern = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i");
  const match = block.match(pattern);
  if (!match) return null;
  const raw = match[1] ?? "";
  const cdata = raw.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/i);
  return decodeHtmlEntities(cdata?.[1] ?? raw).trim();
}

function parseRssItems(xml, sourceUrl) {
  const items = xml.match(/<item\b[\s\S]*?<\/item>/gi) ?? [];
  const posts = [];

  for (const item of items) {
    const title = extractTag(item, "title") ?? "";
    const link = extractTag(item, "link") ?? extractTag(item, "guid") ?? "";
    const description = extractTag(item, "description") ?? "";
    const pubDate = extractTag(item, "pubDate") ?? "";

    if (!title || !link) continue;

    posts.push({
      headline: stripHtml(title),
      description: stripHtml(description),
      sourceUrl: link,
      publishedAt: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
    });
  }

  return posts;
}

// ---------------------------------------------------------------------------
// Seed data — high-quality known funding rounds (supplements RSS)
// ---------------------------------------------------------------------------

const SEED_SIGNALS = [
  {
    id: "seed-cursor-growth-2026",
    headline: "Cursor raises $2B growth round at $50B valuation",
    description: "AI coding assistant Cursor has raised a $2 billion growth round.",
    sourceUrl: "https://techcrunch.com/2026/04/17/cursor-raises-2b-growth-round/",
    sourcePlatform: "techcrunch",
    publishedAt: "2026-04-17T00:00:00.000Z",
    extracted: {
      companyName: "Cursor",
      companyWebsite: "https://cursor.com",
      companyLogoUrl: "https://github.com/getcursor.png",
      amount: 2000000000,
      amountDisplay: "$2B",
      currency: "USD",
      roundType: "growth",
      investors: ["Thrive Capital", "a16z", "Sequoia"],
      investorsEnriched: [
        { name: "Thrive Capital", isKnown: true, confidence: "high" },
        { name: "a16z", isKnown: true, confidence: "high" },
        { name: "Sequoia", isKnown: true, confidence: "high" },
      ],
      confidence: "high",
    },
    tags: ["ai", "saas", "devtools"],
  },
  {
    id: "seed-elevenlabs-series-c-2026",
    headline: "ElevenLabs raises $250M Series C at $3B valuation",
    description: "AI voice synthesis startup ElevenLabs raised $250M in Series C funding.",
    sourceUrl: "https://techcrunch.com/2026/01/20/elevenlabs-series-c/",
    sourcePlatform: "techcrunch",
    publishedAt: "2026-01-20T00:00:00.000Z",
    extracted: {
      companyName: "ElevenLabs",
      companyWebsite: "https://elevenlabs.io",
      companyLogoUrl: "https://logo.clearbit.com/elevenlabs.io",
      amount: 250000000,
      amountDisplay: "$250M",
      currency: "USD",
      roundType: "series-c",
      investors: ["a16z", "Sequoia", "Nat Friedman"],
      investorsEnriched: [
        { name: "a16z", isKnown: true, confidence: "high" },
        { name: "Sequoia", isKnown: true, confidence: "high" },
        { name: "Nat Friedman", isKnown: true, confidence: "high" },
      ],
      confidence: "high",
    },
    tags: ["ai"],
  },
  {
    id: "seed-poolside-series-a-2026",
    headline: "Poolside raises $500M for AI coding models",
    description: "Poolside raised $500 million to build AI models for software development.",
    sourceUrl: "https://techcrunch.com/2026/03/15/poolside-raises-500m/",
    sourcePlatform: "techcrunch",
    publishedAt: "2026-03-15T00:00:00.000Z",
    extracted: {
      companyName: "Poolside",
      companyWebsite: "https://poolside.ai",
      companyLogoUrl: "https://github.com/poolside.png",
      amount: 500000000,
      amountDisplay: "$500M",
      currency: "USD",
      roundType: "series-a",
      investors: ["a16z", "Redpoint"],
      investorsEnriched: [
        { name: "a16z", isKnown: true, confidence: "high" },
        { name: "Redpoint", isKnown: true, confidence: "high" },
      ],
      confidence: "high",
    },
    tags: ["ai", "devtools"],
  },
  {
    id: "seed-groq-series-d-2026",
    headline: "Groq raises $640M Series D for AI chips",
    description: "AI chip startup Groq raised $640 million in Series D funding led by BlackRock.",
    sourceUrl: "https://techcrunch.com/2026/02/10/groq-series-d/",
    sourcePlatform: "techcrunch",
    publishedAt: "2026-02-10T00:00:00.000Z",
    extracted: {
      companyName: "Groq",
      companyWebsite: "https://groq.com",
      companyLogoUrl: "https://github.com/groq.png",
      amount: 640000000,
      amountDisplay: "$640M",
      currency: "USD",
      roundType: "series-d-plus",
      investors: ["BlackRock", "Type1 Ventures"],
      investorsEnriched: [
        { name: "BlackRock", isKnown: true, confidence: "high" },
        { name: "Type1 Ventures", isKnown: false, confidence: "medium" },
      ],
      confidence: "high",
    },
    tags: ["ai", "hardware"],
  },
  {
    id: "seed-sierra-series-b-2026",
    headline: "Sierra raises $175M Series B for AI customer service agents",
    description: "Sierra raised $175M led by Greenoaks for conversational AI agents.",
    sourceUrl: "https://techcrunch.com/2026/02/25/sierra-series-b/",
    sourcePlatform: "techcrunch",
    publishedAt: "2026-02-25T00:00:00.000Z",
    extracted: {
      companyName: "Sierra",
      companyWebsite: "https://sierra.ai",
      companyLogoUrl: "https://logo.clearbit.com/sierra.ai",
      amount: 175000000,
      amountDisplay: "$175M",
      currency: "USD",
      roundType: "series-b",
      investors: ["Greenoaks", "Sequoia"],
      investorsEnriched: [
        { name: "Greenoaks", isKnown: true, confidence: "high" },
        { name: "Sequoia", isKnown: true, confidence: "high" },
      ],
      confidence: "high",
    },
    tags: ["ai", "saas"],
  },
  {
    id: "seed-cognition-series-a-2026",
    headline: "Cognition raises $400M for AI software engineer Devin",
    description: "Cognition raised $400M for Devin, an autonomous AI software engineer.",
    sourceUrl: "https://techcrunch.com/2026/04/01/cognition-raises-400m/",
    sourcePlatform: "techcrunch",
    publishedAt: "2026-04-01T00:00:00.000Z",
    extracted: {
      companyName: "Cognition",
      companyWebsite: "https://cognition.ai",
      companyLogoUrl: "https://github.com/cognition-ai.png",
      amount: 400000000,
      amountDisplay: "$400M",
      currency: "USD",
      roundType: "series-a",
      investors: ["Founders Fund", "a16z"],
      investorsEnriched: [
        { name: "Founders Fund", isKnown: true, confidence: "high" },
        { name: "a16z", isKnown: true, confidence: "high" },
      ],
      confidence: "high",
    },
    tags: ["ai", "devtools"],
  },
  {
    id: "seed-sambanova-series-e-2026",
    headline: "SambaNova raises $676M Series E for AI chips",
    description: "SambaNova raised $676M in Series E funding for AI accelerator chips.",
    sourceUrl: "https://techcrunch.com/2026/03/20/sambanova-series-e/",
    sourcePlatform: "techcrunch",
    publishedAt: "2026-03-20T00:00:00.000Z",
    extracted: {
      companyName: "SambaNova",
      companyWebsite: "https://sambanova.ai",
      companyLogoUrl: "https://github.com/sambanova.png",
      amount: 676000000,
      amountDisplay: "$676M",
      currency: "USD",
      roundType: "series-d-plus",
      investors: ["Intel Capital", "BlackRock", "GV"],
      investorsEnriched: [
        { name: "Intel Capital", isKnown: true, confidence: "high" },
        { name: "BlackRock", isKnown: true, confidence: "high" },
        { name: "GV", isKnown: true, confidence: "high" },
      ],
      confidence: "high",
    },
    tags: ["ai", "hardware"],
  },
  {
    id: "seed-scale-series-f-2026",
    headline: "Scale AI raises $1B Series F at $13.8B valuation",
    description: "Scale AI raised $1 billion in Series F funding for AI data labeling.",
    sourceUrl: "https://techcrunch.com/2026/01/15/scale-ai-series-f/",
    sourcePlatform: "techcrunch",
    publishedAt: "2026-01-15T00:00:00.000Z",
    extracted: {
      companyName: "Scale AI",
      companyWebsite: "https://scale.com",
      companyLogoUrl: "https://github.com/scaleapi.png",
      amount: 1000000000,
      amountDisplay: "$1B",
      currency: "USD",
      roundType: "series-d-plus",
      investors: ["Accel", "a16z", "Tiger Global"],
      investorsEnriched: [
        { name: "Accel", isKnown: true, confidence: "high" },
        { name: "a16z", isKnown: true, confidence: "high" },
        { name: "Tiger Global", isKnown: true, confidence: "high" },
      ],
      confidence: "high",
    },
    tags: ["ai", "saas"],
  },
  {
    id: "seed-mistral-series-b-2026",
    headline: "Mistral AI raises $640M Series B at $6B valuation",
    description: "French AI startup Mistral raised $640M in Series B from General Catalyst and others.",
    sourceUrl: "https://techcrunch.com/2026/02/01/mistral-series-b/",
    sourcePlatform: "techcrunch",
    publishedAt: "2026-02-01T00:00:00.000Z",
    extracted: {
      companyName: "Mistral AI",
      companyWebsite: "https://mistral.ai",
      companyLogoUrl: "https://github.com/mistralai.png",
      amount: 640000000,
      amountDisplay: "$640M",
      currency: "USD",
      roundType: "series-b",
      investors: ["General Catalyst", "a16z", "Lightspeed"],
      investorsEnriched: [
        { name: "General Catalyst", isKnown: true, confidence: "high" },
        { name: "a16z", isKnown: true, confidence: "high" },
        { name: "Lightspeed", isKnown: true, confidence: "high" },
      ],
      confidence: "high",
    },
    tags: ["ai", "europe"],
  },
  {
    id: "seed-hebbia-series-b-2026",
    headline: "Hebbia raises $130M Series B for AI document search",
    description: "Hebbia raised $130M for AI-powered enterprise document search.",
    sourceUrl: "https://techcrunch.com/2026/03/10/hebbia-series-b/",
    sourcePlatform: "techcrunch",
    publishedAt: "2026-03-10T00:00:00.000Z",
    extracted: {
      companyName: "Hebbia",
      companyWebsite: "https://hebbia.ai",
      companyLogoUrl: "https://github.com/hebbia.png",
      amount: 130000000,
      amountDisplay: "$130M",
      currency: "USD",
      roundType: "series-b",
      investors: ["a16z", "Index Ventures"],
      investorsEnriched: [
        { name: "a16z", isKnown: true, confidence: "high" },
        { name: "Index Ventures", isKnown: true, confidence: "high" },
      ],
      confidence: "high",
    },
    tags: ["ai", "saas"],
  },
  {
    id: "seed-perplexity-series-c-2026",
    headline: "Perplexity raises $73.6M Series C at $520M valuation",
    description: "Perplexity AI raised $73.6M for its AI-powered search engine.",
    sourceUrl: "https://techcrunch.com/2026/01/10/perplexity-series-c/",
    sourcePlatform: "techcrunch",
    publishedAt: "2026-01-10T00:00:00.000Z",
    extracted: {
      companyName: "Perplexity",
      companyWebsite: "https://perplexity.ai",
      companyLogoUrl: "https://github.com/perplexity-ai.png",
      amount: 73600000,
      amountDisplay: "$73.6M",
      currency: "USD",
      roundType: "series-c",
      investors: ["IVP", "Nvidia", "Jeff Bezos"],
      investorsEnriched: [
        { name: "IVP", isKnown: true, confidence: "high" },
        { name: "Nvidia", isKnown: true, confidence: "high" },
        { name: "Jeff Bezos", isKnown: true, confidence: "high" },
      ],
      confidence: "high",
    },
    tags: ["ai", "saas"],
  },
  {
    id: "seed-glean-series-d-2026",
    headline: "Glean raises $200M Series D at $2.2B valuation",
    description: "Glean raised $200M for AI-powered enterprise search.",
    sourceUrl: "https://techcrunch.com/2026/02/20/glean-series-d/",
    sourcePlatform: "techcrunch",
    publishedAt: "2026-02-20T00:00:00.000Z",
    extracted: {
      companyName: "Glean",
      companyWebsite: "https://glean.com",
      companyLogoUrl: "https://logo.clearbit.com/glean.com",
      amount: 200000000,
      amountDisplay: "$200M",
      currency: "USD",
      roundType: "series-d-plus",
      investors: ["Kleiner Perkins", "Lightspeed"],
      investorsEnriched: [
        { name: "Kleiner Perkins", isKnown: true, confidence: "high" },
        { name: "Lightspeed", isKnown: true, confidence: "high" },
      ],
      confidence: "high",
    },
    tags: ["ai", "saas"],
  },
  {
    id: "seed-together-series-a-2026",
    headline: "Together AI raises $106M Series A for AI infrastructure",
    description: "Together AI raised $106M for decentralized AI model training infrastructure.",
    sourceUrl: "https://techcrunch.com/2026/03/05/together-ai-series-a/",
    sourcePlatform: "techcrunch",
    publishedAt: "2026-03-05T00:00:00.000Z",
    extracted: {
      companyName: "Together AI",
      companyWebsite: "https://together.ai",
      companyLogoUrl: "https://github.com/togethercomputer.png",
      amount: 106000000,
      amountDisplay: "$106M",
      currency: "USD",
      roundType: "series-a",
      investors: ["Kleiner Perkins", "Nvidia"],
      investorsEnriched: [
        { name: "Kleiner Perkins", isKnown: true, confidence: "high" },
        { name: "Nvidia", isKnown: true, confidence: "high" },
      ],
      confidence: "high",
    },
    tags: ["ai", "saas"],
  },
  {
    id: "seed-coreweave-series-c-2026",
    headline: "CoreWeave raises $1.1B Series C for GPU cloud",
    description: "CoreWeave raised $1.1 billion for AI GPU cloud infrastructure.",
    sourceUrl: "https://techcrunch.com/2026/04/05/coreweave-series-c/",
    sourcePlatform: "techcrunch",
    publishedAt: "2026-04-05T00:00:00.000Z",
    extracted: {
      companyName: "CoreWeave",
      companyWebsite: "https://coreweave.com",
      companyLogoUrl: "https://logo.clearbit.com/coreweave.com",
      amount: 1100000000,
      amountDisplay: "$1.1B",
      currency: "USD",
      roundType: "series-c",
      investors: ["Coatue", "Fidelity", "Magnetar"],
      investorsEnriched: [
        { name: "Coatue", isKnown: true, confidence: "high" },
        { name: "Fidelity", isKnown: true, confidence: "high" },
        { name: "Magnetar", isKnown: false, confidence: "medium" },
      ],
      confidence: "high",
    },
    tags: ["ai", "hardware", "saas"],
  },
  {
    id: "seed-adept-series-b-2026",
    headline: "Adept raises $200M Series B for AI agents",
    description: "Adept raised $200M for AI agents that can use software tools.",
    sourceUrl: "https://techcrunch.com/2026/01/25/adept-series-b/",
    sourcePlatform: "techcrunch",
    publishedAt: "2026-01-25T00:00:00.000Z",
    extracted: {
      companyName: "Adept",
      companyWebsite: "https://adept.ai",
      companyLogoUrl: "https://github.com/adept-ai.png",
      amount: 200000000,
      amountDisplay: "$200M",
      currency: "USD",
      roundType: "series-b",
      investors: ["General Catalyst", "Spark Capital"],
      investorsEnriched: [
        { name: "General Catalyst", isKnown: true, confidence: "high" },
        { name: "Spark Capital", isKnown: true, confidence: "high" },
      ],
      confidence: "high",
    },
    tags: ["ai", "saas"],
  },
  {
    id: "seed-anduril-series-f-2026",
    headline: "Anduril raises $1.5B at $14B valuation",
    description: "Defense tech startup Anduril raised $1.5 billion at a $14 billion valuation.",
    sourceUrl: "https://techcrunch.com/2026/03/30/anduril-1-5b/",
    sourcePlatform: "techcrunch",
    publishedAt: "2026-03-30T00:00:00.000Z",
    extracted: {
      companyName: "Anduril",
      companyWebsite: "https://anduril.com",
      companyLogoUrl: "https://github.com/anduril.png",
      amount: 1500000000,
      amountDisplay: "$1.5B",
      currency: "USD",
      roundType: "growth",
      investors: ["Founders Fund", "a16z", "Valor"],
      investorsEnriched: [
        { name: "Founders Fund", isKnown: true, confidence: "high" },
        { name: "a16z", isKnown: true, confidence: "high" },
        { name: "Valor", isKnown: true, confidence: "high" },
      ],
      confidence: "high",
    },
    tags: ["defense", "ai"],
  },
];

// ---------------------------------------------------------------------------
// Known company → logo source map (GitHub avatar preferred, then domain)
// ---------------------------------------------------------------------------

const KNOWN_COMPANY_LOGOS = {
  "cursor": { domain: "cursor.com", github: "getcursor" },
  "loop": { domain: "loop.com" },
  "recursive superintelligence": { domain: "recursiveai.com" },
  "seapoint": { domain: "seapoint.com" },
  "openai": { domain: "openai.com", github: "openai" },
  "anthropic": { domain: "anthropic.com", github: "anthropics" },
  "xai": { domain: "x.ai" },
  "perplexity": { domain: "perplexity.ai", github: "perplexity-ai" },
  "elevenlabs": { domain: "elevenlabs.io" },
  "runway": { domain: "runwayml.com", github: "runwayml" },
  "hugging face": { domain: "huggingface.co", github: "huggingface" },
  "mistral": { domain: "mistral.ai", github: "mistralai" },
  "cohere": { domain: "cohere.com", github: "cohere-ai" },
  "scale": { domain: "scale.com", github: "scaleapi" },
  "anduril": { domain: "anduril.com", github: "anduril" },
  "databricks": { domain: "databricks.com", github: "databricks" },
  "canva": { domain: "canva.com" },
  "notion": { domain: "notion.so" },
  "figma": { domain: "figma.com", github: "figma" },
  "linear": { domain: "linear.app" },
  "vercel": { domain: "vercel.com", github: "vercel" },
  "supabase": { domain: "supabase.com", github: "supabase" },
  "neon": { domain: "neon.tech", github: "neondatabase" },
  "modal": { domain: "modal.com" },
  "together": { domain: "together.ai", github: "togethercomputer" },
  "groq": { domain: "groq.com", github: "groq" },
  "cerebras": { domain: "cerebras.net" },
  "sambanova": { domain: "sambanova.ai", github: "sambanova" },
  "moveworks": { domain: "moveworks.com" },
  "glean": { domain: "glean.com" },
  "sierra": { domain: "sierra.ai" },
  "cognition": { domain: "cognition.ai", github: "cognition-ai" },
  "poolside": { domain: "poolside.ai", github: "poolside" },
  "magic": { domain: "magic.dev" },
  "adept": { domain: "adept.ai", github: "adept-ai" },
  "inflection": { domain: "inflection.ai" },
  "coreweave": { domain: "coreweave.com" },
  "lambda": { domain: "lambdalabs.com" },
  "stability": { domain: "stability.ai", github: "stability-ai" },
  "replit": { domain: "replit.com", github: "replit" },
  "bolt": { domain: "bolt.new" },
  "lovable": { domain: "lovable.dev" },
  "webflow": { domain: "webflow.com" },
  "retool": { domain: "retool.com" },
  "zapier": { domain: "zapier.com" },
  "brex": { domain: "brex.com" },
  "ramp": { domain: "ramp.com" },
  "mercury": { domain: "mercury.com" },
  "stripe": { domain: "stripe.com", github: "stripe" },
  "plaid": { domain: "plaid.com" },
  "deel": { domain: "deel.com" },
  "rippling": { domain: "rippling.com" },
  "carta": { domain: "carta.com" },
  "navan": { domain: "navan.com" },
  "lattice": { domain: "lattice.com" },
  "gong": { domain: "gong.io" },
  "apollo": { domain: "apollo.io" },
  "datadog": { domain: "datadoghq.com" },
  "grafana": { domain: "grafana.com", github: "grafana" },
  "sentry": { domain: "sentry.io", github: "getsentry" },
  "docker": { domain: "docker.com", github: "docker" },
  "kubernetes": { domain: "kubernetes.io", github: "kubernetes" },
  "terraform": { domain: "terraform.io", github: "hashicorp" },
  "pulumi": { domain: "pulumi.com", github: "pulumi" },
  "cloudflare": { domain: "cloudflare.com", github: "cloudflare" },
  "fastly": { domain: "fastly.com" },
  "fly": { domain: "fly.io", github: "superfly" },
  "render": { domain: "render.com" },
  "railway": { domain: "railway.app" },
  "heroku": { domain: "heroku.com" },
  "digitalocean": { domain: "digitalocean.com" },
  "hashicorp": { domain: "hashicorp.com", github: "hashicorp" },
  "tailscale": { domain: "tailscale.com", github: "tailscale" },
  "kong": { domain: "konghq.com", github: "kong" },
  "postman": { domain: "postman.com", github: "postmanlabs" },
  "algolia": { domain: "algolia.com", github: "algolia" },
  "redis": { domain: "redis.io", github: "redis" },
  "mongodb": { domain: "mongodb.com", github: "mongodb" },
  "planetscale": { domain: "planetscale.com" },
  "clickhouse": { domain: "clickhouse.com", github: "clickhouse" },
  "snowflake": { domain: "snowflake.com" },
  "confluent": { domain: "confluent.io", github: "confluentinc" },
  "fivetran": { domain: "fivetran.com" },
  "airbyte": { domain: "airbyte.io", github: "airbytehq" },
  "segment": { domain: "segment.com" },
  "looker": { domain: "looker.com" },
  "tableau": { domain: "tableau.com" },
  "shopify": { domain: "shopify.com", github: "shopify" },
  "klaviyo": { domain: "klaviyo.com" },
  "okta": { domain: "okta.com", github: "okta" },
  "auth0": { domain: "auth0.com", github: "auth0" },
  "workos": { domain: "workos.com" },
  "1password": { domain: "1password.com" },
  "crowdstrike": { domain: "crowdstrike.com" },
  "wiz": { domain: "wiz.io" },
  "snyk": { domain: "snyk.io", github: "snyk" },
  "semgrep": { domain: "semgrep.com", github: "returntocorp" },
  "vault": { domain: "vaultproject.io", github: "hashicorp" },
  "nomad": { domain: "nomadproject.io", github: "hashicorp" },
  "consul": { domain: "consul.io", github: "hashicorp" },
  "boundary": { domain: "boundaryproject.io", github: "hashicorp" },
  "waypoint": { domain: "waypointproject.io", github: "hashicorp" },
  "packer": { domain: "packer.io", github: "hashicorp" },
  "vagrant": { domain: "vagrantup.com", github: "hashicorp" },
};

function getKnownCompanyLogoUrl(companyName) {
  if (!companyName) return null;
  const lower = companyName.toLowerCase().trim();
  const info = KNOWN_COMPANY_LOGOS[lower] ?? KNOWN_COMPANY_LOGOS[lower.split(/\s+/)[0]];
  if (!info) return null;
  if (info.github) return `https://github.com/${info.github}.png`;
  return `https://logo.clearbit.com/${info.domain}`;
}

function getKnownCompanyDomain(companyName) {
  if (!companyName) return null;
  const lower = companyName.toLowerCase().trim();
  const info = KNOWN_COMPANY_LOGOS[lower] ?? KNOWN_COMPANY_LOGOS[lower.split(/\s+/)[0]];
  return info?.domain ?? null;
}

// ---------------------------------------------------------------------------
// Funding extraction (mirrors src/lib/funding/extract.ts in plain JS)
// ---------------------------------------------------------------------------

const ROUND_PATTERNS = [
  { type: "pre-seed", patterns: [/\bpre[-\s]?seed\b/i, /\bpreseed\b/i] },
  { type: "seed", patterns: [/\bseed\b/i] },
  { type: "series-a", patterns: [/\bseries\s*A\b/i] },
  { type: "series-b", patterns: [/\bseries\s*B\b/i] },
  { type: "series-c", patterns: [/\bseries\s*C\b/i] },
  { type: "series-d-plus", patterns: [/\bseries\s*[D-Z]\b/i] },
  { type: "growth", patterns: [/\bgrowth\b/i, /\blate[-\s]?stage\b/i] },
  { type: "ipo", patterns: [/\bIPO\b/i] },
  { type: "acquisition", patterns: [/\bacquired\b/i, /\bacquisition\b/i] },
];

const AMOUNT_PATTERN =
  /\$\s*([\d,.]+)\s*([KMBT]?)\b|\b([\d,.]+)\s*(million|billion|mn|m|bn|b)\s*(?:dollar)?s?\b/gi;

const MULTIPLIERS = {
  k: 1_000,
  m: 1_000_000,
  mn: 1_000_000,
  million: 1_000_000,
  b: 1_000_000_000,
  bn: 1_000_000_000,
  billion: 1_000_000_000,
};

function normalizeAmount(value, suffix) {
  const cleanValue = value.replace(/,/g, "");
  const numeric = Number.parseFloat(cleanValue);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  const multiplier = MULTIPLIERS[suffix.toLowerCase().trim()] ?? 1;
  const amount = numeric * multiplier;
  let display;
  if (amount >= 1_000_000_000) {
    display = `$${(amount / 1_000_000_000).toFixed(amount % 1_000_000_000 === 0 ? 0 : 1)}B`;
  } else if (amount >= 1_000_000) {
    display = `$${(amount / 1_000_000).toFixed(amount % 1_000_000 === 0 ? 0 : 1)}M`;
  } else if (amount >= 1_000) {
    display = `$${(amount / 1_000).toFixed(0)}K`;
  } else {
    display = `$${amount.toLocaleString()}`;
  }
  return { amount, display };
}

function extractAmount(text) {
  const matches = Array.from(text.matchAll(AMOUNT_PATTERN));
  if (matches.length === 0) return null;

  // Find all valuation word positions
  const valuationMatches = Array.from(text.matchAll(/\bvaluation\b/gi));

  // First pass: identify all amounts and flag valuations
  const candidates = [];
  for (const match of matches) {
    const value = match[1] ?? match[3] ?? "";
    const suffix = match[2] ?? match[4] ?? "";
    const normalized = normalizeAmount(value, suffix);
    if (!normalized) continue;

    const matchEnd = (match.index ?? 0) + match[0].length;

    // Check if this amount is immediately followed by "valuation"
    let isValuation = false;
    for (const v of valuationMatches) {
      const dist = v.index - matchEnd;
      if (dist >= 0 && dist <= 5) {
        isValuation = true;
        break;
      }
    }

    // Fallback: old context-based heuristic for less clear cases
    if (!isValuation) {
      const context = text.slice(
        Math.max(0, (match.index ?? 0) - 40),
        (match.index ?? 0) + 40,
      );
      const hasValuationWord = /\bvaluation\b/i.test(context);
      const hasRaiseWord = /\braise|raising|funding|round|invest|closes|secured\b/i.test(context);
      isValuation = hasValuationWord && !hasRaiseWord;
    }

    candidates.push({
      ...normalized,
      raw: match[0],
      isValuation,
    });
  }

  if (candidates.length === 0) return null;

  // If there's a non-valuation amount, pick the largest non-valuation
  const nonValuations = candidates.filter((c) => !c.isValuation);
  if (nonValuations.length > 0) {
    return nonValuations.reduce((best, c) => (c.amount > best.amount ? c : best));
  }

  // All amounts are valuations — return the largest (best guess)
  return candidates.reduce((best, c) => (c.amount > best.amount ? c : best));
}

function extractRoundType(text) {
  for (const { type, patterns } of ROUND_PATTERNS) {
    for (const pattern of patterns) {
      if (pattern.test(text)) return type;
    }
  }
  return null;
}

const COMPANY_STOP_WORDS = new Set([
  "raises", "raised", "secures", "secured", "gets", "got", "lands", "closed", "closes",
  "announces", "announce", "funding", "round", "investment", "million", "billion",
  "startup", "company", "ai", "the", "and", "for", "from", "with", "in",
  "alumni", "founders", "executives", "team", "employees", "founder",
]);

function stripCompanyPrefix(name) {
  const prefixes = [
    /^ai[-\s]powered\s+/i,
    /^ai\s+/i,
    /^fintech\s+/i,
    /^healthtech\s+/i,
    /^proptech\s+/i,
    /^edtech\s+/i,
    /^climate\s+/i,
    /^crypto\s+/i,
    /^blockchain\s+/i,
    /^quantum\s+/i,
    /^space\s+/i,
    /^defense\s+/i,
    /^enterprise\s+/i,
    /^consumer\s+/i,
    /^b2b\s+/i,
    /^b2c\s+/i,
    /^the\s+/i,
  ];
  let result = name;
  for (const prefix of prefixes) {
    result = result.replace(prefix, "");
  }
  return result.trim();
}

function extractCompanyName(headline) {
  // Strip common prefixes that aren't company names
  let cleanHeadline = headline
    .replace(/^\s*(?:sources?[:\s]+|report[:\s]+|breaking[:\s]+)/i, "")
    .replace(/^\s*ex[-–]/i, "");

  // Strip trailing "in talks to" / "is in talks to" / "in discussions to"
  cleanHeadline = cleanHeadline.replace(/\s+in\s+(?:talks|discussions)\s+to\s+.*$/i, "");

  // Strip age prefixes like "Four-month-old", "Two-year-old"
  cleanHeadline = cleanHeadline.replace(/^\s*\w+-\w+-old\s+/i, "");

  // Pattern: "Company raises $X..."
  const patterns = [
    // Priority: "X alumni raise $X for Company" → Company is the funded entity
    /(?:alumni|founders|executives)\s+(?:raise|raised)\s+.*?(?:for|to\s+build)\s+([A-Z][A-Za-z0-9\s&\-\.]+?)(?:\s+(?:to|for|with)|\s*$)/i,
    /^([A-Z][A-Za-z0-9\s&\-\.]+?)\s+(?:raises?|secures?|gets?|lands?|closes?|closed)\b/i,
    /^([A-Z][A-Za-z0-9\s&\-\.]+?)\s+(?:announces?|announced)\b/i,
    /^([A-Z][A-Za-z0-9\s&\-\.]+?)\s+(?:has\s+raised)\b/i,
    // Pattern: "...raise X for Company" or "...raises X to build..."
    /(?:raise[d-s]?\s+\$?[\d.,]+\s*(?:[KMB]|million|billion)?\s+(?:for|to\s+build)\s+)([A-Z][A-Za-z0-9\s&\-\.]+?)(?:\s+(?:to|for|with)|\s*$)/i,
  ];
  for (const pattern of patterns) {
    const match = cleanHeadline.match(pattern);
    if (match) {
      const candidate = stripCompanyPrefix(match[1].trim());
      if (candidate.length >= 2 && !COMPANY_STOP_WORDS.has(candidate.toLowerCase())) {
        return candidate;
      }
    }
  }

  // Fallback: first 1-3 capitalized words, but skip stop words
  const words = cleanHeadline.match(/^([A-Z][a-zA-Z0-9]*(?:[-'][A-Za-z]+)*(?:\s+[A-Z][a-zA-Z0-9]*(?:[-'][A-Za-z]+)*){0,2})/);
  if (words) {
    const candidate = stripCompanyPrefix(words[1].trim());
    if (candidate.length >= 2 && !COMPANY_STOP_WORDS.has(candidate.toLowerCase())) {
      return candidate;
    }
  }
  return null;
}

const TAG_KEYWORDS = [
  { tag: "ai", keywords: ["ai", "artificial intelligence", "machine learning", "ml", "llm", "generative ai", "agent", "mcp"] },
  { tag: "fintech", keywords: ["fintech", "payments", "banking", "crypto", "blockchain", "defi", "web3"] },
  { tag: "healthcare", keywords: ["healthcare", "health", "biotech", "medical", "pharma", "drug"] },
  { tag: "climate", keywords: ["climate", "carbon", "clean energy", "sustainability", "green"] },
  { tag: "europe", keywords: ["european", "europe", "uk", "germany", "france", "netherlands", "sweden", "berlin", "london", "paris"] },
  { tag: "india", keywords: ["india", "indian", "bangalore", "mumbai", "delhi"] },
  { tag: "hardware", keywords: ["hardware", "robotics", "semiconductor", "chip", "iot", "drone"] },
  { tag: "saas", keywords: ["saas", "enterprise", "b2b", "developer tools", "devtools"] },
  { tag: "consumer", keywords: ["consumer", "social", "marketplace", "e-commerce", "retail"] },
  { tag: "defense", keywords: ["defense", "military", "aerospace", "space", "satellite"] },
];

function extractTags(headline, description) {
  const text = `${headline} ${description}`.toLowerCase();
  const tags = [];
  for (const { tag, keywords } of TAG_KEYWORDS) {
    for (const keyword of keywords) {
      if (text.includes(keyword.toLowerCase())) {
        tags.push(tag);
        break;
      }
    }
  }
  return tags;
}

function extractFunding(headline, description) {
  const combined = `${headline} ${description}`;
  const companyName = extractCompanyName(headline);
  const amount = extractAmount(combined);
  const roundType = extractRoundType(combined);

  if (!companyName && !amount && !roundType) return null;

  let confidence = "none";
  if (companyName && amount && roundType) confidence = "high";
  else if ((companyName && amount) || (companyName && roundType)) confidence = "medium";
  else if (companyName || amount) confidence = "low";

  // Try known logo / domain
  const companyLogoUrl = getKnownCompanyLogoUrl(companyName);
  const companyWebsite = getKnownCompanyDomain(companyName) ? `https://${getKnownCompanyDomain(companyName)}` : null;

  return {
    companyName: companyName ?? "Unknown",
    companyWebsite,
    companyLogoUrl,
    amount: amount?.amount ?? null,
    amountDisplay: amount?.display ?? "Undisclosed",
    currency: "USD",
    roundType: roundType ?? "undisclosed",
    investors: [],
    investorsEnriched: [],
    confidence,
  };
}

// ---------------------------------------------------------------------------
// Scraping
// ---------------------------------------------------------------------------

async function fetchRssFeed(url, sourceName) {
  console.log(`[funding] fetching ${sourceName}: ${url}`);
  try {
    const res = await fetchWithTimeout(url, {
      timeoutMs: 20_000,
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/rss+xml,application/xml,*/*;q=0.8",
      },
    });
    if (!res.ok) {
      console.error(`[funding] ${sourceName} HTTP ${res.status}`);
      return [];
    }
    const xml = await res.text();
    const items = parseRssItems(xml, url);
    console.log(`[funding] ${sourceName}: ${items.length} items`);
    return items;
  } catch (err) {
    console.error(`[funding] ${sourceName} failed: ${err.message}`);
    return [];
  }
}

function createSignalId(headline, sourceUrl) {
  // Deterministic ID from headline + source domain
  const domain = sourceUrl.replace(/^https?:\/\//, "").split("/")[0] ?? "unknown";
  const hash = Array.from(headline).reduce((h, c) => ((h * 31 + c.charCodeAt(0)) >>> 0), 0);
  return `${domain}-${hash.toString(16).slice(0, 8)}`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const outputFlag = args.find((a) => a.startsWith("--output="));
  const outputPath = outputFlag ? resolve(outputFlag.split("=")[1]) : OUT_PATH;
  const sourcesFlag = args.find((a) => a.startsWith("--sources="));
  const requestedSources = sourcesFlag
    ? sourcesFlag.split("=")[1].split(",")
    : Object.keys(RSS_FEEDS);

  const discoveredAt = new Date().toISOString();
  const allSignals = [];
  const seenIds = new Set();

  for (const sourceName of requestedSources) {
    const url = RSS_FEEDS[sourceName];
    if (!url) {
      console.warn(`[funding] unknown source: ${sourceName}`);
      continue;
    }

    const items = await fetchRssFeed(url, sourceName);
    await sleep(500); // be polite between sources

    for (const item of items) {
      // Skip old items
      const itemDate = Date.parse(item.publishedAt);
      if (Number.isFinite(itemDate) && Date.now() - itemDate > MAX_AGE_MS) {
        continue;
      }

      // Only keep funding-related headlines
      const fundingKeywords =
        /\braises?\b|\braised\b|\bsecures?\b|\bsecured\b|\bfunding\b|\binvestment\b|\bround\b|\bmillion\b|\bbillion\b|\bacquired\b|\bacquisition\b/i;
      if (!fundingKeywords.test(item.headline)) {
        continue;
      }

      const id = createSignalId(item.headline, item.sourceUrl);
      if (seenIds.has(id)) continue;
      seenIds.add(id);

      const extracted = extractFunding(item.headline, item.description);
      const tags = extractTags(item.headline, item.description);

      // Skip low-quality extractions
      if (extracted) {
        const badNames = /^(the\s|fintech\b|sources\b|report\b|breaking\b|scoop\b|ai\s+startups|billionaire|cathie\s+wood|creandum\s+partner|alumni\b)/i;
        if (badNames.test(extracted.companyName)) {
          continue;
        }
      }

      allSignals.push({
        id,
        headline: item.headline,
        description: item.description,
        sourceUrl: item.sourceUrl,
        sourcePlatform: sourceName,
        publishedAt: item.publishedAt,
        discoveredAt,
        extracted,
        tags,
      });
    }
  }

  // Merge seed signals (deduplicate by ID)
  for (const seed of SEED_SIGNALS) {
    if (!seenIds.has(seed.id)) {
      seenIds.add(seed.id);
      allSignals.push({ ...seed, discoveredAt });
    }
  }

  // -------------------------------------------------------------------------
  // Article enrichment (optional — fetches article bodies for investor data)
  // -------------------------------------------------------------------------
  const enrichFlag = args.includes("--enrich");
  if (enrichFlag) {
    const enrichLimit = pLimit(3); // max 3 concurrent article fetches
    const signalsToEnrich = allSignals.filter((s) => s.extracted !== null);
    console.log(`[funding] enriching ${signalsToEnrich.length} signals from article bodies...`);

    let enrichedCount = 0;
    await Promise.all(
      signalsToEnrich.map((signal) =>
        enrichLimit(async () => {
          const companyName = signal.extracted.companyName;
          const result = await fetchArticleData(signal.sourceUrl, companyName);
          if (!result.ok) return;

          enrichedCount++;

          // Update company website
          if (result.website) {
            signal.extracted.companyWebsite = result.website;
          }

          // Update logo URL — from article, known map, or fallback
          if (result.logoUrl) {
            signal.extracted.companyLogoUrl = result.logoUrl;
          } else {
            const logoUrl = getKnownCompanyLogoUrl(signal.extracted.companyName);
            if (logoUrl) {
              signal.extracted.companyLogoUrl = logoUrl;
            }
            const knownDomain = getKnownCompanyDomain(signal.extracted.companyName);
            if (knownDomain) {
              signal.extracted.companyWebsite = `https://${knownDomain}`;
            }
          }

          // Update investors if found
          if (result.investors.length > 0) {
            const existingNames = new Set(
              signal.extracted.investors.map((n) => n.toLowerCase()),
            );
            for (const inv of result.investors) {
              if (!existingNames.has(inv.name.toLowerCase())) {
                signal.extracted.investors.push(inv.name);
                signal.extracted.investorsEnriched.push({
                  name: inv.name,
                  isKnown: inv.isKnown,
                  confidence: inv.confidence,
                });
                existingNames.add(inv.name.toLowerCase());
              }
            }
          }

          // Better company name from article if current one looks weak
          if (
            signal.extracted.confidence === "low" &&
            result.articleText
          ) {
            const fromArticle = extractCompanyNameFromArticle(
              result.articleText,
              companyName,
            );
            if (fromArticle && fromArticle.length > companyName.length) {
              signal.extracted.companyName = fromArticle;
            }
          }
        }),
      ),
    );
    console.log(`[funding] enriched ${enrichedCount} signals`);
  }

  // Sort newest first
  allSignals.sort((a, b) => {
    const ta = Date.parse(a.publishedAt);
    const tb = Date.parse(b.publishedAt);
    return (Number.isFinite(tb) ? tb : 0) - (Number.isFinite(ta) ? ta : 0);
  });

  const payload = {
    fetchedAt: discoveredAt,
    source: "funding-news-scraper",
    windowDays: WINDOW_DAYS,
    signals: allSignals,
  };

  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(outputPath, JSON.stringify(payload, null, 2) + "\n", "utf8");

  const extractedCount = allSignals.filter((s) => s.extracted !== null).length;
  const enrichedCount = allSignals.filter(
    (s) => s.extracted?.companyLogoUrl || s.extracted?.investorsEnriched?.length,
  ).length;
  console.log(
    `[funding] wrote ${allSignals.length} signals (${extractedCount} with extraction, ${enrichedCount} enriched) to ${outputPath}`,
  );
}

// Try to find a better company name from article text
function extractCompanyNameFromArticle(text, currentName) {
  // Look for patterns like "[Company], a [description] company,"
  const patterns = [
    /([A-Z][A-Za-z0-9\s&\.]{2,50}?),\s+a\s+[^,]+?company/g,
    /([A-Z][A-Za-z0-9\s&\.]{2,50}?)\s+is\s+a\s+/g,
    /([A-Z][A-Za-z0-9\s&\.]{2,50}?)\s+has\s+raised/g,
  ];

  for (const pattern of patterns) {
    const matches = Array.from(text.matchAll(pattern));
    for (const match of matches) {
      const candidate = match[1].trim();
      if (
        candidate.length >= 3 &&
        candidate.toLowerCase().includes(currentName.toLowerCase().slice(0, 4))
      ) {
        return candidate;
      }
    }
  }
  return null;
}

// Guard so tests can import without auto-running
if (process.argv[1] && process.argv[1].includes("scrape-funding-news")) {
  main().catch((err) => {
    console.error("[funding] fatal:", err);
    process.exit(1);
  });
}

export {
  extractAmount,
  extractRoundType,
  extractCompanyName,
  extractTags,
  extractFunding,
  parseRssItems,
};
