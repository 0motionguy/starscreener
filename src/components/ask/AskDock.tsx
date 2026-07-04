"use client";

// Ask dock — the conversational agent surface. A persistent, docked assistant
// you talk or type to; it replies and *executes* (navigates / filters) against
// the same nav-command registry the ⌘K search uses. Deterministic tier today
// (instant, no LLM); an LLM fall-through for multi-step requests is wired via
// POST /api/navigator (backed by the worker's Kimi/NanoGPT key) as a follow-up.
//
// Voice: Web Speech API, feature-detected — the mic only renders where the
// browser supports it (Chrome/Edge desktop). Graceful text-only elsewhere.

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { X, Radio, ArrowRight, ArrowUpRight } from "@/lib/icons";
import { matchNavCommands } from "@/lib/nav-commands";
import "./ask-dock.css";

interface Msg {
  role: "user" | "agent";
  text: string;
  action?: { label: string; href: string };
}

const GREETING: Msg = {
  role: "agent",
  text: "Ask me to take you anywhere. Try “show me AI agents”, “funding”, or “compare repos”.",
};

const QUICK = ["Breakouts", "AI agents", "Funding", "Compare"];

// Minimal Web Speech typing (the lib DOM types don't ship it cross-browser).
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

export function AskDock() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([GREETING]);
  const [input, setInput] = useState("");
  const [listening, setListening] = useState(false);
  const streamRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const [voiceOk, setVoiceOk] = useState(false);

  useEffect(() => {
    setVoiceOk(getSpeechRecognition() !== null);
  }, []);

  // Autoscroll + focus on open / new message.
  useEffect(() => {
    if (!open) return;
    streamRef.current?.scrollTo({ top: streamRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, open]);
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const resolve = useCallback(
    (raw: string) => {
      const text = raw.trim();
      if (!text) return;
      track("ask_submit", { len: text.length });
      setMessages((m) => [...m, { role: "user", text }]);
      setInput("");

      const matches = matchNavCommands(text, 1);
      if (matches.length > 0) {
        const top = matches[0]!;
        const isView = top.group === "View";
        setMessages((m) => [
          ...m,
          {
            role: "agent",
            text: isView
              ? `Here are the ${top.label} — pulling them up.`
              : `Taking you to ${top.label}.`,
            action: { label: top.label, href: top.href },
          },
        ]);
        track("ask_navigate", { id: top.id });
        // The agent *does* it: navigate. The dock is mounted in the layout,
        // so it stays open across the client-side route change.
        window.setTimeout(() => router.push(top.href), 550);
        return;
      }

      setMessages((m) => [
        ...m,
        {
          role: "agent",
          text: "I couldn't map that to a page yet. I can jump you to Trending, Breakouts, Funding, Revenue, Watchlist, Compare, Categories, and more — or name a repo to open it.",
        },
      ]);
    },
    [router],
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
    rec.onresult = (e) => {
      const transcript = e.results?.[0]?.[0]?.transcript ?? "";
      if (transcript) resolve(transcript);
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    setListening(true);
    rec.start();
  }, [listening, resolve]);

  if (!open) {
    return (
      <button
        type="button"
        className="ask-launcher"
        onClick={() => {
          setOpen(true);
          track("ask_open");
        }}
        aria-label="Ask trendingrepo"
      >
        <span className="ask-spark" aria-hidden="true">▸</span>
        Ask
        <span className="ask-kbd" aria-hidden="true">AI</span>
      </button>
    );
  }

  return (
    <div className="ask-panel" role="dialog" aria-label="Ask trendingrepo">
      <div className="ask-head">
        <span className="ask-dot" aria-hidden="true" />
        <span className="ask-title">
          ask<b>trendingrepo</b>
        </span>
        <button type="button" className="ask-close" onClick={() => setOpen(false)} aria-label="Close">
          <X size={14} strokeWidth={2} aria-hidden="true" />
        </button>
      </div>

      <div className="ask-stream" ref={streamRef}>
        {messages.map((msg, i) => (
          <div key={i} className={`ask-msg ${msg.role}`}>
            <div className="ask-bubble">{msg.text}</div>
            {msg.action && (
              <a className="ask-action" href={msg.action.href}>
                <ArrowUpRight size={11} strokeWidth={2.2} aria-hidden="true" />
                Open {msg.action.label}
              </a>
            )}
          </div>
        ))}
      </div>

      {messages.length <= 1 && (
        <div className="ask-hint">
          {QUICK.map((q) => (
            <button key={q} type="button" onClick={() => resolve(q)}>
              {q}
            </button>
          ))}
        </div>
      )}

      <form
        className="ask-input-row"
        onSubmit={(e) => {
          e.preventDefault();
          resolve(input);
        }}
      >
        <span className="ask-prompt" aria-hidden="true">▸</span>
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={listening ? "Listening…" : "Ask to go anywhere…"}
          aria-label="Ask trendingrepo"
          autoComplete="off"
        />
        {voiceOk && (
          <button
            type="button"
            className={`ask-mic${listening ? " listening" : ""}`}
            onClick={toggleVoice}
            aria-label={listening ? "Stop listening" : "Speak"}
          >
            <Radio size={14} strokeWidth={2} aria-hidden="true" />
          </button>
        )}
        <button type="submit" className="ask-send" aria-label="Send">
          <ArrowRight size={15} strokeWidth={2.2} aria-hidden="true" />
        </button>
      </form>
    </div>
  );
}
