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

import {
  extractFirstGithubRepoLink,
  normalizeGithubRepoUrl,
} from "./_github-repo-links.mjs";

export const USER_AGENT =
  "TrendingRepo/0.2 (+https://github.com/0motionguy/starscreener)";
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

export function extractGithubLink(text) {
  return extractFirstGithubRepoLink(text);
}

const X_HOSTS = new Set([
  "x.com",
  "www.x.com",
  "twitter.com",
  "www.twitter.com",
  "mobile.twitter.com",
  "mobile.x.com",
]);

const RESERVED_X_PATHS = new Set([
  "home",
  "search",
  "explore",
  "hashtag",
  "i",
  "intent",
  "share",
  "compose",
  "messages",
  "notifications",
  "settings",
  "login",
]);

const URL_ATTR_RE = /\b(?:href|content)\s*=\s*["']([^"'#][^"']*)["']/gi;
const ABSOLUTE_URL_RE = /https?:\/\/[^\s"'<>`\\]+/gi;
const DISCOVER_TIMEOUT_MS = 8000;
const DISCOVER_HTML_LIMIT = 250_000;

function stripTrailingPunctuation(value) {
  return String(value ?? "").replace(/[),.;:!?]+$/, "");
}

export function normalizeGithubUrl(raw) {
  return normalizeGithubRepoUrl(raw);
}

export function normalizeXUrl(raw) {
  if (!raw || typeof raw !== "string") return null;
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }

  const host = parsed.hostname.toLowerCase();
  if (!X_HOSTS.has(host)) return null;

  const segments = parsed.pathname
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);
  if (segments.length < 1) return null;

  const handle = (segments[0] ?? "").replace(/^@+/, "");
  if (!handle) return null;
  if (RESERVED_X_PATHS.has(handle.toLowerCase())) return null;

  if ((segments[1] ?? "").toLowerCase() === "status" && segments[2]) {
    const statusId = stripTrailingPunctuation(segments[2]);
    if (!statusId) return null;
    return `https://x.com/${handle}/status/${statusId}`;
  }

  return `https://x.com/${handle}`;
}

export function extractXLink(text) {
  if (!text || typeof text !== "string") return null;
  const scan = text.replace(/\\\//g, "/");
  ABSOLUTE_URL_RE.lastIndex = 0;
  let match;
  while ((match = ABSOLUTE_URL_RE.exec(scan)) !== null) {
    const candidate = stripTrailingPunctuation(match[0] ?? "");
    const normalized = normalizeXUrl(candidate);
    if (normalized) return normalized;
  }
  return null;
}

export function extractLinkedUrls(text, baseUrl) {
  const sources = [];
  if (typeof baseUrl === "string" && baseUrl) sources.push(baseUrl);
  if (typeof text === "string" && text) sources.push(text.replace(/\\\//g, "/"));

  let githubUrl = null;
  let xUrl = null;

  const accept = (raw) => {
    if (!raw || typeof raw !== "string") return;
    let candidate = stripTrailingPunctuation(raw.trim());
    if (!candidate) return;
    if (baseUrl) {
      try {
        candidate = new URL(candidate, baseUrl).toString();
      } catch {
        return;
      }
    }
    if (!githubUrl) githubUrl = normalizeGithubUrl(candidate);
    if (!xUrl) xUrl = normalizeXUrl(candidate);
  };

  for (const source of sources) {
    URL_ATTR_RE.lastIndex = 0;
    let attr;
    while ((attr = URL_ATTR_RE.exec(source)) !== null) {
      accept(attr[1] ?? "");
      if (githubUrl && xUrl) return { githubUrl, xUrl };
    }

    ABSOLUTE_URL_RE.lastIndex = 0;
    let absolute;
    while ((absolute = ABSOLUTE_URL_RE.exec(source)) !== null) {
      accept(absolute[0] ?? "");
      if (githubUrl && xUrl) return { githubUrl, xUrl };
    }
  }

  return { githubUrl, xUrl };
}

export async function discoverLinkedUrls(url) {
  if (!url || typeof url !== "string") {
    return { githubUrl: null, xUrl: null };
  }

  const direct = extractLinkedUrls(url, url);
  if (direct.githubUrl || direct.xUrl) return direct;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DISCOVER_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: {
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1",
        "User-Agent": BROWSER_UA,
      },
      signal: controller.signal,
    });
    const finalUrl = res.url || url;
    const links = extractLinkedUrls(finalUrl, finalUrl);
    const contentType = (res.headers.get("content-type") ?? "").toLowerCase();
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
      return links;
    }

    const html = await res.text();
    const merged = extractLinkedUrls(html.slice(0, DISCOVER_HTML_LIMIT), finalUrl);
    return {
      githubUrl: links.githubUrl ?? merged.githubUrl,
      xUrl: links.xUrl ?? merged.xUrl,
    };
  } catch {
    return { githubUrl: null, xUrl: null };
  } finally {
    clearTimeout(timer);
  }
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
