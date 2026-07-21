"use client";

// MobileSearchSheet — full-screen global search for the mobile app header.
//
// Consumes the shared useGlobalSearch hook (same /api/search/global +
// matchNavCommands contract as the desktop Topbar), rendered as an
// app-native sheet: autofocus, 46px result rows, categorized Pages/Repos/LLMs,
// clear button, and locally-stored recent searches. Closing restores the
// prior route (the sheet is an overlay; it never navigates unless a result is
// tapped).

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icon/Icon";
import { MobileSheet } from "./MobileSheet";
import { useMobileApp } from "./MobileAppProvider";
import { useGlobalSearch, type SearchHit } from "@/lib/search/useGlobalSearch";

const RECENT_KEY = "trendingrepo-mapp-recent-search";

function loadRecent(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
    return Array.isArray(raw) ? raw.filter((x) => typeof x === "string").slice(0, 6) : [];
  } catch {
    return [];
  }
}

function saveRecent(q: string) {
  try {
    const cur = loadRecent().filter((x) => x.toLowerCase() !== q.toLowerCase());
    localStorage.setItem(RECENT_KEY, JSON.stringify([q, ...cur].slice(0, 6)));
  } catch {
    /* ignore quota / private-mode failures */
  }
}

function formatStars(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return String(n);
}

export function MobileSearchSheet() {
  const router = useRouter();
  const { activeSheet, closeSheet } = useMobileApp();
  const { query, setQuery, results, loading, pageHits, hrefForHit } = useGlobalSearch();
  const [recent, setRecent] = useState<string[]>([]);
  const open = activeSheet === "search";

  useEffect(() => {
    if (open) setRecent(loadRecent());
    else setQuery("");
  }, [open, setQuery]);

  const go = (hit: SearchHit) => {
    const href = hrefForHit(hit);
    const q = query.trim();
    if (q) saveRecent(q);
    closeSheet();
    router.push(href);
  };

  const repos = results?.repos ?? [];
  const llms = results?.llms ?? [];
  const hasAny = pageHits.length > 0 || repos.length > 0 || llms.length > 0;

  return (
    <MobileSheet id="search" title="Search">
      <div className="mapp-search">
        <div className="mapp-search-field">
          <Icon name="search" size={16} className="mapp-search-ico" />
          <input
            className="mapp-search-input"
            data-initial-focus
            type="text"
            inputMode="search"
            autoFocus
            value={query}
            placeholder="Search repos, owners, models, pages…"
            aria-label="Search"
            onChange={(e) => setQuery(e.target.value)}
          />
          {query ? (
            <button
              type="button"
              className="mapp-search-clear"
              aria-label="Clear search"
              onClick={() => setQuery("")}
            >
              <Icon name="x-circle" size={16} />
            </button>
          ) : null}
        </div>

        <div className="mapp-search-results">
          {!query ? (
            recent.length ? (
              <div className="mapp-search-group">
                <div className="mapp-search-head">Recent</div>
                {recent.map((r) => (
                  <button
                    type="button"
                    key={r}
                    className="mapp-search-recent"
                    onClick={() => setQuery(r)}
                  >
                    <Icon name="clock" size={14} />
                    <span>{r}</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="mapp-search-hint">Find any repo, owner, model, or page.</div>
            )
          ) : loading && !hasAny ? (
            <div className="mapp-search-hint">Searching…</div>
          ) : !hasAny ? (
            <div className="mapp-search-hint">No results for &ldquo;{query}&rdquo;.</div>
          ) : (
            <>
              {pageHits.length > 0 ? (
                <div className="mapp-search-group">
                  <div className="mapp-search-head">
                    <span>Pages</span>
                    <span>{pageHits.length}</span>
                  </div>
                  {pageHits.map((cmd) => (
                    <button
                      type="button"
                      key={cmd.id}
                      className="mapp-search-row"
                      onClick={() => go({ kind: "page", item: cmd })}
                    >
                      <span className="mapp-search-row-body">
                        <span className="mapp-search-row-title">{cmd.label}</span>
                        <span className="mapp-search-row-sub">Jump to page</span>
                      </span>
                      <span className="mapp-search-row-meta">{cmd.group}</span>
                    </button>
                  ))}
                </div>
              ) : null}

              {repos.length > 0 ? (
                <div className="mapp-search-group">
                  <div className="mapp-search-head">
                    <span>Repos</span>
                    <span>{results?.totals?.repos ?? repos.length}</span>
                  </div>
                  {repos.map((repo) => (
                    <button
                      type="button"
                      key={repo.fullName}
                      className="mapp-search-row"
                      onClick={() => go({ kind: "repo", item: repo })}
                    >
                      <span className="mapp-search-row-body">
                        <span className="mapp-search-row-title">{repo.fullName}</span>
                        {repo.description ? (
                          <span className="mapp-search-row-sub">{repo.description}</span>
                        ) : null}
                      </span>
                      <span className="mapp-search-row-meta">{formatStars(repo.stars)}★</span>
                    </button>
                  ))}
                </div>
              ) : null}

              {llms.length > 0 ? (
                <div className="mapp-search-group">
                  <div className="mapp-search-head">
                    <span>LLMs</span>
                    <span>{results?.totals?.llms ?? llms.length}</span>
                  </div>
                  {llms.map((llm) => (
                    <button
                      type="button"
                      key={llm.slug}
                      className="mapp-search-row"
                      onClick={() => go({ kind: "llm", item: llm })}
                    >
                      <span className="mapp-search-row-body">
                        <span className="mapp-search-row-title">{llm.name}</span>
                        <span className="mapp-search-row-sub">{llm.creator}</span>
                      </span>
                      {typeof llm.intelligenceIndex === "number" ? (
                        <span className="mapp-search-row-meta">II {llm.intelligenceIndex}</span>
                      ) : null}
                    </button>
                  ))}
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </MobileSheet>
  );
}
