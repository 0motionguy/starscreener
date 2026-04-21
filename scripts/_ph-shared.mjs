// Shared helpers for the ProductHunt scraper.
//
// Auth: bearer PRODUCTHUNT_TOKEN (OAuth client-credentials token — never
// expires in our usage). Rate limit is ~100 req/hr; a daily run uses <10
// requests, so we only need light politeness (1s between topic queries).
//
// Public surface:
//   phGraphQL(query, variables, { token }) — POST with retries for 5xx
//   TOPICS                                 — the four topic slugs we fan out to
//   AI_KEYWORDS / hasAiKeyword(text)       — keyword filter that catches
//                                            LLM/agent/MCP/skill/RAG launches
//                                            even when PH's topic taxonomy
//                                            doesn't tag them as AI
//   extractGithubLink(text)                — first github.com/<owner>/<repo>
//                                            URL in a blob (reserved-owner
//                                            excluded — matches HN scraper)
//   daysBetween(isoA, isoB?)               — non-negative integer days

export const USER_AGENT =
  "StarScreener/0.1 (+https://github.com/0motionguy/starscreener)";
export const PH_GRAPHQL_URL = "https://api.producthunt.com/v2/api/graphql";

// Kept stable so dedupe works across runs. Order doesn't matter — we merge
// by post ID before normalizing.
export const TOPICS = [
  "artificial-intelligence",
  "developer-tools",
  "saas",
  "productivity",
];

// Catches launches that PH's topic taxonomy doesn't tag as AI but which
// are clearly AI-adjacent by name/tagline/description. Word-contains match
// (lowercase) on the whole blob. Intentionally loose: a false positive is
// cheaper than missing a high-signal launch (the whole point of PH as a
// signal source is catching early AI products before they trend elsewhere).
export const AI_KEYWORDS = [
  "llm",
  "agent",
  "agents",
  "mcp",
  "skill",
  "skills",
  "claude",
  "gpt",
  "openai",
  "anthropic",
  "copilot",
  "llama",
  "mistral",
  "gemini",
  "rag",
  "vector",
  "embedding",
  "prompt",
  "chatbot",
  "fine-tun",
  "inference",
  "genai",
  "generative ai",
  "ai-powered",
  "ai agent",
  "model context",
  "open source",
];

const TIMEOUT_MS = 15_000;
const RETRY_STATUSES = new Set([500, 502, 503, 504]);
const MAX_ATTEMPTS = 3;

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function hasAiKeyword(text) {
  if (!text) return false;
  const lower = String(text).toLowerCase();
  return AI_KEYWORDS.some((kw) => lower.includes(kw));
}

export async function phGraphQL(query, variables, { token } = {}) {
  if (!token) throw new Error("PRODUCTHUNT_TOKEN is required");

  let lastErr;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let res;
    try {
      res = await fetch(PH_GRAPHQL_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "application/json",
          "User-Agent": USER_AGENT,
        },
        body: JSON.stringify({ query, variables }),
        signal: controller.signal,
      });
    } catch (err) {
      lastErr = err;
      clearTimeout(timer);
      if (attempt < MAX_ATTEMPTS) {
        await sleep(1000 * attempt);
        continue;
      }
      throw err;
    }
    clearTimeout(timer);

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      if (RETRY_STATUSES.has(res.status) && attempt < MAX_ATTEMPTS) {
        lastErr = new Error(`HTTP ${res.status}`);
        await sleep(1000 * attempt);
        continue;
      }
      throw new Error(
        `PH GraphQL HTTP ${res.status} ${res.statusText} — ${text.slice(0, 300)}`,
      );
    }

    const body = await res.json();
    if (body.errors && body.errors.length > 0) {
      throw new Error(
        `PH GraphQL error: ${body.errors.map((e) => e.message).join("; ")}`,
      );
    }
    return body.data;
  }
  throw lastErr ?? new Error("PH GraphQL: unknown failure");
}

