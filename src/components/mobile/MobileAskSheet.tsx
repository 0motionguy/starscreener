"use client";

// MobileAskSheet — instant page/topic jump for the mobile Ask tab.
//
// Reuses the SAME deterministic nav registry the desktop AskDock + ⌘K use
// (matchNavCommands over NAV_COMMANDS): typing "funding" / "agents" /
// "compare" navigates straight there, client-side, with no LLM call and no
// duplicated Ask logic. AskDock's shared controller (voice + LLM answers +
// page-operator) extends this same surface once its control layer is lifted
// out — this sheet delivers the deterministic path in full.

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { matchNavCommands } from "@/lib/nav-commands";
import { MobileSheet } from "./MobileSheet";
import { useMobileApp } from "./MobileAppProvider";

const SUGGESTIONS = ["agents", "funding", "compare", "breakout", "watchlist"];

export function MobileAskSheet() {
  const router = useRouter();
  const { closeSheet } = useMobileApp();
  const [query, setQuery] = useState("");
  const results = useMemo(() => matchNavCommands(query, 6), [query]);

  const go = (href: string) => {
    closeSheet();
    router.push(href);
  };

  return (
    <MobileSheet id="ask" title="Ask">
      <div className="mapp-ask">
        <p className="mapp-ask-hint">
          Type where you want to go: a page, tool, or topic.
        </p>
        <input
          className="mapp-ask-input"
          type="text"
          inputMode="search"
          data-initial-focus
          autoFocus
          value={query}
          placeholder="Where to? e.g. funding, agents, compare"
          aria-label="Ask or jump to a page"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && results[0]) go(results[0].href);
          }}
        />
        <div className="mapp-ask-results">
          {query && results.length === 0 ? (
            <div className="mapp-ask-empty">No page matches &ldquo;{query}&rdquo;.</div>
          ) : null}
          {results.map((r) => (
            <button
              type="button"
              key={r.id}
              className="mapp-ask-row"
              onClick={() => go(r.href)}
            >
              <span className="mapp-ask-row-label">{r.label}</span>
              <span className="mapp-ask-row-group">{r.group}</span>
            </button>
          ))}
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
