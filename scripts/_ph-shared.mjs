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