// Regex + reserved-owner list mirror scrape-hackernews.mjs so a URL parsed
// by either scraper resolves to the same canonical fullName.
const GH_URL_RE =
  /https?:\/\/(?:www\.)?github\.com\/([A-Za-z0-9][A-Za-z0-9._-]*)\/([A-Za-z0-9][A-Za-z0-9._-]*)/g;

const RESERVED_GITHUB_OWNERS = new Set([
  "orgs",
  "settings",
  "about",
  "features",
  "pricing",
  "marketplace",
  "collections",
  "trending",
  "topics",
  "search",
  "login",
  "join",
  "sponsors",
  "enterprise",
  "customer-stories",
  "readme",
  "apps",
  "notifications",
]);

export function extractGithubLink(text) {
  if (!text || typeof text !== "string") return null;
  GH_URL_RE.lastIndex = 0;
  let m;
  while ((m = GH_URL_RE.exec(text)) !== null) {
    const owner = m[1];
    // Order matters: strip trailing punctuation BEFORE `.git`. The capture
    // group allows `.` so "bar.git." arrives intact; stripping punctuation
    // first leaves "bar.git", then the .git-strip yields "bar".
    const name = m[2]
      .replace(/[.,;:!?)\]}]+$/, "")
      .replace(/\.git$/i, "");
    if (!owner || !name) continue;
    if (RESERVED_GITHUB_OWNERS.has(owner.toLowerCase())) continue;
    return {
      url: `https://github.com/${owner}/${name}`,
      fullName: `${owner}/${name}`,
    };
  }
  return null;
}

export function daysBetween(isoA, isoB) {
  const a = new Date(isoA).getTime();
  const b = new Date(isoB ?? new Date().toISOString()).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.max(0, Math.floor((b - a) / 86_400_000));
}

// ---------------------------------------------------------------------------
// Redirect resolution via `curl` subprocess.
//
// PH's `website` field arrives as `producthunt.com/r/<code>` — a tracking
// redirect fronted by Cloudflare that returns 403 to Node's fetch/https
// (TLS fingerprint mismatch). curl slips through unmodified. Node has no
// direct way to replicate curl's TLS+header profile without adding a dep;
// shelling out to curl is the pragmatic workaround, no new npm package.
//
// Returns the final https URL (stripped of PH utm/ref params) or null on
// any failure. Graceful: if `curl` isn't on PATH (Windows without Git Bash),
// returns null and the caller falls back to description-only extraction.
// ---------------------------------------------------------------------------

import { spawn } from "node:child_process";

const CURL_TIMEOUT_MS = 8000;
const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

let _curlAvailable = null;
async function curlAvailable() {
  if (_curlAvailable !== null) return _curlAvailable;
  _curlAvailable = await new Promise((resolve) => {
    const child = spawn("curl", ["--version"], { stdio: "ignore" });
    child.on("error", () => resolve(false));
    child.on("close", (code) => resolve(code === 0));
  });
  return _curlAvailable;
}

/**
 * Resolve a URL through curl, following redirects. Uses `-o /dev/null` so
 * we don't waste bandwidth on body bytes; `-w %{url_effective}` prints the
 * final URL after all redirects.
 */
export async function resolveRedirect(url) {
  if (!url || typeof url !== "string") return null;
  // Non-PH-redirect URLs pass through — no fetch needed.
  if (!url.includes("producthunt.com/r/")) return url;

  if (!(await curlAvailable())) return null;

  return new Promise((resolve) => {
    const devnull = process.platform === "win32" ? "NUL" : "/dev/null";
    const args = [
      "-sS",
      "-L",
      "--max-redirs",
      "4",
      "-A",
      BROWSER_UA,
      "-o",
      devnull,
      "-w",
      "%{url_effective}",
      "--max-time",
      String(Math.ceil(CURL_TIMEOUT_MS / 1000)),
      url,
    ];
    const child = spawn("curl", args);
    let stdout = "";
    let done = false;
    const finalize = (val) => {
      if (done) return;
      done = true;
      resolve(val);
    };
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.on("error", () => finalize(null));
    child.on("close", (code) => {
      if (code !== 0) return finalize(null);
      const finalUrl = stdout.trim();
      if (!finalUrl || !finalUrl.startsWith("http")) return finalize(null);
      try {
        const u = new URL(finalUrl);
        for (const key of Array.from(u.searchParams.keys())) {
          if (key === "ref" || key.startsWith("utm_")) {
            u.searchParams.delete(key);
          }
        }
        finalize(u.toString().replace(/\?$/, ""));
      } catch {
        finalize(finalUrl);
      }
    });
  });
}

