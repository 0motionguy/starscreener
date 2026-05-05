"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { ROUTES } from "@/lib/constants";

type PaletteItem = {
  label: string;
  href: string;
};

const ITEMS: PaletteItem[] = [
  { label: "Home", href: ROUTES.HOME },
  { label: "Compare", href: ROUTES.COMPARE },
  { label: "Watchlist", href: ROUTES.WATCHLIST },
  { label: "Search", href: ROUTES.SEARCH },
  { label: "Submit Repo", href: ROUTES.SUBMIT },
  { label: "Reddit Trending", href: ROUTES.REDDIT_TRENDING },
  { label: "Bluesky Trending", href: ROUTES.BLUESKY_TRENDING },
];

export function CmdKPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const isCmdK =
        event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey);
      if (isCmdK) {
        event.preventDefault();
        setOpen(true);
        return;
      }
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("keydown", onKeyDown, { capture: true });
    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => {
      document.removeEventListener("keydown", onKeyDown, { capture: true });
      window.removeEventListener("keydown", onKeyDown, { capture: true });
    };
  }, []);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ITEMS;
    return ITEMS.filter((item) => item.label.toLowerCase().includes(q));
  }, [query]);

  return (
    <>
      <span className="sr-only" data-cmdk-mounted="1" />
      {open ? (
        <div
          className="fixed inset-0 z-[10000] bg-black/50 px-4 pt-[16vh]"
          onClick={() => setOpen(false)}
          role="presentation"
        >
          <div
            className="mx-auto w-full max-w-xl overflow-hidden rounded-xl border border-white/10 bg-bg-card shadow-popover"
            onClick={(event) => event.stopPropagation()}
          >
            <label className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
              <Search className="size-4 text-text-tertiary" aria-hidden />
              <input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Type to jump..."
                aria-label="Command palette search"
                className="w-full bg-transparent py-1 text-sm text-text-primary outline-none placeholder:text-text-tertiary"
              />
              <span className="text-[10px] font-mono uppercase tracking-wide text-text-tertiary">
                Esc
              </span>
            </label>
            <ul className="max-h-[320px] overflow-y-auto py-1">
              {filtered.length === 0 ? (
                <li className="px-3 py-3 text-xs font-mono text-text-tertiary">
                  No results
                </li>
              ) : (
                filtered.map((item) => (
                  <li key={item.href}>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-bg-hover"
                      onClick={() => {
                        router.push(item.href);
                        setOpen(false);
                      }}
                    >
                      <span>{item.label}</span>
                      <span className="text-[10px] font-mono uppercase tracking-wide text-text-tertiary">
                        Enter
                      </span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>
      ) : null}
    </>
  );
}
