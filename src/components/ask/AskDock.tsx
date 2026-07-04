"use client";

// Ask HUD — a draggable liquid-glass command bar. You type or speak; the agent
// navigates. No chat transcript: the "conversation" is the navigation itself,
// with a single ephemeral status line. Collapsed = a small frosted node you can
// drag anywhere; click it to unfurl the bar. Position persists across sessions.
//
// Deterministic navigation today (instant, no LLM). The multi-step LLM tier
// (POST /api/navigator, worker Kimi/NanoGPT key) plugs into resolve() next.
//
// Voice: Web Speech API, feature-detected — mic renders only where supported.

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Radio, ArrowRight } from "@/lib/icons";
import { matchNavCommands } from "@/lib/nav-commands";
import "./ask-dock.css";

const POS_KEY = "ask-hud-pos";

const GREETING =
  "Hey. Tell me what you're looking for and I'll take you right there. A repo, funding, trending agents, or just ask.";
const HELP =
  "I can jump you anywhere (try 'funding' or 'agents'), open any repo by name, and answer questions about trending repos, AI models, funding, and agent commerce. Talk to me in plain English.";
const CHITCHAT =
  "Doing great, thanks. Tell me what you're after and I'll take you there: a repo, funding, trending agents, or ask me what's hot.";
const THANKS = "Anytime. Where to next?";
const MISS =
  "I couldn't map that to a page yet, but I can take you anywhere: try 'funding', 'agents', a repo name, or ask me what's trending.";

interface Pos {
  left: number;
  top: number;
}
interface Status {
  lead: string;
  em?: string;
  arrow: boolean;
}

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
};

function getSpeechRecognition(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function track(event: string, props?: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  (window as unknown as { posthog?: { capture?: (e: string, p?: unknown) => void } })
    .posthog?.capture?.(event, props);
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/**
 * Types `text` out char-by-char with a blinking caret so the user sees the
 * agent "typing". Instant under prefers-reduced-motion. Restarts when `text`
 * changes (so the next message types itself out).
 */
function Typewriter({ text }: { text: string }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    ) {
      setN(text.length);
      return;
    }
    setN(0);
    if (!text) return;
    let i = 0;
    const step = text.length > 90 ? 10 : 15; // faster for longer messages
    const id = window.setInterval(() => {
      i += 1;
      setN(i);
      if (i >= text.length) window.clearInterval(id);
    }, step);
    return () => window.clearInterval(id);
  }, [text]);
  const done = n >= text.length;
  return (
    <>
      {text.slice(0, n)}
      {!done && (
        <span className="ask-type-caret" aria-hidden="true">
          ▋
        </span>
      )}
    </>
  );
}