// ---------------------------------------------------------------------------
// GitHub enrichment — topics + README snippet for launches that resolved to
// a github.com URL. Uses GITHUB_TOKEN from env (GHA provides it; local runs
// may skip when absent). 5000 req/hr authenticated is plenty for ~50 repos.
// ---------------------------------------------------------------------------

const KEYWORD_TAGS = [
  // Tag → match-any keyword list. Order matters: first hit wins for
  // deduplication. Keep conservative so "agent" in unrelated SaaS copy
  // doesn't mint false positives.
  { tag: "mcp", keywords: ["mcp", "model-context-protocol", "model context protocol"] },
  { tag: "claude-skill", keywords: ["claude skill", "claude-skill", "claude skills"] },
  { tag: "agent", keywords: ["agent", "agents", "agentic"] },
  { tag: "llm", keywords: ["llm", "large language model"] },
  { tag: "rag", keywords: ["rag", "retrieval-augmented", "retrieval augmented"] },
  { tag: "chatbot", keywords: ["chatbot", "chat bot"] },
  { tag: "fine-tune", keywords: ["fine-tun", "finetun"] },
  { tag: "vector-db", keywords: ["vector db", "vector database", "pgvector"] },
];

async function ghFetch(path, token) {
  const url = `https://api.github.com${path}`;
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": USER_AGENT,
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(url, { headers, signal: controller.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch `{owner, repo}` metadata + README, extract topic list + first-N
 * chars of README, derive keyword tags. Returns null if the repo 404s
 * (renamed / deleted / wrong URL extracted from the PH description).
 */
export async function enrichWithGithub(fullName, { token } = {}) {
  if (!fullName || !fullName.includes("/")) return null;
  const [owner, repo] = fullName.split("/", 2);
  const meta = await ghFetch(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
    token,
  );
  if (!meta) return null;

  const topics = Array.isArray(meta.topics) ? meta.topics.slice(0, 20) : [];

  // README fetch is best-effort — many small launch repos ship without one.
  const readmeRes = await ghFetch(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/readme`,
    token,
  );
  let readmeSnippet = "";
  if (readmeRes?.content && readmeRes.encoding === "base64") {
    try {
      const decoded = Buffer.from(readmeRes.content, "base64").toString("utf8");
      readmeSnippet = decoded.slice(0, 500);
    } catch {
      readmeSnippet = "";
    }
  }

  // Derive tags from topics + description + README
  const blob = [
    meta.description ?? "",
    readmeSnippet,
    topics.join(" "),
  ]
    .join(" ")
    .toLowerCase();
  const tags = new Set();
  // Direct topic-slug matches (highest confidence).
  for (const t of topics) {
    const slug = String(t).toLowerCase();
    if (slug === "mcp" || slug === "model-context-protocol") tags.add("mcp");
    if (slug.includes("agent")) tags.add("agent");
    if (slug === "llm" || slug === "large-language-model") tags.add("llm");
    if (slug === "rag") tags.add("rag");
    if (slug.includes("chatbot")) tags.add("chatbot");
    if (slug === "ai" || slug === "artificial-intelligence") tags.add("ai");
  }
  // Keyword matches on description + README.
  for (const { tag, keywords } of KEYWORD_TAGS) {
    if (keywords.some((kw) => blob.includes(kw))) tags.add(tag);
  }

  return {
    stars: Number.isFinite(meta.stargazers_count) ? meta.stargazers_count : 0,
    topics,
    readmeSnippet,
    tags: Array.from(tags),
  };
}
