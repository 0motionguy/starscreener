"use client";

// IdeaBriefModal — "Generate brief" overlay. Triggered from per-row Brief
// button (data-idea-action="brief" data-idea-id="<id>"). Renders an
// 8-block deterministic brief template.

import { useCallback, useEffect, useRef, useState } from "react";

const BLOCKS: { title: string; body: string }[] = [
  {
    title: "Problem",
    body: "Users hit friction the moment they try to apply the trend to their own workflow. No turnkey path from clone to first value.",
  },
  {
    title: "Audience",
    body: "Indie hackers + small dev teams already tracking the repo. They have intent but not the patience to plumb config + auth + storage.",
  },
  {
    title: "Outcome",
    body: "Ship a hosted starter that brings time-to-first-value from hours to under five minutes, with sensible defaults.",
  },
  {
    title: "MVP scope",
    body: "1) one-click deploy, 2) opinionated config schema, 3) example dataset/seed, 4) docs page with a 90-second demo.",
  },
  {
    title: "Tech stack",
    body: "Next.js + TS, HOSTUP or self-hosted runtime, Postgres for state, Clerk for auth. Reuse the upstream lib as a dependency, no fork.",
  },
  {
    title: "Distribution",
    body: "Post on the upstream Discord/GitHub Discussions, Hacker News Show HN, plus a Twitter/X thread tagged with the repo handle.",
  },
  {
    title: "Risks",
    body: "Upstream breaking changes; license edge cases; users wanting features that conflict with the simplicity of the starter.",
  },
  {
    title: "Success signals",
    body: "≥ 50 deploys in week 1, ≥ 10 GitHub stars on the starter repo, ≥ 1 upstream PR linking back to it.",
  },
];

export function IdeaBriefModal() {
  const [open, setOpen] = useState(false);
  const [ideaId, setIdeaId] = useState<string | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const onAction = (e: Event) => {
      const target = e.target as HTMLElement | null;
      const trigger = target?.closest?.<HTMLElement>(
        '[data-idea-action="brief"]',
      );
      if (!trigger) return;
      e.preventDefault();
      triggerRef.current = trigger;
      setIdeaId(trigger.dataset.ideaId ?? null);
      setOpen(true);
    };
    document.addEventListener("click", onAction);
    return () => document.removeEventListener("click", onAction);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    setIdeaId(null);
    // Return focus to the trigger that opened the modal.
    queueMicrotask(() => triggerRef.current?.focus?.());
  }, []);

  // Esc-to-close + initial focus on the close button.
  useEffect(() => {
    if (!open) return;
    closeBtnRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, close]);

  if (!open) return null;

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="idea-brief-modal-title"
      onClick={close}
    >
      <div
        className="modal idea-brief-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-head">
          <h2 id="idea-brief-modal-title">
            Build brief {ideaId ? <small>· {ideaId}</small> : null}
          </h2>
          <button
            ref={closeBtnRef}
            type="button"
            className="modal-close"
            aria-label="Close"
            onClick={close}
          >
            ×
          </button>
        </header>
        <div className="modal-body">
          <p className="modal-hint">
            Use the blocks below as a starting structure for the build brief.
          </p>
          <div className="brief-blocks">
            {BLOCKS.map((b) => (
              <article key={b.title} className="brief-block">
                <h3>{b.title}</h3>
                <p>{b.body}</p>
              </article>
            ))}
          </div>
          <div className="modal-actions">
            <button type="button" className="cta-secondary" onClick={close}>
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
