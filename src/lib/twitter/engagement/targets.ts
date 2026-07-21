// X engagement — target config (operator-editable, curated list).
//
// `loadTargets()` returns the curated account list; `loadTopicQueries()`
// returns the topic searches. Both prefer an env-provided JSON override so the
// operator can adjust the roster WITHOUT a code change (ENGAGE_TARGETS_JSON /
// ENGAGE_TOPIC_QUERIES). The CURATED_TARGETS below were produced by the
// research pass (2026-07 roster) — replace or extend via env, not by forking.
//
// Pure module (no I/O beyond reading env) — safe to unit test.

import type { EngagementTarget } from "./types";

// ---------------------------------------------------------------------------
// HARD EXCLUDE — never reply to ourselves or our sibling account, on any path.
// Enforced in the runner in addition to the freshness own-handle check.
// ---------------------------------------------------------------------------
export const SELF_EXCLUDE_HANDLES: ReadonlySet<string> = new Set([
  "trendingrepo",
  "trending_repos",
]);

export function isExcludedHandle(handle: string): boolean {
  return SELF_EXCLUDE_HANDLES.has(handle.trim().replace(/^@+/, "").toLowerCase());
}

// ---------------------------------------------------------------------------
// Curated roster (21 accounts) — vetted for AI-agent / LLM / open-source
// dev-tool overlap. `cautionFlags` drive the pre-compose classifier
// (see classifier.ts); `replyAngle` is per-account guidance for the composer.
//
// OPERATOR: edit via ENGAGE_TARGETS_JSON (same shape) to add/adjust/remove
// accounts without a deploy. The list here is the vetted default.
// ---------------------------------------------------------------------------
export const CURATED_TARGETS: readonly EngagementTarget[] = [
  // --- Operator picks ---
  {
    handle: "RoundtableSpace",
    tier: "operator",
    followerCount: 257_000,
    topicTags: ["ai", "crypto", "news"],
    replyAngle: "AI/crypto/news firehose — reply ONLY to genuine AI/dev posts",
    cautionFlags: ["crypto-politics-firehose"],
  },
  {
    handle: "aiedge_",
    tier: "operator",
    followerCount: 75_000,
    topicTags: ["ai", "ml", "education"],
    replyAngle: "AI/ML education — add a concrete repo or real number; skip link-only reposts",
    cautionFlags: ["skip-link-only"],
  },
  {
    handle: "theo",
    tier: "operator",
    followerCount: 363_000,
    topicTags: ["typescript", "ai", "devtools"],
    replyAngle: "TS/AI dev — only tool/repo posts; NEVER reply into hot-takes/drama",
    cautionFlags: ["no-hot-takes"],
  },
  {
    handle: "0xNova",
    tier: "operator",
    followerCount: 106,
    topicTags: ["ai", "roleplay"],
    replyAngle: "AI roleplay persona — low ROI, rank lowest/optional",
    cautionFlags: ["low-roi"],
  },

  // --- Curators (best freshness) ---
  {
    handle: "minchoi",
    tier: "curator",
    followerCount: 379_000,
    topicTags: ["ai", "agents", "tools"],
    replyAngle: "Fast AI curator — be quick and concrete, name the closest trending peer",
    cautionFlags: [],
  },
  {
    handle: "rowancheung",
    tier: "curator",
    followerCount: 594_000,
    topicTags: ["ai", "news"],
    replyAngle: "AI news — add the repo/number the audience actually wants",
    cautionFlags: [],
  },
  {
    handle: "itsPaulAi",
    tier: "curator",
    followerCount: 220_000,
    topicTags: ["ai", "tools"],
    replyAngle: "AI tools curator — concrete repo/data only",
    cautionFlags: [],
  },
  {
    handle: "heyBarsee",
    tier: "curator",
    followerCount: 271_000,
    topicTags: ["ai", "tools"],
    replyAngle: "AI curator — skip pure-hype threads",
    cautionFlags: ["skip-hype"],
  },
  {
    handle: "LinusEkenstam",
    tier: "curator",
    followerCount: 239_000,
    topicTags: ["ai", "design", "tools"],
    replyAngle: "AI/design — concrete data or a sharp technical point",
    cautionFlags: [],
  },
  {
    handle: "mreflow",
    tier: "curator",
    followerCount: 117_000,
    topicTags: ["ai", "tools", "video"],
    replyAngle: "AI tools/media — concrete repo/data",
    cautionFlags: [],
  },

  // --- Builders (best fit) ---
  {
    handle: "simonw",
    tier: "builder",
    followerCount: 199_000,
    topicTags: ["python", "llm", "datasette", "tools"],
    replyAngle: "BEST overlap — sharp crowd, bring REAL data or a precise repo",
    cautionFlags: ["needs-real-data"],
  },
  {
    handle: "_akhaliq",
    tier: "builder",
    followerCount: 512_000,
    topicTags: ["ai", "models", "papers"],
    replyAngle: "Perfect fit — be first and concrete; the replies get crowded fast",
    cautionFlags: ["crowded"],
  },
  {
    handle: "omarsar0",
    tier: "builder",
    followerCount: 312_000,
    topicTags: ["ai", "nlp", "llm"],
    replyAngle: "NLP/LLM — concrete repo/data or a real insight",
    cautionFlags: [],
  },
  {
    handle: "swyx",
    tier: "builder",
    followerCount: 176_000,
    topicTags: ["ai", "devtools", "engineering"],
    replyAngle: "AI eng — concrete, peer-level, no hype",
    cautionFlags: [],
  },
  {
    handle: "karpathy",
    tier: "builder",
    followerCount: 3_460_000,
    topicTags: ["ai", "llm", "engineering"],
    replyAngle: "SKIP-heavy — only engage with a killer concrete number",
    cautionFlags: ["skip-heavy", "needs-killer-number"],
  },

  // --- Tools / official ---
  {
    handle: "GithubProjects",
    tier: "tool",
    followerCount: 330_000,
    topicTags: ["github", "devtools", "oss"],
    replyAngle: "Same job as us — reply complementary, never competing",
    cautionFlags: ["complementary-only"],
  },
  {
    handle: "huggingface",
    tier: "tool",
    followerCount: 728_000,
    topicTags: ["models", "oss", "ml"],
    replyAngle: "Models/OSS — concrete repo/model data",
    cautionFlags: [],
  },
  {
    handle: "cursor_ai",
    tier: "tool",
    followerCount: 434_000,
    topicTags: ["ai", "ide", "devtools"],
    replyAngle: "AI IDE — concrete, peer-level dev point",
    cautionFlags: [],
  },
  {
    handle: "LangChain",
    tier: "tool",
    followerCount: 259_000,
    topicTags: ["llm", "agents", "framework"],
    replyAngle: "LLM framework — concrete (note: @LangChain, NOT @LangChainAI which 404s)",
    cautionFlags: [],
  },
  {
    handle: "ollama",
    tier: "tool",
    followerCount: 171_000,
    topicTags: ["local-llm", "inference", "oss"],
    replyAngle: "Local LLMs — concrete repo/model/perf data",
    cautionFlags: [],
  },
  {
    handle: "_philschmid",
    tier: "tool",
    followerCount: 101_000,
    topicTags: ["ml", "llm", "cloud"],
    replyAngle: "ML/LLM — concrete data or a real insight",
    cautionFlags: [],
  },
];

