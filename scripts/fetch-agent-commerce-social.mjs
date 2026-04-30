#!/usr/bin/env node
// Cross-source social enrichment for the Agent Commerce corpus.
//
// Single fetch per source, then LOCAL match against entity names + github
// full_names. Avoids per-entity API calls (would be 30K+ requests across 7K
// entities × 5 sources). Each source returns ~100-300 recent posts mentioning
// agent-commerce keywords; we count which entities each post mentions.
//
// Sources (all free, no auth):
//   Reddit       — www.reddit.com/search.json
//   Bluesky      — public.api.bsky.app/xrpc/app.bsky.feed.searchPosts
//   Dev.to       — dev.to/api/articles
//   Lobsters     — lobste.rs/search.json
//   Hugging Face — huggingface.co/api/spaces (search by tag)
//
// Output: .data/agent-commerce-social-enrichment.json
//   { fetchedAt, perEntity: { slug → { reddit, bluesky, devto, lobsters, hf } } }
//
// Flags:
//   --dry-run            don't write
//   --timeout-ms N       per-request (default 12000)
//   --skip <source>      skip one or more sources (comma-separated)
//   --max-posts-per N    cap per-source post fetch (default 200)

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";

const SNAPSHOT_PATH = resolve(process.cwd(), "data/agent-commerce.json");
const OUT_PATH = resolve(
  process.cwd(),
  ".data/agent-commerce-social-enrichment.json",
);

const DRY_RUN = process.argv.includes("--dry-run");
const TIMEOUT_MS = parseNumberArg("--timeout-ms", 12_000);
const MAX_POSTS = parseNumberArg("--max-posts-per", 200);
const SKIP = new Set(
  (parseStringArg("--skip", "") || "").split(",").filter(Boolean),
);

function parseNumberArg(name, fallback) {
  const idx = process.argv.indexOf(name);
  if (idx === -1 || idx === process.argv.length - 1) return fallback;
  const n = parseInt(process.argv[idx + 1], 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function parseStringArg(name, fallback) {
  const idx = process.argv.indexOf(name);
  if (idx === -1 || idx === process.argv.length - 1) return fallback;
  return process.argv[idx + 1];
}

function slugify(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

async function fetchJson(url, opts = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      ...opts,
      signal: ctrl.signal,
      headers: {
        Accept: "application/json",
        // Reddit/Bluesky require a real-looking UA; their bot-detection blocks
        // generic strings. Mimicking a desktop browser passes both.
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) trendingrepo-ac/0.1 Chrome/124.0.0.0 Safari/537.36",
        ...(opts.headers ?? {}),
      },
    });
    if (!res.ok) return { ok: false, status: res.status };
    return { ok: true, data: await res.json() };
  } catch (err) {
    return { ok: false, error: String(err?.message ?? err) };
  } finally {
    clearTimeout(t);
  }
}

// ---------------------------------------------------------------------------
// Source pulls
// ---------------------------------------------------------------------------

const QUERIES = [
  "x402",
  "mcp server",
  "agent commerce",
  "agent payments",
  "agent wallet",
  "agentic commerce",
  "model context protocol",
];

async function pullReddit() {
  if (SKIP.has("reddit")) return [];
  // Reddit's APIs (www.reddit.com + old.reddit.com) are blocked in many
  // build environments (Cloudflare bot challenge / network egress filter).
  // The project ships its own Reddit collector that runs separately and
  // writes data/reddit-all-posts.json. We piggy-back on that collected data
  // instead of going to the wire.
  try {
    const path = resolve(process.cwd(), "data/reddit-all-posts.json");
    const data = JSON.parse(readFileSync(path, "utf8"));
    const arr = data.posts ?? [];
    const posts = arr.map((p) => ({
      title: p.title ?? "",
      body: p.selftext ?? "",
      url: p.permalink ?? p.url ?? "",
      external: p.url ?? "",
      score: p.score ?? 0,
      created: p.createdUtc ?? 0,
      subreddit: p.subreddit ?? "",
      query: "data/reddit-all-posts.json",
    }));
    process.stdout.write(`  reddit (from data/reddit-all-posts.json) → ${posts.length}\n`);
    return posts;
  } catch (err) {
    console.warn(`  reddit local-read failed: ${err.message ?? err}`);
    return [];
  }
}

