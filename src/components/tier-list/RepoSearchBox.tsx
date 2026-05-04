"use client";

// RepoSearchBox - typeahead over /api/search?v=2.

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
    <div className="tier-search">
      <div className="sh-search">
        <span className="ic">?</span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search repos to add to the pool..."
          aria-label="Search repos"
        />
      </div>
      {query.trim().length >= 2 && (
        <div role="listbox" aria-label="Search results" className="tier-results">
          {loading && results.length === 0 ? (
            <div className="tier-result-empty">searching...</div>
          ) : results.length === 0 ? (
            <div className="tier-result-empty">no matches</div>
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
                  className="tier-result"
                >
                  <Avatar
                    repoId={repo.fullName}
                    avatarUrl={repo.ownerAvatarUrl}
                    size={28}
                    rounded={2}
                  />
                  <span>{repo.fullName}</span>
                  <b>{alreadyAdded ? "added" : `* ${repo.stars.toLocaleString()}`}</b>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