// ---------------------------------------------------------------------------
// Topic searches — surface fresh AI/dev-tool conversation the brand can add a
// data point to, beyond the curated handles. Env-overridable via
// ENGAGE_TOPIC_QUERIES (JSON string array).
// ---------------------------------------------------------------------------
export const DEFAULT_TOPIC_QUERIES: readonly string[] = [
  '"open source" (AI agent OR LLM) tool',
  'new (LLM OR "AI agent") framework github',
  '"just shipped" (developer tool OR CLI OR SDK) open source',
];

const VALID_TIERS = new Set(["operator", "curator", "builder", "tool"]);

function parseTargetsJson(raw: string): EngagementTarget[] | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    const out: EngagementTarget[] = [];
    for (const entry of parsed) {
      if (!entry || typeof entry !== "object") continue;
      const obj = entry as Record<string, unknown>;
      const handle =
        typeof obj.handle === "string" ? obj.handle.trim().replace(/^@+/, "") : "";
      if (!handle) continue;
      if (isExcludedHandle(handle)) continue; // never allow the self-handles in
      const tier =
        typeof obj.tier === "string" && VALID_TIERS.has(obj.tier)
          ? (obj.tier as EngagementTarget["tier"])
          : "builder";
      const followerCount =
        typeof obj.followerCount === "number" && Number.isFinite(obj.followerCount)
          ? Math.max(0, Math.floor(obj.followerCount))
          : 0;
      const topicTags = Array.isArray(obj.topicTags)
        ? obj.topicTags.filter((t): t is string => typeof t === "string").map((t) => t.trim())
        : [];
      const replyAngle = typeof obj.replyAngle === "string" ? obj.replyAngle.trim() : "";
      const cautionFlags = Array.isArray(obj.cautionFlags)
        ? obj.cautionFlags.filter((f): f is string => typeof f === "string").map((f) => f.trim())
        : [];
      out.push({ handle, tier, followerCount, topicTags, replyAngle, cautionFlags });
    }
    return out.length > 0 ? out : null;
  } catch {
    return null;
  }
}

/**
 * Curated engagement targets. Prefers ENGAGE_TARGETS_JSON (operator override);
 * falls back to the vetted CURATED_TARGETS. Self-handles are always excluded.
 */
export function loadTargets(
  env: Record<string, string | undefined> = process.env,
): EngagementTarget[] {
  const raw = env.ENGAGE_TARGETS_JSON?.trim();
  if (raw) {
    const parsed = parseTargetsJson(raw);
    if (parsed) return parsed;
  }
  return CURATED_TARGETS.filter((t) => !isExcludedHandle(t.handle)).map((t) => ({
    ...t,
    topicTags: [...t.topicTags],
    cautionFlags: [...t.cautionFlags],
  }));
}

/**
 * Topic search queries. Prefers ENGAGE_TOPIC_QUERIES (JSON string array);
 * falls back to DEFAULT_TOPIC_QUERIES.
 */
export function loadTopicQueries(
  env: Record<string, string | undefined> = process.env,
): string[] {
  const raw = env.ENGAGE_TOPIC_QUERIES?.trim();
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        const out = parsed
          .filter((q): q is string => typeof q === "string")
          .map((q) => q.trim())
          .filter(Boolean);
        if (out.length > 0) return out;
      }
    } catch {
      // fall through to defaults
    }
  }
  return [...DEFAULT_TOPIC_QUERIES];
}
