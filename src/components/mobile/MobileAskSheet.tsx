"use client";

// MobileAskSheet — the mobile Ask tab: instant page-jump + AI answers.
//
// Deterministic navigation reuses matchNavCommands (the same registry as the
// desktop AskDock + ⌘K): typing "funding" / "agents" navigates client-side
// with no LLM call. Questions with no page match fall through to the SAME
// endpoint AskDock uses (POST /api/navigator, 12s timeout) for a persistent
// typed answer or a navigation — no duplicated Ask intelligence. (Voice input,
// which AskDock also has, follows once a mic asset lands.)

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { matchNavCommands } from "@/lib/nav-commands";
import { Icon } from "@/components/icon/Icon";
import { MobileSheet } from "./MobileSheet";
import { useMobileApp } from "./MobileAppProvider";

const SUGGESTIONS = ["agents", "funding", "compare", "breakout", "watchlist"];

interface AskAnswer {
  text: string;
  href?: string;
}

export function MobileAskSheet() {
  const router = useRouter();
  const { closeSheet } = useMobileApp();
  const [query, setQuery] = useState("");
  const [answer, setAnswer] = useState<AskAnswer | null>(null);
  const [asking, setAsking] = useState(false);
  const results = useMemo(() => matchNavCommands(query, 6), [query]);

  const go = (href: string) => {
    closeSheet();
    router.push(href);
  };

  async function askAI(raw: string) {
    const text = raw.trim();
    if (!text || asking) return;
    setAsking(true);
    setAnswer(null);
    try {
      const res = await fetch("/api/navigator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ q: text }),
        signal: AbortSignal.timeout(12_000),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        reply?: string;
        answer?: string;
        action?: { kind?: string; href?: string };
      };
      const href =
        data?.action?.kind === "navigate" && typeof data.action.href === "string"
          ? data.action.href
          : undefined;
      // Pure navigation (no prose) → just go. Otherwise show a persistent answer.
      if (data?.ok && !data.answer && href) {
        go(href);
        return;
      }
      setAnswer({
        text:
          data?.answer ||
          data?.reply ||
          "I couldn't find a match for that. Try a page name like funding or agents.",
        href,
      });
    } catch {
      setAnswer({ text: "That took too long. Check your connection and try again." });
    } finally {
      setAsking(false);
    }
  }

  function onSubmit() {
    if (results[0]) {
      go(results[0].href);
      return;
    }
    askAI(query);
  }

  return (
    <MobileSheet id="ask" title="Ask">
      <div className="mapp-ask">
        <p className="mapp-ask-hint">
          Jump to a page, or ask a question about what&rsquo;s trending.
        </p>
        <div className="mapp-ask-field">
          <input
            className="mapp-ask-input"
            data-initial-focus
            type="text"
            inputMode="search"
            autoFocus
            value={query}
            placeholder="Where to, or what do you want to know?"
            aria-label="Ask or jump to a page"
            onChange={(e) => {
              setQuery(e.target.value);
              setAnswer(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onSubmit();
              }
            }}
          />
          <button
            type="button"
            className="mapp-ask-send"
            aria-label="Ask"
            disabled={!query.trim() || asking}
            onClick={onSubmit}
          >
            <Icon name={asking ? "sparkles" : "send"} size={16} />
          </button>
        </div>

        {asking ? (
          <div className="mapp-ask-thinking">
            <Icon name="sparkles" size={14} /> Thinking…
          </div>
        ) : null}

        {answer ? (
          <div className="mapp-ask-answer">
            <Icon name="sparkles" size={14} className="mapp-ask-answer-ico" />
            <div className="mapp-ask-answer-body">
              <p>{answer.text}</p>
              {answer.href ? (
                <button
                  type="button"
                  className="mapp-ask-answer-open"
                  onClick={() => go(answer.href as string)}
                >
                  Open
                  <Icon name="arrow-right" size={14} />
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        <div className="mapp-ask-results">
          {query && results.length > 0
            ? results.map((r) => (
                <button
                  type="button"
                  key={r.id}
                  className="mapp-ask-row"
                  onClick={() => go(r.href)}
                >
                  <span className="mapp-ask-row-label">{r.label}</span>
                  <span className="mapp-ask-row-group">{r.group}</span>
                </button>
              ))
            : null}
          {query && results.length === 0 && !answer && !asking ? (
            <button type="button" className="mapp-ask-ai-row" onClick={() => askAI(query)}>
              <Icon name="sparkles" size={14} />
              <span>Ask: &ldquo;{query}&rdquo;</span>
            </button>
          ) : null}
          {!query ? (
            <div className="mapp-ask-suggest">
              {SUGGESTIONS.map((s) => (
                <button
                  type="button"
                  key={s}
                  className="mapp-ask-chip"
                  onClick={() => setQuery(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </MobileSheet>
  );
}
