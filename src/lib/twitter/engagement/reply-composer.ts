// X engagement — our-voice reply composer.
//
// Streams an on-brand reply from Kimi (primary) → NanoGPT (fallback), reusing
// the project's mandatory LLM contract:
//   - stream:true is REQUIRED. The Kimi For Coding endpoint hangs silently on
//     non-stream requests for any non-trivial payload (CLAUDE.md anti-pattern).
//   - User-Agent MUST be on the allowlist (claude-cli / RooCode / Kilo-Code);
//     the OpenAI SDK's default UA gets access_terminated_error.
//   - NanoGPT is the fallback on quota/auth/5xx (subscription-free kimi-k2.6).
//
// A paranoid validator rejects anything off-brand (sycophancy, hashtag soup,
// >1 emoji, @mention farming, over-budget, link spam) — better to skip than
// post slop. `composeReply` returns { text } or null; it NEVER posts (the
// runner owns the dry/live decision).

import "server-only";

import type { EngagementCandidate } from "./types";

/** Hard reply length budget (chars). Deliberately tighter than X's 280. */
export const REPLY_MAX_CHARS = 240;

/**
 * The house voice — pasted VERBATIM from the research pass's approved system
 * prompt (2026-07 roster). Baked into the system message so the model ships
 * exactly the register we want: sharp senior dev, peer-to-peer, value-only,
 * SKIP-first.
 */
export const STYLE_GUIDE = `ROLE: You write short replies from @trendingrepo — a real-time scanner that spots breakout AI/dev GitHub repos, agents, LLMs and tools before mainstream. Reply AS a sharp senior dev, peer-to-peer. Not a marketer/fan/bot. Only reason to reply is to ADD VALUE.
VOICE: Terse, data-driven, calm confidence. Sound like an engineer who already knows. Peer-to-peer, never fan-to-celebrity. No deference, no hype.
EVERY GOOD REPLY DOES EXACTLY ONE, nothing else: (1) point to a specific relevant TRENDING REPO/tool the audience wants (name it exactly, only if truly related); (2) add a REAL DATA POINT from our scanner (star velocity, cross-source momentum, top-5 weekly growth, where buzz originated); (3) add ONE genuine technical INSIGHT that sharpens the post.
HARD RULES: ≤240 chars (120-200 sweet spot). ≤1 emoji, usually 0, never open with one. NO sycophancy (banned: "great post/love this/so true/amazing/this is huge/well said/100%/spot on"). NO hashtags ever. NO self-promo — never say "check out trendingrepo", never drop our link, let the value imply the brand; never paste a URL unless it's the repo being discussed. NEVER argue/dunk/correct-to-humiliate, never wade into hot-takes/drama/politics. NEVER invent a repo name, number, or trend. You may name a repo or cite a stat ONLY if it appears verbatim in the "Real trendingrepo data" block in the user message; if that block is absent or nothing in it genuinely fits the post, add ONE genuine insight with NO repo name and NO number, or reply SKIP. Inventing a repo or stat is the single worst failure. Don't echo the author back. One reply per post, don't reply to replies, don't thread.
REPLY when the post is a genuine AI/dev/tool/model/research post you can sharpen — with a fitting provided repo, a real data point, OR a sharp, SPECIFIC technical insight (no repo or number needed). Do NOT skip merely because no provided repo fits the post — pivot to the insight. SKIP ONLY WHEN: the post is opinion/hot-take/drama/politics/personal/pure-hype; you have nothing SPECIFIC + genuine to add (a vague/generic reply); it would read promotional/sycophantic/"well actually"; mega-thread stampede without a killer point; author is us or post >6h old. A generic reply is worse than skipping — but a sharp, specific insight is better than skipping.
SELF-CHECK (all true else SKIP): adds repo/real-number/real-insight not a compliment; a senior dev nods not cringes; ≤240 chars ≤1 emoji 0 hashtags 0 self-promo; not an argument/echo/hype.`;

/** Few-shot exemplars that anchor the bar (input post → ideal reply / SKIP). */
export const REPLY_EXEMPLARS = `Examples (input → reply):
@minchoi "just tried the new Cline agent, wild" → "Cline's on one of the steepest star-velocity curves in the agent-IDE space right now. if you like it, OpenHands and Roo are the two closest on the same trajectory worth a side-by-side."
@simonw "people sleeping on how good small local models got" → "the small-model wave shows in the data too — Qwen3 and the new Gemma variants are both top-5 by weekly star growth on local-LLM repos. the 4B-class quality jump is the real story."
@theo "hot take: AI coding tools make junior devs worse" → SKIP (opinion/drama, no repo/data to add, any reply reads as dunking).`;

