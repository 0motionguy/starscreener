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
 * The house voice. Baked into the system prompt so the model knows exactly the
 * register we ship: terse, data-driven, genuinely additive, never a bot.
 */
export const STYLE_GUIDE = [
  "You are the voice of @trendingrepo — an account that tracks trending",
  "open-source and AI developer tools before they go mainstream.",
  "",
  "Write ONE short reply to the post below. Rules, all mandatory:",
  "- Terse: at most 240 characters. Sound like a sharp senior developer, never a bot.",
  "- Add ONE genuinely useful, specific point: a relevant repo, a real number/benchmark,",
  "  or a concrete technical insight. If you have nothing real to add, reply with exactly: SKIP",
  "- Data-driven, never sycophantic. Banned openers: 'Great', 'Love this', 'Amazing', 'So true'.",
  "- No hashtag soup (0-1 hashtags, usually 0). At most ONE emoji, usually none.",
  "- No @mentions. Do not tag accounts. At most one link, only if it genuinely helps.",
  "- Never fabricate stats, repos, or benchmarks. If unsure, stay qualitative or reply SKIP.",
  "Return ONLY the reply text — no preamble, no quotes, no explanation.",
].join("\n");

/** Chat seam — (system, user) → completion text or null. Injectable for tests. */
export type ChatFn = (system: string, user: string) => Promise<string | null>;

export interface ReplyContext {
  /** Optional grounding line (e.g. a live trending repo + stat) to offer as value. */
  dataPoint?: string;
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

const SYCOPHANTIC_OPENER_RE =
  /^\s*(great|love this|love it|amazing|so true|nice|awesome|incredible|well said|couldn'?t agree|this is (great|amazing|awesome)|100%|facts)\b/i;

/**
 * Validate a candidate reply against the house rules. Returns null when valid,
 * else a short reason. Exported for unit tests.
 */
export function validateReply(text: string): string | null {
  const t = text.trim();
  if (t.length === 0) return "empty";
  if (/^skip$/i.test(t)) return "model-skipped";
  if (t.length > REPLY_MAX_CHARS) return `over-budget (${t.length}>${REPLY_MAX_CHARS})`;

  const emoji = t.match(/\p{Extended_Pictographic}/gu) ?? [];
  if (emoji.length > 1) return `too-many-emoji (${emoji.length})`;

  const hashtags = t.match(/#\w+/g) ?? [];
  if (hashtags.length > 1) return `hashtag-soup (${hashtags.length})`;

  if (/@\w/.test(t)) return "mention";

  const links = t.match(/https?:\/\/\S+/g) ?? [];
  if (links.length > 1) return `link-spam (${links.length})`;

  if (SYCOPHANTIC_OPENER_RE.test(t)) return "sycophantic";

  return null;
}

function buildUserPrompt(post: EngagementCandidate, dataPoint?: string): string {
  const parts = [
    `Post by @${post.authorHandle || "unknown"}:`,
    `"""${post.text.trim()}"""`,
  ];
  if (dataPoint && dataPoint.trim()) {
    parts.push("", `Relevant trendingrepo data you may cite if it fits: ${dataPoint.trim()}`);
  }
  parts.push("", "Write the reply now (or SKIP if you have nothing genuinely useful to add).");
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
  const raw = await chat(STYLE_GUIDE, buildUserPrompt(post, ctx.dataPoint));
  if (!raw) return null;
  const cleaned = stripWrapping(raw);
  if (validateReply(cleaned) !== null) return null;
  return { text: cleaned };
}
