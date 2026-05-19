"use client";

// IdeaTrendModal — "Generate from trend" overlay. v1 renders a static
// template (no AI). The user picks a trending repo and we surface a
// boilerplate idea draft they can edit before submitting.

import { useCallback, useEffect, useState } from "react";

interface IdeaTrendModalProps {
  trendingRepos: { fullName: string; pitch: string }[];
}

export function IdeaTrendModal({ trendingRepos }: IdeaTrendModalProps) {
  const [open, setOpen] = useState(false);
  const [pickedIdx, setPickedIdx] = useState(0);

  useEffect(() => {
    const onAction = (e: Event) => {
      const target = e.target as HTMLElement | null;
      const trigger = target?.closest?.<HTMLElement>(
        '[data-idea-action="trend"]',
      );
      if (!trigger) return;
      e.preventDefault();
      setOpen(true);
    };
    document.addEventListener("click", onAction);
    return () => document.removeEventListener("click", onAction);
  }, []);

  const close = useCallback(() => setOpen(false), []);

  if (!open) return null;

  const picked = trendingRepos[pickedIdx];
  const draftTitle = picked
    ? `Make ${picked.fullName.split("/")[1] ?? picked.fullName} usable in minutes`
    : "Pick a trending repo";
  const draftPitch = picked
    ? `${picked.pitch}. There's room for a launcher / wrapper that gets new users to first value in <5 min.`
    : "Choose a trend to seed the draft.";

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal idea-trend-modal">
        <header className="modal-head">
          <h2>Generate from a trend</h2>
          <button
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
            v1 uses a static template — AI draft generation lands in Phase 4C.
          </p>
          <div className="trend-picker">
            {trendingRepos.length === 0 ? (
              <p>No trending repos available — try again later.</p>
            ) : (
              trendingRepos.slice(0, 6).map((r, i) => (
                <button
                  key={r.fullName}
                  type="button"
                  className={`trend-pick ${i === pickedIdx ? "on" : ""}`}
                  onClick={() => setPickedIdx(i)}
                >
                  {r.fullName}
                </button>
              ))
            )}
          </div>
          <div className="trend-draft">
            <label>
              <span>Draft title</span>
              <input type="text" defaultValue={draftTitle} key={draftTitle} />
            </label>
            <label>
              <span>Draft pitch</span>
              <textarea rows={4} defaultValue={draftPitch} key={draftPitch} />
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
