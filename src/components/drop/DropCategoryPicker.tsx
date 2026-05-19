"use client";

// DropCategoryPicker — 8-button category picker (single select).
//
// `.picker-grid` + `.pick`/`.pick.on` markup from `06-drop-repo.html`.
// URL state: `?cat=<id>`. The display IDs (CLI / AI Framework / …) are
// the user-visible categories; on submit the page maps them to the
// closed-set enum {repo, skill, mcp} via displayCategoryToEnum().

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, type ReactNode } from "react";

import {
  DROP_DISPLAY_CATEGORIES,
  type DropDisplayCategoryId,
} from "@/lib/drop/steps";

const ICONS: Record<DropDisplayCategoryId, ReactNode> = {
  cli: (
    <svg className="pick-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M4 7h16M4 12h16M4 17h10" />
    </svg>
  ),
  "ai-framework": (
    <svg className="pick-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="3" y="4" width="18" height="14" rx="2" />
      <path d="M3 8h18M7 13h4" />
    </svg>
  ),
  agent: (
    <svg className="pick-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="12" cy="9" r="3" />
      <path d="M5 21c0-3.5 3-6.5 7-6.5s7 3 7 6.5" />
    </svg>
  ),
  "mcp-server": (
    <svg className="pick-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="12" cy="12" r="2" />
      <circle cx="4" cy="4" r="2" />
      <circle cx="20" cy="4" r="2" />
      <circle cx="4" cy="20" r="2" />
      <circle cx="20" cy="20" r="2" />
      <path d="M5 5l5 5m6-5l-6 6m0 0l6 6m-5-1l-5 5" />
    </svg>
  ),
  "dev-tool": (
    <svg className="pick-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M5 10v8h14v-8M3 7h18l-1 3H4l-1-3zM10 3h4l2 4H8l2-4z" />
    </svg>
  ),
  "local-llm": (
    <svg className="pick-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M21 12c0 5-4 9-9 9s-9-4-9-9 4-9 9-9c2 0 4 1 5 2" />
      <path d="M16 4l5 1-1 5" />
    </svg>
  ),
  rag: (
    <svg className="pick-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18" />
    </svg>
  ),
  skill: (
    <svg className="pick-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <path d="M3 9h18M9 21V9" />
    </svg>
  ),
};

const DRAFT_KEY = "trendingrepo-drop-draft";

function persistCategory(id: DropDisplayCategoryId | null) {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    const existing = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    existing.cat = id;
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(existing));
  } catch {
    // ignored
  }
}

interface DropCategoryPickerProps {
  initialSelection: DropDisplayCategoryId | null;
}

export function DropCategoryPicker({ initialSelection }: DropCategoryPickerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const current = useMemo<DropDisplayCategoryId | null>(() => {
    const param = searchParams.get("cat");
    if (!param) return initialSelection;
    const match = DROP_DISPLAY_CATEGORIES.find((c) => c.id === param);
    return match ? (match.id as DropDisplayCategoryId) : initialSelection;
  }, [searchParams, initialSelection]);

  const select = useCallback(
    (id: DropDisplayCategoryId) => {
      const next = current === id ? null : id;
      const params = new URLSearchParams(searchParams.toString());
      if (next) params.set("cat", next);
      else params.delete("cat");
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
      persistCategory(next);
    },
    [current, pathname, router, searchParams],
  );

  return (
    <div className="card">
      <div className="card-head">
        <h2 className="card-title">
          ▌ <b>Step 3 · Categorize</b> · pick the closest fit · single category
        </h2>
      </div>
      <div className="picker-grid">
        {DROP_DISPLAY_CATEGORIES.map((c) => {
          const isOn = current === c.id;
          return (
            <button
              key={c.id}
              type="button"
              className={`pick${isOn ? " on" : ""}`}
              onClick={() => select(c.id as DropDisplayCategoryId)}
              aria-pressed={isOn}
              data-cat-id={c.id}
            >
              {ICONS[c.id as DropDisplayCategoryId]}
              <span className="pick-label">{c.label}</span>
              <span className="pick-count">{c.count} in cat.</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
