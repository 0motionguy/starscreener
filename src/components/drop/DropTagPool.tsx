"use client";

// DropTagPool — multi-select tag pool with 5-max cap (display) and a
// 4-max cap on submission (backend MAX_TAGS).
//
// `.tag-pool` + `.tag-pick`/`.tag-pick.on` from `06-drop-repo.html`.
// URL state: `?tags=cli,python,dev-tool` — comma-separated lowercase.

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";

import {
  DROP_DISPLAY_TAGS,
  DROP_MAX_DISPLAY_TAGS,
} from "@/lib/drop/steps";

const DRAFT_KEY = "trendingrepo-drop-draft";

function persistTags(tags: string[]) {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    const existing = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    existing.tags = tags;
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(existing));
  } catch {
    // ignored
  }
}

interface DropTagPoolProps {
  initialSelection: string[];
}

function readTagsFromUrl(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((t) => t.trim().toUpperCase())
    .filter((t) => DROP_DISPLAY_TAGS.includes(t));
}

export function DropTagPool({ initialSelection }: DropTagPoolProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const selected = useMemo<string[]>(() => {
    const urlTags = readTagsFromUrl(searchParams.get("tags"));
    return urlTags.length > 0 ? urlTags : initialSelection;
  }, [searchParams, initialSelection]);

  const writeUrl = useCallback(
    (next: string[]) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next.length > 0) params.set("tags", next.join(",").toLowerCase());
      else params.delete("tags");
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
      persistTags(next);
    },
    [pathname, router, searchParams],
  );

  const toggle = useCallback(
    (tag: string) => {
      const isOn = selected.includes(tag);
      let next: string[];
      if (isOn) next = selected.filter((t) => t !== tag);
      else if (selected.length >= DROP_MAX_DISPLAY_TAGS) return;
      else next = [...selected, tag];
      writeUrl(next);
    },
    [selected, writeUrl],
  );

  return (
    <div className="card" style={{ marginTop: 14 }}>
      <div className="card-head">
        <h2 className="card-title">
          ▌ <b>Tag your repo</b> · pick up to {DROP_MAX_DISPLAY_TAGS} · helps the radar route it
        </h2>
        <span className="grow"></span>
        <span className="muted mono" style={{ fontSize: 10.5 }}>
          {selected.length} / {DROP_MAX_DISPLAY_TAGS} selected
        </span>
      </div>
      <div className="tag-pool">
        {DROP_DISPLAY_TAGS.map((tag) => {
          const isOn = selected.includes(tag);
          const disabled = !isOn && selected.length >= DROP_MAX_DISPLAY_TAGS;
          return (
            <button
              key={tag}
              type="button"
              className={`tag-pick${isOn ? " on" : ""}`}
              onClick={() => toggle(tag)}
              disabled={disabled}
              aria-pressed={isOn}
              data-tag={tag}
            >
              {tag}
              {isOn ? <span className="x">×</span> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