export function AskDock() {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [input, setInput] = useState("");
  const [focused, setFocused] = useState(false);
  const [listening, setListening] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);
  const [dragging, setDragging] = useState(false);
  const [answer, setAnswer] = useState<{ text: string; href?: string } | null>(null);
  const [pos, setPos] = useState<Pos | null>(null);
  const [voiceOk, setVoiceOk] = useState(false);

  const hudRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const statusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const drag = useRef<{
    active: boolean;
    moved: boolean;
    startX: number;
    startY: number;
    baseLeft: number;
    baseTop: number;
    w: number;
    h: number;
  } | null>(null);

  useEffect(() => {
    setVoiceOk(getSpeechRecognition() !== null);
    try {
      const raw = localStorage.getItem(POS_KEY);
      if (raw) setPos(JSON.parse(raw) as Pos);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (expanded) {
      inputRef.current?.focus();
      // Welcome the user on open — the agent talks first.
      setAnswer((a) => a ?? { text: GREETING });
    }
  }, [expanded]);

  const flashStatus = useCallback((s: Status, sticky = false) => {
    if (statusTimer.current) clearTimeout(statusTimer.current);
    setStatus(s);
    if (sticky) return;
    statusTimer.current = setTimeout(() => setStatus(null), 1800);
  }, []);

  const go = useCallback(
    (href: string, lead: string, em: string | undefined, arrow: boolean, tier: string) => {
      flashStatus({ lead, em, arrow });
      track("ask_navigate", { tier });
      window.setTimeout(() => router.push(href), 460);
    },
    [router, flashStatus],
  );

  const resolve = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text) return;
      track("ask_submit", { len: text.length });

      // Tier 1 — deterministic navigation, instant.
      const matches = matchNavCommands(text, 1);
      if (matches.length > 0) {
        const top = matches[0]!;
        setInput("");
        setAnswer(null);
        go(top.href, top.group === "View" ? "Showing" : "Opening", top.label, true, "deterministic");
        return;
      }

      // Conversational shortcuts — warm replies that work with no LLM key.
      if (/^(hi|hey|hello|yo|sup|how are you|how'?s it going|what'?s up|whats up|good (morning|afternoon|evening))\b/i.test(text)) {
        setInput("");
        setAnswer({ text: CHITCHAT });
        return;
      }
      if (/^(help|what can you|who are you|what is this|what do you do)\b/i.test(text)) {
        setInput("");
        setAnswer({ text: HELP });
        return;
      }
      if (/^(thanks|thank you|thx|ty|cheers|nice|cool|great)\b/i.test(text)) {
        setInput("");
        setAnswer({ text: THANKS });
        return;
      }

      // Tier 2 — LLM assistant (/api/navigator): answers and/or navigates.
      // Any miss (or no key configured) lands as a PERSISTENT typed answer —
      // never a status that vanishes, so the user always gets a response.
      setInput("");
      setAnswer(null);
      flashStatus({ lead: "Thinking…", arrow: false }, true);
      try {
        const res = await fetch("/api/navigator", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ q: text }),
          // Never let "Thinking…" stick forever if the route hangs.
          signal: AbortSignal.timeout(12_000),
        });
        const data = (await res.json()) as {
          ok?: boolean;
          reply?: string;
          answer?: string;
          action?: { kind?: string; href?: string };
        };
        if (data?.ok) {
          const href =
            data.action?.kind === "navigate" && typeof data.action.href === "string"
              ? data.action.href
              : undefined;
          if (data.answer) {
            setStatus(null);
            setAnswer({ text: data.answer, href });
            return;
          }
          if (href) {
            go(href, data.reply || "Opening", undefined, true, "llm");
            return;
          }
        }
        setStatus(null);
        setAnswer({ text: data?.answer || data?.reply || MISS });
      } catch {
        setStatus(null);
        setAnswer({ text: MISS });
      }
    },
    [flashStatus, go],
  );

  // --- drag (pointer events on the grip / node) ----------------------------
  const onDragStart = useCallback((e: React.PointerEvent) => {
    const el = hudRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    drag.current = {
      active: true,
      moved: false,
      startX: e.clientX,
      startY: e.clientY,
      baseLeft: rect.left,
      baseTop: rect.top,
      w: rect.width,
      h: rect.height,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const onDragMove = useCallback((e: React.PointerEvent) => {
    const d = drag.current;
    if (!d?.active) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.moved && Math.hypot(dx, dy) > 3) {
      d.moved = true;
      setDragging(true);
    }
    if (!d.moved) return;
    setPos({
      left: clamp(d.baseLeft + dx, 6, window.innerWidth - d.w - 6),
      top: clamp(d.baseTop + dy, 6, window.innerHeight - d.h - 6),
    });
  }, []);

  const onDragEnd = useCallback(
    (e: React.PointerEvent, wasCollapsed: boolean) => {
      const d = drag.current;
      drag.current = null;
      setDragging(false);
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      if (!d) return;
      if (d.moved) {
        setPos((p) => {
          if (p) {
            try {
              localStorage.setItem(POS_KEY, JSON.stringify(p));
            } catch {
              /* ignore */
            }
          }
          return p;
        });
      } else if (wasCollapsed) {
        // A click, not a drag: unfurl.
        setExpanded(true);
      }
    },
    [],
  );

  const toggleVoice = useCallback(() => {
    const Rec = getSpeechRecognition();
    if (!Rec) return;
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const rec = new Rec();
    recognitionRef.current = rec;
    rec.lang = "en-US";
    rec.interimResults = false;
    rec.continuous = false;
    rec.onresult = (ev) => {
      const t = ev.results?.[0]?.[0]?.transcript ?? "";
      if (t) resolve(t);
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    setListening(true);
    rec.start();
  }, [listening, resolve]);

  const style: React.CSSProperties = pos
    ? { left: pos.left, top: pos.top, right: "auto", bottom: "auto" }
    : {};

  return (
    <div ref={hudRef} className="ask-hud" style={style}>
      {!expanded ? (
        <button
          type="button"
          className="ask-glass ask-node"
          onPointerDown={onDragStart}
          onPointerMove={onDragMove}
          onPointerUp={(e) => onDragEnd(e, true)}
          aria-label="Open command bar"
          title="Ask — drag to move, click to open"
        >
          <span className="ask-mark" aria-hidden="true">▸</span>
        </button>
      ) : (
        <div
          className={`ask-glass ask-box${focused ? " focused" : ""}${dragging ? " dragging" : ""}${
            answer || status ? " has-body" : ""
          }`}
          onPointerDown={(e) => {
            // The whole box is the drag surface — except the input, buttons, and
            // links, so typing, clicks, and the "open" link still work.
            if ((e.target as HTMLElement).closest("input, button, a")) return;
            onDragStart(e);
          }}
          onPointerMove={onDragMove}
          onPointerUp={(e) => onDragEnd(e, false)}
        >
          <form
            className="ask-row"
            onSubmit={(e) => {
              e.preventDefault();
              resolve(input);
            }}
          >
            <span className="ask-caret" aria-hidden="true">▸</span>
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setExpanded(false);
              }}
              placeholder={listening ? "Listening…" : "Ask to go anywhere…"}
              aria-label="Ask trendingrepo"
              autoComplete="off"
              spellCheck={false}
            />
            {voiceOk && (
              <button
                type="button"
                className={`ask-btn${listening ? " listening" : ""}`}
                onClick={toggleVoice}
                aria-label={listening ? "Stop listening" : "Speak"}
              >
                <Radio size={15} strokeWidth={2} aria-hidden="true" />
              </button>
            )}
            <button type="submit" className="ask-btn ask-send" aria-label="Send">
              <ArrowRight size={16} strokeWidth={2.2} aria-hidden="true" />
            </button>
          </form>

          {/* Conversation opens downward INSIDE the box (capped ~5 rows). */}
          {(answer || status) && (
            <div className="ask-body">
              {answer ? (
                <div className="ask-msg">
                  <span className="ask-dot" aria-hidden="true" />
                  <div className="ask-text">
                    <Typewriter text={answer.text} />
                    {answer.href && (
                      <div>
                        <a className="ask-act" href={answer.href}>
                          → open
                        </a>
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    className="ask-x"
                    onClick={() => setAnswer(null)}
                    aria-label="Dismiss"
                  >
                    ×
                  </button>
                </div>
              ) : status ? (
                <div className="ask-status-line" role="status">
                  {status.arrow && (
                    <span className="ask-arrow" aria-hidden="true">
                      →{" "}
                    </span>
                  )}
                  {status.lead}
                  {status.em && <b> {status.em}</b>}
                </div>
              ) : null}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
