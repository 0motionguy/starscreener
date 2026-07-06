// LLM copywriter (CE-5) — optional polish pass over the deterministic tweet
// copy. NanoGPT first (free-tier models), Kimi as fallback; 8s budget; and a
// paranoid validator: the model may sharpen the HOOK, never the facts. Any
// rule violation (lost number, renamed repo, emoji, hashtag, URL, busted
// budget, mutated pack line) discards the LLM output and the deterministic
// draft ships unchanged — the cron never blocks on a flaky provider.
//
// Env: NANOGPT_API_KEY / NANOGPT_BASE_URL / NANOGPT_MODEL,
//      KIMI_API_KEY / KIMI_BASE_URL / KIMI_MODEL,
//      X_COPYWRITER=0 disables without removing keys.

import "server-only";

interface CopyProvider {
  base: string;
  model: string;
  key: string;
}

/** First configured OpenAI-compatible provider (mirrors navigator's chain). */
function resolveCopyProvider(): CopyProvider | null {
  const nano = process.env.NANOGPT_API_KEY?.trim();
  if (nano) {
    return {
      base: (process.env.NANOGPT_BASE_URL || "https://nano-gpt.com/api/v1").replace(/\/+$/, ""),
      model: process.env.NANOGPT_MODEL || "kimi-k2.6",
      key: nano,
    };
  }
  const kimi = process.env.KIMI_API_KEY?.trim();
  if (kimi) {
    return {
      base: (process.env.KIMI_BASE_URL || "https://api.kimi.com/v1").replace(/\/+$/, ""),
      model: process.env.KIMI_MODEL || "kimi-k2",
      key: kimi,
    };
  }
  return null;
}

export interface PolishRequest {
  draft: string;
  /** Tokens that must survive verbatim (repo fullNames). */
  mustInclude: string[];
  /** Lines that must survive verbatim (pack "N. owner/name" lines). */
  frozenLines: string[];
  /** Max output length in chars (text budget — URL travels separately). */
  budget: number;
}

/** Digit-bearing tokens of the draft — every one must survive the rewrite. */
export function extractNumericClaims(text: string): string[] {
  return (text.match(/\d[\d,.]*%?/g) ?? []).map((m) => m.replace(/[.,]+$/, ""));
}

/**
 * Validate an LLM rewrite against the draft's facts. Exported for tests.
 * Returns null when valid, else a short reason.
 */
export function validatePolished(req: PolishRequest, polished: string): string | null {
  const p = polished.trim();
  if (p.length === 0) return "empty";
  if (p.length > req.budget) return `over-budget (${p.length}>${req.budget})`;
  if (!/^[\x20-\x7E\n]*$/.test(p)) return "non-ascii";
  if (/[#@]\w/.test(p)) return "hashtag-or-mention";
  if (/https?:\/\/|t\.co\//i.test(p)) return "url-in-text";
  if (p.split("\n").length > req.draft.split("\n").length) return "line-count-grew";
  for (const line of req.frozenLines) {
    if (!p.includes(line)) return `mutated-line (${line})`;
  }
  for (const token of req.mustInclude) {
    if (!p.includes(token)) return `lost-token (${token})`;
  }
  for (const num of extractNumericClaims(req.draft)) {
    if (!p.includes(num)) return `lost-number (${num})`;
  }
  return null;
}

/** Strip code fences / wrapping quotes an LLM likes to add. */
function stripWrapping(raw: string): string {
  let s = raw.trim();
  s = s.replace(/^```[a-z]*\n?/i, "").replace(/\n?```$/, "").trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1).trim();
  }
  return s;
}

const TIMEOUT_MS = 8_000;

/**
 * Ask the configured provider for a punchier version of the draft. Returns
 * the validated rewrite, or null (deterministic copy ships) on ANY failure:
 * no key, X_COPYWRITER=0, timeout, HTTP error, or validation rejection.
 */
export async function polishTweet(req: PolishRequest): Promise<string | null> {
  if (process.env.X_COPYWRITER === "0") return null;
  const provider = resolveCopyProvider();
  if (!provider) return null;

  const system = [
    "You punch up tweets for a GitHub trending bot.",
    "Rewrite the draft to be sharper and more curiosity-driving WITHOUT changing facts.",
    "Hard rules:",
    "- ASCII only. No emojis, no hashtags, no @mentions, no links.",
    "- Keep every repo name (owner/name) and every number EXACTLY as written.",
    "- Numbered list lines must be copied verbatim.",
    `- Max ${req.budget} characters. Same number of lines or fewer.`,
    "Return ONLY the rewritten tweet text, nothing else.",
  ].join("\n");

  try {
    const res = await fetch(`${provider.base}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${provider.key}`,
        // Kimi endpoints enforce a UA allowlist; harmless elsewhere.
        "User-Agent": "claude-cli",
      },
      body: JSON.stringify({
        model: provider.model,
        temperature: 0.7,
        max_tokens: 300,
        messages: [
          { role: "system", content: system },
          { role: "user", content: req.draft },
        ],
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw = data.choices?.[0]?.message?.content;
    if (!raw) return null;
    const polished = stripWrapping(raw);
    return validatePolished(req, polished) === null ? polished : null;
  } catch {
    return null;
  }
}
