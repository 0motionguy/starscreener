"use client";

// AtMentionMenu — popover that surfaces "@repo / @skill" suggestions
// while the user types into IdeaInlineComments / IdeaContributionComposer.
//
// Data is intentionally static for v1: we don't have a /api/mentions
// endpoint yet (Phase 4C gap fill). The list below covers the top repos
// + common builder skills so the UX is real, even if the source is local.

import { useEffect, useMemo, useRef } from "react";

export interface MentionItem {
  type: "repo" | "skill";
  label: string;
  hint?: string;
}

export const MENTIONS: MentionItem[] = [
  // Repos
  { type: "repo", label: "vercel/next.js", hint: "App router" },
  { type: "repo", label: "facebook/react", hint: "UI runtime" },
  { type: "repo", label: "openai/codex", hint: "CLI agent" },
  { type: "repo", label: "anthropics/claude-code", hint: "Agentic IDE" },
  { type: "repo", label: "langchain-ai/langgraph", hint: "Agent graphs" },
  { type: "repo", label: "supabase/supabase", hint: "Postgres + auth" },
  { type: "repo", label: "shadcn/ui", hint: "Components" },
  { type: "repo", label: "tailwindlabs/tailwindcss", hint: "Atomic CSS" },
  { type: "repo", label: "vitejs/vite", hint: "Bundler" },
  { type: "repo", label: "drizzle-team/drizzle-orm", hint: "TS ORM" },
  // Skills
  { type: "skill", label: "@typescript", hint: "Skill" },
  { type: "skill", label: "@react", hint: "Skill" },
  { type: "skill", label: "@rust", hint: "Skill" },
  { type: "skill", label: "@python", hint: "Skill" },
  { type: "skill", label: "@postgres", hint: "Skill" },
  { type: "skill", label: "@docker", hint: "Skill" },
  { type: "skill", label: "@nextjs", hint: "Skill" },
  { type: "skill", label: "@design", hint: "Skill" },
];

interface AtMentionMenuProps {
  query: string;
  open: boolean;
  onPick: (item: MentionItem) => void;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
}

export function AtMentionMenu({
  query,
  open,
  onPick,
  onClose,
  anchorRef,
}: AtMentionMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const all = MENTIONS;
    if (!q) return all.slice(0, 6);
    return all
      .filter((m) => m.label.toLowerCase().includes(q))
      .slice(0, 6);
  }, [query]);

  // Click-outside closes
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        !menuRef.current?.contains(target) &&
        !anchorRef.current?.contains(target)
      ) {
        onClose();
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open, onClose, anchorRef]);

  if (!open || filtered.length === 0) return null;

  return (
    <div ref={menuRef} className="at-menu" role="listbox">
      {filtered.map((item) => (
        <button
          key={`${item.type}:${item.label}`}
          type="button"
          className={`at-item at-${item.type}`}
          onClick={() => onPick(item)}
        >
          <span className="at-label">{item.label}</span>
          {item.hint ? <span className="at-hint">{item.hint}</span> : null}
        </button>
      ))}
    </div>
  );
}
