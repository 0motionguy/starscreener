// POST /api/navigator
//
// The LLM tier of the Ask command bar. When the client's deterministic matcher
// (src/lib/nav-commands.ts) can't map a phrase to a page, it falls through to
// here: a small model turns free text into ONE navigation action against the
// same route registry. "get me that claude repo", "where do people discuss
// funding" -> {action:{kind:'navigate', href}}.
//
// The model NEVER emits free-form HTML/JS and NEVER chooses an external URL:
// the returned href is hard-validated to an internal path before it reaches
// the client, so a prompt-injected "navigate to https://evil" can't become an
// open redirect. If no LLM key is configured, returns ok:false/NOT_CONFIGURED
// and the client keeps its deterministic-only behaviour.
//
// Provider-flexible + OpenAI-compatible: NanoGPT -> OpenRouter -> Kimi, first
// key wins. (Kimi's coding endpoint enforces stream:true + a UA allowlist per
// CLAUDE.md; we prefer the standard providers and send the allowlisted UA.)

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorEnvelope, serverError } from "@/lib/api/error-response";
import { parseBody } from "@/lib/api/parse-body";
import { checkRateLimitAsync } from "@/lib/api/rate-limit";
import { NAV_COMMANDS } from "@/lib/nav-commands";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

// Interactive surface: generous but capped so a stuck client (or abuse) can't
// run up LLM cost. 20 misses/min per IP is far above real typing cadence.
const RATE = { windowMs: 60 * 1_000, maxRequests: 20 } as const;

const Schema = z.object({ q: z.string().min(1).max(240) });

interface NavAction {
  kind: "navigate" | "none";
  href?: string;
}
interface NavOk {
  ok: true;
  reply: string;
  /** A conversational answer when the user asked a question (not just navigated). */
  answer?: string;
  action: NavAction;
}

/** Resolve the first configured OpenAI-compatible provider. */
function resolveProvider(): { base: string; model: string; key: string } | null {
  const nano = process.env.NANOGPT_API_KEY?.trim();
  if (nano) {
    return {
      base: (process.env.NANOGPT_BASE_URL || "https://nano-gpt.com/api/v1").replace(/\/+$/, ""),
      model: process.env.NANOGPT_MODEL || "kimi-k2.6",
      key: nano,
    };
  }
  const or = process.env.OPENROUTER_API_KEY?.trim();
  if (or) {
    return {
      base: "https://openrouter.ai/api/v1",
      model: process.env.NAVIGATOR_MODEL || "moonshotai/kimi-k2",
      key: or,
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

/**
 * Only allow same-origin, internal paths. Rejects protocol-relative (`//host`),
 * absolute URLs, and anything with a scheme. This is the open-redirect guard.
 */
function safeInternalHref(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const href = raw.trim();
  if (!href.startsWith("/")) return null;
  if (href.startsWith("//")) return null;
  if (/[\s]/.test(href)) return null;
  if (!/^\/[A-Za-z0-9\-._~/?#=&%]*$/.test(href)) return null;
  return href.slice(0, 256);
}

function buildSystemPrompt(): string {
  const pages = NAV_COMMANDS.map((c) => `- ${c.label} (${c.group}): ${c.href}`).join("\n");
  return [
    "You are the trendingrepo assistant — a friendly, sharp guide to a dashboard that tracks trending open-source repos, AI models, funding, and agent commerce (x402).",
    "You do TWO things: ANSWER the user's question, and/or NAVIGATE them to a page. Reply with STRICT JSON, no prose, no code fence:",
    '{"reply":"<=8 word status", "answer":"<=3 sentence helpful answer, omit if pure navigation", "action":{"kind":"navigate","href":"/path"}}',
    'Use {"action":{"kind":"none"}} when no page fits. Always include a warm, specific `answer` when the user asks a question rather than just naming a destination.',
    "",
    "Rules:",
    "- href MUST be an internal path starting with /. Never an external URL.",
    "- To open a specific GitHub repo the user names, use /repo/{owner}/{name}.",
    "- Be concrete and useful; no marketing fluff. If you don't know a live number, say what page shows it and navigate there.",
    "- Pages you can navigate to:",
    pages,
  ].join("\n");
}

function extractJson(text: string): {
  reply?: unknown;
  answer?: unknown;
  action?: { kind?: unknown; href?: unknown };
} | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

export async function POST(
  request: NextRequest,
): Promise<NextResponse<NavOk | { ok: false; error: string; code?: string }>> {
  const rate = await checkRateLimitAsync(request, RATE);
  if (!rate.allowed) {
    return NextResponse.json(
      { ok: false, error: "Too many requests", code: "RATE_LIMITED" },
      { status: 429, headers: { ...NO_STORE, "Retry-After": String(Math.ceil(rate.retryAfterMs / 1000)) } },
    );
  }

  const parsed = await parseBody(request, Schema, { publicMessage: "invalid request", includeDetails: false });
  if (!parsed.ok) {
    return NextResponse.json(errorEnvelope("invalid request", "BAD_REQUEST"), {
      status: 400,
      headers: NO_STORE,
    });
  }

  const provider = resolveProvider();
  if (!provider) {
    // No LLM configured — client keeps deterministic-only behaviour.
    return NextResponse.json(
      { ok: false, error: "navigator LLM not configured", code: "NOT_CONFIGURED" },
      { status: 200, headers: NO_STORE },
    );
  }

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
        temperature: 0.1,
        max_tokens: 200,
        messages: [
          { role: "system", content: buildSystemPrompt() },
          { role: "user", content: parsed.data.q },
        ],
      }),
      signal: AbortSignal.timeout(9_000),
    });

    if (!res.ok) {
      return NextResponse.json(
        { ok: false, error: "router upstream error", code: "UPSTREAM" },
        { status: 200, headers: NO_STORE },
      );
    }

    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = data.choices?.[0]?.message?.content ?? "";
    const obj = extractJson(content);
    const reply = typeof obj?.reply === "string" ? obj.reply.slice(0, 80) : "On it.";
    const answer = typeof obj?.answer === "string" && obj.answer.trim() ? obj.answer.trim().slice(0, 600) : undefined;
    const href = obj?.action?.kind === "navigate" ? safeInternalHref(obj.action.href) : null;

    const action: NavAction = href ? { kind: "navigate", href } : { kind: "none" };
    return NextResponse.json(
      { ok: true, reply, ...(answer ? { answer } : {}), action } satisfies NavOk,
      { headers: NO_STORE },
    );
  } catch (err) {
    return serverError<NavOk | { ok: false; error: string; code?: string }>(err, {
      scope: "[api:navigator]",
      publicMessage: "router failed",
    });
  }
}
