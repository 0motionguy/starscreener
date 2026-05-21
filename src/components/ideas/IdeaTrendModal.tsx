"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { X } from "@/lib/icons";

interface IdeaTrendModalProps {
  trendingRepos: { fullName: string; pitch: string }[];
}

export function IdeaTrendModal({ trendingRepos }: IdeaTrendModalProps) {
  const [open, setOpen] = useState(false);
  const [pickedIdx, setPickedIdx] = useState(0);
  const triggerRef = useRef<HTMLElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const onAction = (e: Event) => {
      const target = e.target as HTMLElement | null;
      const trigger = target?.closest?.<HTMLElement>(
        '[data-idea-action="trend"]',
      );
      if (!trigger) return;
      e.preventDefault();
      triggerRef.current = trigger;
      setOpen(true);
    };
    document.addEventListener("click", onAction);
    return () => document.removeEventListener("click", onAction);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    queueMicrotask(() => triggerRef.current?.focus?.());
  }, []);

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

  const repos =
    trendingRepos.length > 0
      ? trendingRepos
      : [
          {
            fullName: "modelcontextprotocol/servers",
            pitch:
              "MCP servers keep surfacing setup, health, and hosted visibility pain",
          },
          {
            fullName: "openai/codex",
            pitch:
              "Agent tooling needs clearer workflow replay and failed-tool-call debugging",
          },
        ];
  const picked = repos[pickedIdx] ?? repos[0]!;
  const draftTitle = `Make ${
    picked.fullName.split("/")[1] ?? picked.fullName
  } usable in minutes`;
  const draftPitch = `${picked.pitch}. There's room for a launcher or wrapper that gets new users to first value in under five minutes.`;

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="idea-trend-modal-title"
      onClick={close}
    >
      <div
        className="modal idea-trend-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-head">
          <h2 id="idea-trend-modal-title">Generate from a trend</h2>
          <button
            ref={closeBtnRef}
            type="button"
            className="modal-close"
            aria-label="Close"
            onClick={close}
          >
            <X size={16} strokeWidth={2} aria-hidden="true" />
          </button>
        </header>
        <div className="modal-body">
          <p className="modal-hint">
            Pick a live repo signal to seed an editable idea draft.
          </p>
          <div className="trend-picker">
            {repos.slice(0, 6).map((r, i) => (
              <button
                key={r.fullName}
                type="button"
                className={`trend-pick ${i === pickedIdx ? "on" : ""}`}
                onClick={() => setPickedIdx(i)}
              >
                {r.fullName}
              </button>
            ))}
          </div>
          <div className="trend-draft">
            <label>
              <span>Draft title</span>
              <input
                type="text"
                defaultValue={draftTitle}
                key={draftTitle}
                aria-label="Draft title"
              />
            </label>
            <label>
              <span>Draft pitch</span>
              <textarea
                rows={4}
                defaultValue={draftPitch}
                key={draftPitch}
                aria-label="Draft pitch"
              />
            </label>
          </div>
          <div className="modal-actions">
            <button type="button" className="cta-secondary" onClick={close}>
              Cancel
            </button>
            <button
              type="button"
              className="cta-primary"
              data-idea-action="submit"
            >
              Continue to submit
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
