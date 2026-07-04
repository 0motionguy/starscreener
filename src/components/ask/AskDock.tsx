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
import { X, Radio } from "@/lib/icons";
import { matchNavCommands } from "@/lib/nav-commands";
import "./ask-dock.css";

const POS_KEY = "ask-hud-pos";

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

export function AskDock() {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [input, setInput] = useState("");
  const [focused, setFocused] = useState(false);
  const [listening, setListening] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);
  const [statusLeaving, setStatusLeaving] = useState(false);
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
    if (expanded) inputRef.current?.focus();
  }, [expanded]);

  const flashStatus = useCallback((s: Status) => {
    if (statusTimer.current) clearTimeout(statusTimer.current);
    setStatusLeaving(false);
    setStatus(s);
    statusTimer.current = setTimeout(() => {
      setStatusLeaving(true);
      statusTimer.current = setTimeout(() => setStatus(null), 280);
    }, 1500);
  }, []);

  const resolve = useCallback(
    (raw: string) => {
      const text = raw.trim();
      if (!text) return;
      track("ask_submit", { len: text.length });
      const matches = matchNavCommands(text, 1);
      if (matches.length > 0) {
        const top = matches[0]!;
        flashStatus({
          lead: top.group === "View" ? "Showing" : "Opening",
          em: top.label,
          arrow: true,
        });
        setInput("");
        track("ask_navigate", { id: top.id });
        window.setTimeout(() => router.push(top.href), 460);
        return;
      }
      flashStatus({ lead: "No match. Try funding, agents, compare, revenue.", arrow: false });
    },
    [router, flashStatus],
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
    if (!d.moved && Math.hypot(dx, dy) > 3) d.moved = true;
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
      {status && (
        <div className={`ask-status${statusLeaving ? " leaving" : ""}`} role="status">
          {status.arrow && <span className="ask-status-arrow" aria-hidden="true">→</span>}
          <span>
            {status.lead}
            {status.em && <span className="ask-status-em"> {status.em}</span>}
          </span>
        </div>
      )}

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
        <form
          className={`ask-glass ask-bar${focused ? " focused" : ""}`}
          onSubmit={(e) => {
            e.preventDefault();
            resolve(input);
          }}
        >
          <span
            className="ask-grip"
            onPointerDown={onDragStart}
            onPointerMove={onDragMove}
            onPointerUp={(e) => onDragEnd(e, false)}
            aria-hidden="true"
            title="Drag to move"
          >
            ⠿
          </span>
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
              <Radio size={14} strokeWidth={2} aria-hidden="true" />
            </button>
          )}
          <button
            type="button"
            className="ask-btn"
            onClick={() => setExpanded(false)}
            aria-label="Collapse"
          >
            <X size={14} strokeWidth={2} aria-hidden="true" />
          </button>
        </form>
      )}
    </div>
  );
}
