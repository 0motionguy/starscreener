"use client";

// RepoSearchBox — typeahead over /api/search?v=2.
//
// Debounced query → server. Click a result to add to the unranked pool.

import { useEffect, useRef, useState } from "react";

import type { Repo } from "@/lib/types";
import { useTierListEditor, type PoolItem } from "@/lib/tier-list/client-store";

import { Avatar } from "./Avatar";

interface SearchResponseV2 {
  ok: boolean;
  results: Repo[];
}

const DEBOUNCE_MS = 250;
const RESULTS_LIMIT = 12;

function repoToPoolItem(repo: Repo): PoolItem {
  return {
    repoId: repo.fullName,
    displayName: repo.name,
    owner: repo.owner,
    avatarUrl: repo.ownerAvatarUrl,
    stars: repo.stars,
  };
}

export function RepoSearchBox() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Repo[]>([]);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const addToPool = useTierListEditor((s) => s.addToPool);
  const itemMeta = useTierListEditor((s) => s.itemMeta);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }

    const handle = setTimeout(() => {
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      setLoading(true);
      const params = new URLSearchParams({
        v: "2",
        q: trimmed,
        limit: String(RESULTS_LIMIT),
        sort: "momentum",
      });
      fetch(`/api/search?${params.toString()}`, { signal: ac.signal })
        .then((res) => res.json() as Promise<SearchResponseV2>)
        .then((data) => {
          if (data?.ok && Array.isArray(data.results)) {
            setResults(data.results.slice(0, RESULTS_LIMIT));
          } else {
            setResults([]);
          }
        })
        .catch((err) => {
          if (err?.name !== "AbortError") setResults([]);
        })
        .finally(() => setLoading(false));
    }, DEBOUNCE_MS);

    return () => clearTimeout(handle);
  }, [query]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        width: "100%",
      }}
    >
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search repos to add (e.g. claude, langchain, cursor)..."
        aria-label="Search repos"
        style={{
          width: "100%",
          padding: "10px 14px",
          fontSize: 14,
          fontFamily:
            "ui-monospace, SFMono-Regular, Menlo, monospace",
          backgroundColor: "#1b1b1e",
          color: "#FBFBFB",
          border: "1px solid #2B2B2F",
          borderRadius: 4,
          outline: "none",
        }}
      />
      {query.trim().length >= 2 && (
        <div
          role="listbox"
          aria-label="Search results"
          style={{
            display: "flex",
            flexDirection: "column",
            backgroundColor: "#1b1b1e",
            border: "1px solid #2B2B2F",
            borderRadius: 4,
            maxHeight: 320,
            overflowY: "auto",
          }}
        >
          {loading && results.length === 0 ? (
            <div
              style={{
                padding: "10px 14px",
                fontFamily:
                  "ui-monospace, SFMono-Regular, Menlo, monospace",
                fontSize: 12,
                color: "#878787",
              }}
            >
              searching…
            </div>
          ) : results.length === 0 ? (
            <div
              style={{
                padding: "10px 14px",
                fontFamily:
                  "ui-monospace, SFMono-Regular, Menlo, monospace",
                fontSize: 12,
                color: "#878787",
              }}
            >
              no matches
            </div>
          ) : (
            results.map((repo) => {
              const alreadyAdded = Boolean(itemMeta[repo.fullName]);
              return (
                <button
                  key={repo.id}
                  type="button"
                  role="option"
                  aria-selected={false}
                  disabled={alreadyAdded}
                  onClick={() => addToPool(repoToPoolItem(repo))}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "8px 14px",
                    backgroundColor: "transparent",
                    color: alreadyAdded ? "#5A5A5C" : "#FBFBFB",
                    border: "none",
                    borderTop: "1px solid #2B2B2F",
                    cursor: alreadyAdded ? "not-allowed" : "pointer",
                    textAlign: "left",
                    fontFamily:
                      "ui-monospace, SFMono-Regular, Menlo, monospace",
                    fontSize: 13,
                  }}
                >
                  <Avatar
                    repoId={repo.fullName}
                    avatarUrl={repo.ownerAvatarUrl}
                    size={28}
                  />
                  <span style={{ flexGrow: 1 }}>{repo.fullName}</span>
                  <span style={{ color: "#878787", fontSize: 11 }}>
                    {alreadyAdded ? "added" : `★ ${repo.stars.toLocaleString()}`}
                  </span>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