/** Full system message = the verbatim style guide + the few-shot exemplars. */
const SYSTEM_PROMPT = `${STYLE_GUIDE}\n\n${REPLY_EXEMPLARS}`;

/** Chat seam — (system, user) → completion text or null. Injectable for tests. */
export type ChatFn = (system: string, user: string) => Promise<string | null>;

export interface ReplyContext {
  /** Optional grounding line (e.g. a live trending repo + stat) to offer as value. */
  dataPoint?: string;
  /** Per-account reply angle (from the target's replyAngle) — steers the model. */
  angle?: string;
  /**
   * Informational — the runner enforces dry vs live. `composeReply` never
   * posts regardless of this flag; it exists so callers can log the DRY path.
   */
  dryRun?: boolean;
  /** Inject a fake chat fn in tests. Defaults to the streaming Kimi→NanoGPT call. */
  chat?: ChatFn;
}

interface LlmProvider {
  name: string;
  base: string;
  model: string;
  key: string;
}

const KIMI_DEFAULT_BASE = "https://api.kimi.com/coding/v1";
const KIMI_DEFAULT_MODEL = "kimi-for-coding";
const NANOGPT_DEFAULT_BASE = "https://nano-gpt.com/api/v1";
const NANOGPT_DEFAULT_MODEL = "moonshotai/kimi-k2.6";
const LLM_TIMEOUT_MS = 12_000;

/** Kimi primary, NanoGPT fallback — only the configured ones, in that order. */
function resolveProviders(
  env: Record<string, string | undefined> = process.env,
): LlmProvider[] {
  const providers: LlmProvider[] = [];
  const kimi = env.KIMI_API_KEY?.trim();
  if (kimi) {
    providers.push({
      name: "kimi",
      base: (env.KIMI_BASE_URL || KIMI_DEFAULT_BASE).replace(/\/+$/, ""),
      model: env.KIMI_MODEL || KIMI_DEFAULT_MODEL,
      key: kimi,
    });
  }
  const nano = env.NANOGPT_API_KEY?.trim();
  if (nano) {
    providers.push({
      name: "nanogpt",
      base: (env.NANOGPT_BASE_URL || NANOGPT_DEFAULT_BASE).replace(/\/+$/, ""),
      model: env.NANOGPT_MODEL || NANOGPT_DEFAULT_MODEL,
      key: nano,
    });
  }
  return providers;
}

/**
 * One streaming chat completion. Parses the SSE `data:` lines and accumulates
 * `choices[0].delta.content`. Throws on non-2xx / missing body so the caller
 * falls through to the next provider.
 */
async function streamOnce(
  provider: LlmProvider,
  system: string,
  user: string,
  signal: AbortSignal,
): Promise<string> {
  const res = await fetch(`${provider.base}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${provider.key}`,
      // Allowlisted UA — the OpenAI SDK default gets access_terminated_error.
      "User-Agent": "claude-cli",
    },
    body: JSON.stringify({
      model: provider.model,
      temperature: 0.6,
      max_tokens: 220,
      // MANDATORY — the Kimi coding endpoint hangs silently without it.
      stream: true,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
    signal,
  });
  if (!res.ok) {
    throw new Error(`${provider.name} HTTP ${res.status}`);
  }
  if (!res.body) throw new Error(`${provider.name} returned no stream body`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const data = trimmed.slice("data:".length).trim();
      if (data === "[DONE]" || data.length === 0) continue;
      try {
        const json = JSON.parse(data) as {
          choices?: Array<{ delta?: { content?: string } }>;
        };
        const delta = json.choices?.[0]?.delta?.content;
        if (typeof delta === "string") text += delta;
      } catch {
        // Keep-alive / partial line — ignore.
      }
    }
  }
  return text;
}

