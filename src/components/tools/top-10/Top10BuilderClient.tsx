"use client";

// Top10BuilderClient — search + 10 slots = your own daily top 10.
//
// State lives in the URL via `?my=slug1,slug2,…` so the result is sharable
// and the page + OG share-card both re-render against the same slugs (see
// build-custom-bundle.ts). On mount, slots are seeded from the current URL.

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { Icon } from "@/components/icon/Icon";
import type { Repo } from "@/lib/types";

interface SearchResponseV2 {
  ok: boolean;
  results: Repo[];
}

const SLOT_COUNT = 10;
const DEBOUNCE_MS = 250;
const RESULTS_LIMIT = 12;

interface BuilderSlot {
  slug: string;
  owner: string;
  name: string;
  avatarUrl?: string;
}

function parseInitialSlugs(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, SLOT_COUNT);
}

function slugToSlot(slug: string): BuilderSlot {
  const [owner = "", name = ""] = slug.split("/");
  return { slug, owner, name };
}

function repoToSlot(repo: Repo): BuilderSlot {
  return {
    slug: repo.fullName,
    owner: repo.owner,
    name: repo.name,
    avatarUrl: repo.ownerAvatarUrl,
  };
}

interface Top10BuilderClientProps {
  initialSlugs: string[];
}