async function pullBluesky() {
  if (SKIP.has("bluesky")) return [];
  const out = [];
  for (const q of QUERIES) {
    // public.api was deprecated; api.bsky.app is the current public read host
    const url =
      `https://api.bsky.app/xrpc/app.bsky.feed.searchPosts` +
      `?q=${encodeURIComponent(q)}&limit=100`;
    const r = await fetchJson(url);
    if (!r.ok) {
      console.warn(`  bluesky q="${q}" → ${r.status ?? r.error}`);
      continue;
    }
    const posts = (r.data?.posts ?? []).map((p) => ({
      title: p.record?.text ?? "",
      body: "",
      url: `https://bsky.app/profile/${p.author?.handle}/post/${(p.uri ?? "").split("/").pop() ?? ""}`,
      external: "",
      score: (p.likeCount ?? 0) + 2 * (p.repostCount ?? 0),
      created: p.indexedAt
        ? Math.floor(new Date(p.indexedAt).getTime() / 1000)
        : 0,
      handle: p.author?.handle ?? "",
      query: q,
    }));
    out.push(...posts);
    process.stdout.write(`  bluesky q="${q.padEnd(28)}" → ${posts.length}\n`);
  }
  return out;
}

async function pullDevto() {
  if (SKIP.has("devto")) return [];
  const out = [];
  for (const tag of ["ai", "agents", "mcp", "x402", "llm", "openai"]) {
    const url = `https://dev.to/api/articles?per_page=100&tag=${encodeURIComponent(tag)}`;
    const r = await fetchJson(url);
    if (!r.ok) {
      console.warn(`  devto tag="${tag}" → ${r.status ?? r.error}`);
      continue;
    }
    const posts = (r.data ?? []).map((a) => ({
      title: a.title ?? "",
      body: a.description ?? "",
      url: a.url ?? "",
      external: "",
      score: (a.public_reactions_count ?? 0) + (a.comments_count ?? 0),
      created: a.published_at
        ? Math.floor(new Date(a.published_at).getTime() / 1000)
        : 0,
      tag,
    }));
    out.push(...posts);
    process.stdout.write(`  devto tag="${tag.padEnd(28)}" → ${posts.length}\n`);
  }
  return out;
}

async function pullLobsters() {
  if (SKIP.has("lobsters")) return [];
  // Lobsters has no working public search-as-JSON endpoint; their search
  // page is HTML-only. Fall back to the recent stories firehose JSON, then
  // local-filter for AC keywords.
  const url = "https://lobste.rs/hottest.json";
  const r = await fetchJson(url);
  if (!r.ok) {
    console.warn(`  lobsters hottest.json → ${r.status ?? r.error}`);
    return [];
  }
  const arr = Array.isArray(r.data) ? r.data : [];
  const keywords = QUERIES.map((q) => q.toLowerCase());
  const posts = arr
    .filter((s) => {
      const blob = `${s.title ?? ""} ${s.description ?? ""} ${(s.tags ?? []).join(" ")}`.toLowerCase();
      return keywords.some((k) => blob.includes(k));
    })
    .map((s) => ({
      title: s.title ?? "",
      body: s.description ?? "",
      url: s.short_id_url ?? s.comments_url ?? "",
      external: s.url ?? "",
      score: s.score ?? 0,
      created: s.created_at
        ? Math.floor(new Date(s.created_at).getTime() / 1000)
        : 0,
      query: "filter",
    }));
  process.stdout.write(`  lobsters hottest filtered → ${posts.length}\n`);
  return posts;
}