/** Default chat: stream Kimi, fall back to NanoGPT on any failure. */
async function streamKimiThenNanogpt(
  system: string,
  user: string,
): Promise<string | null> {
  if (process.env.ENGAGE_LLM === "0") return null;
  const providers = resolveProviders();
  if (providers.length === 0) return null;

  for (const provider of providers) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);
    try {
      const text = await streamOnce(provider, system, user, controller.signal);
      if (text.trim().length > 0) return text;
      // Empty completion — try the next provider.
    } catch (err) {
      console.warn(
        `[x-engagement] ${provider.name} reply generation failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      // quota / auth / 5xx / timeout — fall through to the next provider.
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

/** Strip code fences / wrapping quotes the model likes to add. */
function stripWrapping(raw: string): string {
  let s = raw.trim();
  s = s.replace(/^```[a-z]*\n?/i, "").replace(/\n?```$/, "").trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1).trim();
  }
  return s;
}

// Banned sycophancy phrases from the style guide — matched anywhere, not just
// at the opener ("great post/love this/so true/amazing/this is huge/well
// said/100%/spot on"), plus the obvious neighbours.
const SYCOPHANTIC_RE =
  /(^|\W)(great post|love this|love it|so true|amazing|this is huge|well said|spot on|couldn'?t agree|100%|incredible)\b/i;

/**
 * Validate a candidate reply against the house rules. Returns null when valid,
 * else a short reason. Exported for unit tests.
 */
export function validateReply(text: string): string | null {
  const t = text.trim();
  if (t.length === 0) return "empty";
  // The model is told to reply exactly "SKIP", but it often adds its reasoning
  // ("SKIP No relevant repo …"). Reject anything STARTING with skip so that
  // reasoning never posts. `\b` keeps a genuine reply like "skipping X" valid.
  if (/^skip\b/i.test(t)) return "model-skipped";
  if (t.length > REPLY_MAX_CHARS) return `over-budget (${t.length}>${REPLY_MAX_CHARS})`;

  // Never open with an emoji.
  if (/^\p{Extended_Pictographic}/u.test(t)) return "emoji-open";
  const emoji = t.match(/\p{Extended_Pictographic}/gu) ?? [];
  if (emoji.length > 1) return `too-many-emoji (${emoji.length})`;

  // No hashtags ever.
  const hashtags = t.match(/#\w+/g) ?? [];
  if (hashtags.length > 0) return `hashtags (${hashtags.length})`;

  // A real X @mention starts a token (start-of-string or after whitespace).
  // This intentionally allows in-word "@" in technical terms like "recall@k".
  if (/(?:^|\s)@\w/.test(t)) return "mention";

  // At most one link, and only the repo being discussed (guide) — reject spam.
  const links = t.match(/https?:\/\/\S+/g) ?? [];
  if (links.length > 1) return `link-spam (${links.length})`;

  if (SYCOPHANTIC_RE.test(t)) return "sycophantic";

  return null;
}

function buildUserPrompt(post: EngagementCandidate, ctx: ReplyContext): string {
  const parts = [
    `Post by @${post.authorHandle || "unknown"}:`,
    `"""${post.text.trim()}"""`,
  ];
  if (ctx.angle && ctx.angle.trim()) {
    parts.push("", `Reply angle for this account: ${ctx.angle.trim()}`);
  }
  if (ctx.dataPoint && ctx.dataPoint.trim()) {
    parts.push(
      "",
      "Real trendingrepo data — these are the ONLY repos and stats you may cite (do not invent others; use one only if it genuinely fits the post). If none fits, do NOT skip for that reason — reply with a sharp, specific technical insight instead:",
      ctx.dataPoint.trim(),
    );
  } else {
    parts.push(
      "",
      "No trendingrepo data is available for this post. Do NOT name a specific repo or cite any number — add a genuine technical insight with none, or reply SKIP.",
    );
  }
  parts.push("", "Write the reply now (or reply exactly SKIP if you have nothing genuinely useful to add).");
  return parts.join("\n");
}

/**
 * Compose an on-brand reply to `post`. Returns `{ text }` or null when the
 * model can't produce something on-brand (empty, SKIP, or validation reject).
 * NEVER posts — the runner decides dry vs live.
 */
export async function composeReply(
  post: EngagementCandidate,
  ctx: ReplyContext = {},
): Promise<{ text: string } | null> {
  const chat = ctx.chat ?? streamKimiThenNanogpt;
  const raw = await chat(SYSTEM_PROMPT, buildUserPrompt(post, ctx));
  if (!raw) return null;
  const cleaned = stripWrapping(raw);
  if (validateReply(cleaned) !== null) return null;
  return { text: cleaned };
}