export function Top10BuilderClient({ initialSlugs }: Top10BuilderClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [slots, setSlots] = useState<BuilderSlot[]>(() =>
    initialSlugs.map(slugToSlot),
  );
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Repo[]>([]);
  const [loading, setLoading] = useState(false);
  const [copyOk, setCopyOk] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Keep slots in sync if URL changes externally (back/forward nav).
  useEffect(() => {
    const fromUrl = parseInitialSlugs(searchParams.get("my"));
    if (fromUrl.join(",") !== slots.map((s) => s.slug).join(",")) {
      setSlots(fromUrl.map(slugToSlot));
    }
    // intentional: react only on the URL param shifting
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams.get("my")]);

  // Debounced /api/search lookup.
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

  const filled = slots.length;
  const empty = SLOT_COUNT - filled;
  const alreadyHas = (slug: string) =>
    slots.some((s) => s.slug.toLowerCase() === slug.toLowerCase());

  function addRepo(repo: Repo) {
    if (filled >= SLOT_COUNT) return;
    if (alreadyHas(repo.fullName)) return;
    setSlots((prev) => [...prev, repoToSlot(repo)]);
    setQuery("");
    setResults([]);
  }

  function removeSlot(idx: number) {
    setSlots((prev) => prev.filter((_, i) => i !== idx));
  }

  function moveSlot(idx: number, dir: -1 | 1) {
    const target = idx + dir;
    if (target < 0 || target >= slots.length) return;
    setSlots((prev) => {
      const next = [...prev];
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  }

  function clearAll() {
    setSlots([]);
    setQuery("");
    setResults([]);
  }

  function openAsMyTop() {
    if (slots.length === 0) return;
    const my = slots.map((s) => s.slug).join(",");
    router.replace(`/tools/top-10?my=${encodeURIComponent(my)}`, {
      scroll: true,
    });
  }

  function copyShareLink() {
    if (slots.length === 0) return;
    const my = slots.map((s) => s.slug).join(",");
    const url = `${window.location.origin}/tools/top-10?my=${encodeURIComponent(my)}`;
    navigator.clipboard?.writeText(url).then(() => {
      setCopyOk(true);
      setTimeout(() => setCopyOk(false), 1800);
    });
  }

  const showResults = query.trim().length >= 2;

  return (
    <section className="t10-builder" aria-label="Build your own Top 10">
      <header className="t10-builder-head">
        <h2 className="t10-builder-title">
          <span className="slash">{"//"}</span> Build Your Own Top 10
        </h2>
        <p className="t10-builder-sub">
          Search GitHub repos. Drop them into slots. Share your pick — the
          link unfurls on X with your custom list.
        </p>
      </header>

      <div className="t10-builder-search">
        <div className="search-input t10-builder-input">
          <Icon name="search" size="md" aria-label="Search" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. anthropics/claude-code, vercel, langchain…"
            aria-label="Search repos to add"
            autoComplete="off"
            spellCheck={false}
            disabled={filled >= SLOT_COUNT}
          />
          {query.trim().length === 0 ? (
            <span className="kbd t10-builder-kbd" aria-hidden>
              {filled >= SLOT_COUNT ? "10/10 filled" : `${filled}/${SLOT_COUNT}`}
            </span>
          ) : (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setQuery("")}
              className="t10-builder-clear"
            >
              <Icon name="close" size="sm" />
            </button>
          )}
        </div>
        {showResults && (
          <div
            role="listbox"
            aria-label="Search results"
            className="t10-builder-results"
          >
            {loading && results.length === 0 ? (
              <div className="t10-builder-empty">{"// searching…"}</div>
            ) : results.length === 0 ? (
              <div className="t10-builder-empty">
                {"// no matches — try a different keyword"}
              </div>
            ) : (
              results.map((repo) => {
                const added = alreadyHas(repo.fullName);
                return (
                  <button
                    key={repo.id}
                    type="button"
                    role="option"
                    aria-selected={false}
                    disabled={added || filled >= SLOT_COUNT}
                    onClick={() => addRepo(repo)}
                    className="t10-builder-result"
                  >
                    {repo.ownerAvatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- 24px owner avatar
                      <img
                        src={repo.ownerAvatarUrl}
                        width={24}
                        height={24}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        className="t10-builder-result-avatar"
                      />
                    ) : (
                      <span className="t10-builder-result-avatar fallback" />
                    )}
                    <span className="t10-builder-result-name">
                      {repo.fullName}
                    </span>
                    <span className="t10-builder-result-meta">
                      {added
                        ? "✓ added"
                        : `★ ${repo.stars.toLocaleString()}`}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>

      <ol className="t10-builder-slots">
        {Array.from({ length: SLOT_COUNT }, (_, i) => {
          const slot = slots[i];
          const rankLabel = String(i + 1).padStart(2, "0");
          if (!slot) {
            return (
              <li key={`empty-${i}`} className="t10-builder-slot empty">
                <span className="t10-builder-slot-rank">{rankLabel}</span>
                <span className="t10-builder-slot-placeholder">
                  {"// empty slot"}
                </span>
              </li>
            );
          }
          return (
            <li
              key={`${slot.slug}-${i}`}
              className={`t10-builder-slot${i < 3 ? " top3" : ""}`}
            >
              <span className="t10-builder-slot-rank">{rankLabel}</span>
              {slot.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- 24px owner avatar
                <img
                  src={slot.avatarUrl}
                  width={24}
                  height={24}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="t10-builder-slot-avatar"
                />
              ) : (
                <span className="t10-builder-slot-avatar fallback" />
              )}
              <span className="t10-builder-slot-name">
                <span className="t10-builder-slot-owner">{slot.owner}</span>
                <span className="t10-builder-slot-slash">/</span>
                <span className="t10-builder-slot-repo">{slot.name}</span>
              </span>
              <span className="t10-builder-slot-actions">
                <button
                  type="button"
                  aria-label={`Move ${slot.slug} up`}
                  onClick={() => moveSlot(i, -1)}
                  disabled={i === 0}
                  className="t10-builder-slot-btn"
                >
                  ↑
                </button>
                <button
                  type="button"
                  aria-label={`Move ${slot.slug} down`}
                  onClick={() => moveSlot(i, 1)}
                  disabled={i === slots.length - 1}
                  className="t10-builder-slot-btn"
                >
                  ↓
                </button>
                <button
                  type="button"
                  aria-label={`Remove ${slot.slug}`}
                  onClick={() => removeSlot(i)}
                  className="t10-builder-slot-btn t10-builder-slot-remove"
                >
                  ×
                </button>
              </span>
            </li>
          );
        })}
      </ol>

      <footer className="t10-builder-actions">
        <span className="t10-builder-count">
          {filled} of {SLOT_COUNT} {filled === 0 ? "— start adding repos" : empty === 0 ? "— full deck, ready to share" : "filled"}
        </span>
        <div className="t10-builder-buttons">
          <button
            type="button"
            onClick={clearAll}
            disabled={filled === 0}
            className="t10-builder-btn ghost"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={openAsMyTop}
            disabled={filled === 0}
            className="t10-builder-btn primary"
          >
            Open as my Top 10
          </button>
          <button
            type="button"
            onClick={copyShareLink}
            disabled={filled === 0}
            className="t10-builder-btn"
          >
            {copyOk ? "✓ Link copied" : "Copy share link"}
          </button>
        </div>
      </footer>
    </section>
  );
}