async function pullHuggingFace() {
  if (SKIP.has("hf")) return [];
  const out = [];
  for (const search of ["agent", "mcp", "x402", "agentic"]) {
    const url = `https://huggingface.co/api/spaces?search=${encodeURIComponent(search)}&limit=100&full=true`;
    const r = await fetchJson(url);
    if (!r.ok) {
      console.warn(`  hf search="${search}" → ${r.status ?? r.error}`);
      continue;
    }
    const arr = Array.isArray(r.data) ? r.data : [];
    const posts = arr.map((s) => ({
      title: s.id ?? "",
      body: s.cardData?.short_description ?? "",
      url: `https://huggingface.co/spaces/${s.id}`,
      external: "",
      score: (s.likes ?? 0) * 3 + (s.downloads ?? 0),
      created: s.lastModified
        ? Math.floor(new Date(s.lastModified).getTime() / 1000)
        : 0,
      search,
    }));
    out.push(...posts);
    process.stdout.write(`  hf search="${search.padEnd(28)}" → ${posts.length}\n`);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Matching: post → entities mentioned
// ---------------------------------------------------------------------------

function buildMatchers(items) {
  // Lowercase indexOf with manual word-boundary check is ~10× faster than
  // regex on the 7K-entity × 4K-post matrix. Drops generic 1-word names
  // shorter than 6 chars (would match "agent" / "data" everywhere) but
  // keeps a small allowlist of globally-unique short names.
  const SHORT_KEEP = new Set(["x402", "exa", "groq", "modal", "para"]);
  return items
    .map((item) => {
      const needles = [];
      const name = (item.name ?? "").trim().toLowerCase();
      if (
        name.length >= 6 ||
        name.includes(" ") ||
        SHORT_KEEP.has(name)
      ) {
        needles.push({ type: "name", needle: name });
      }
      if (item.links?.github) {
        needles.push({
          type: "github",
          needle: `github.com/${item.links.github.toLowerCase()}`,
        });
      }
      const websiteHost = safeHost(item.links?.website);
      if (
        websiteHost &&
        websiteHost.split(".").length >= 2 &&
        websiteHost.length >= 8
      ) {
        needles.push({ type: "domain", needle: websiteHost });
      }
      return { item, itemHost: safeHost(item.links?.website), needles };
    })
    .filter((m) => m.needles.length > 0);
}

function safeHost(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

const ALNUM_RE = /[a-z0-9]/;

function matchInHaystack(haystack, needle) {
  let from = 0;
  while (from <= haystack.length - needle.length) {
    const idx = haystack.indexOf(needle, from);
    if (idx === -1) return false;
    const before = idx === 0 ? "" : haystack[idx - 1];
    const after =
      idx + needle.length >= haystack.length
        ? ""
        : haystack[idx + needle.length];
    if (!ALNUM_RE.test(before) && !ALNUM_RE.test(after)) return true;
    from = idx + 1;
  }
  return false;
}

// Per-source stopwords: entity names that would match nearly every post
// from that source (e.g. an MCP server literally named "Reddit" matches
// every Reddit post URL). Suppressed at match-time to avoid noise.
const SOURCE_STOPWORDS = {
  reddit: new Set(["reddit", "advice", "youtube", "twitter", "discord", "stack"]),
  bluesky: new Set(["bluesky", "twitter", "discord"]),
  devto: new Set(["dev.to", "devto"]),
  hf: new Set([
    "hugging-face-spaces",
    "huggingface",
    "template",
    "model",
    "dataset",
  ]),
  lobsters: new Set(["lobsters"]),
};

function matchPosts(posts, matchers, sourceLabel) {
  const stop = SOURCE_STOPWORDS[sourceLabel] ?? new Set();
  const perEntity = new Map();
  for (const post of posts) {
    const haystack =
      `${post.title}\n${post.body}\n${post.url}\n${post.external}`.toLowerCase();
    const postHost = safeHost(post.url) ?? safeHost(post.external);
    for (const { item, itemHost, needles } of matchers) {
      if (stop.has(item.slug.toLowerCase())) continue;
      const sameHost = postHost && itemHost && postHost === itemHost;
      let hit = false;
      for (const n of needles) {
        if (sameHost && n.type === "domain") continue;
        if (n.type === "github" || n.type === "domain") {
          if (haystack.includes(n.needle)) {
            hit = true;
            break;
          }
        } else if (matchInHaystack(haystack, n.needle)) {
          hit = true;
          break;
        }
      }
      if (!hit) continue;
      let entry = perEntity.get(item.slug);
      if (!entry) {
        entry = { count: 0, topPosts: [], topScore: -1 };
        perEntity.set(item.slug, entry);
      }
      entry.count++;
      if ((post.score ?? 0) > entry.topScore) {
        entry.topScore = post.score ?? 0;
        entry.topPosts.unshift({
          url: post.url || post.external,
          title: (post.title ?? "").slice(0, 120),
          score: post.score ?? 0,
          ago: post.created
            ? Math.max(
                0,
                Math.floor((Date.now() / 1000 - post.created) / 86400),
              ) + "d"
            : null,
        });
        if (entry.topPosts.length > 3) entry.topPosts.length = 3;
      }
    }
  }
  return perEntity;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const snap = JSON.parse(readFileSync(SNAPSHOT_PATH, "utf8"));
  const items = snap.items ?? [];
  console.log(
    `[ac-social] matching against ${items.length} entities · queries=${QUERIES.length} · skip=${[...SKIP].join(",") || "none"}`,
  );
  console.log("");

  console.log("[ac-social] pulling sources");
  const [reddit, bluesky, devto, lobsters, hf] = await Promise.all([
    pullReddit(),
    pullBluesky(),
    pullDevto(),
    pullLobsters(),
    pullHuggingFace(),
  ]);
  console.log("");
  console.log(
    `[ac-social] post counts: reddit=${reddit.length} bluesky=${bluesky.length} ` +
      `devto=${devto.length} lobsters=${lobsters.length} hf=${hf.length}`,
  );

  const matchers = buildMatchers(items);

  const matched = {
    reddit: matchPosts(reddit, matchers, "reddit"),
    bluesky: matchPosts(bluesky, matchers, "bluesky"),
    devto: matchPosts(devto, matchers, "devto"),
    lobsters: matchPosts(lobsters, matchers, "lobsters"),
    hf: matchPosts(hf, matchers, "hf"),
  };

  // Build per-entity record
  const perEntity = {};
  for (const [source, m] of Object.entries(matched)) {
    for (const [slug, entry] of m.entries()) {
      perEntity[slug] = perEntity[slug] ?? {};
      perEntity[slug][source] = entry;
    }
  }

  const fetchedAt = new Date().toISOString();
  const matchedCount = Object.keys(perEntity).length;
  console.log("");
  console.log(
    `[ac-social] ${matchedCount} entities matched (${Math.round((matchedCount / items.length) * 100)}% of corpus)`,
  );

  console.log("");
  console.log("[ac-social] top per source:");
  for (const [source, m] of Object.entries(matched)) {
    const top = Array.from(m.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 5);
    console.log(`  ${source}:`);
    for (const [slug, entry] of top) {
      console.log(`    ${entry.count.toString().padStart(3)}  ${slug}`);
    }
  }

  if (DRY_RUN) {
    console.log("[ac-social] --dry-run — nothing written.");
    return;
  }

  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(
    OUT_PATH,
    JSON.stringify({ fetchedAt, perEntity }, null, 2),
    "utf8",
  );
  console.log("");
  console.log(`[ac-social] wrote ${OUT_PATH}`);
  console.log(
    "[ac-social] next: run `npm run build:agent-commerce` to merge into the snapshot.",
  );
}

main().catch((err) => {
  console.error("[ac-social] fatal:", err);
  process.exit(1);
});
