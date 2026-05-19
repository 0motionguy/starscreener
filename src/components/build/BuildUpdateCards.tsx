"use client";

// BuildUpdateCards — 4-card grid of template-derived "suggested updates".
// Each card has tags, headline, body, second tag row, and Review / Publish
// / Dismiss buttons. Clicking Review scrolls to the draft editor with the
// signal selected; Publish is wired to the placeholder POST handler but
// shows a "Coming in Phase 4C" toast for now. Dismiss locally removes the
// card from the grid (state lives in this component — refresh re-renders).
//
// AI-generated copy is deferred (per Phase 3E plan); drafts come from
// `draftFromSignal()` in build-signals.ts. TODO: wire AI generation when
// LLM endpoint stabilizes.

import { useState } from "react";

import type { BuildUpdateDraft } from "./build-signals";

interface BuildUpdateCardsProps {
  drafts: BuildUpdateDraft[];
  /** Currently-reviewing card key (matches `card-${kind}` ids from page). */
  activeKey?: string | null;
}

export function BuildUpdateCards({ drafts, activeKey }: BuildUpdateCardsProps) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [publishStatus, setPublishStatus] = useState<Record<string, "idle" | "published">>(
    {},
  );

  const visible = drafts.filter((d) => !dismissed.has(d.signalId)).slice(0, 4);

  if (visible.length === 0) {
    return (
      <section className="panel">
        <div className="panel-head">
          <h2>Suggested build updates</h2>
          <span className="meta">queue clean</span>
        </div>
        <div className="empty-state">
          <h3>All updates published.</h3>
          <p>
            The queue is clean. New suggestions appear when your repo ships
            something worth sharing.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Suggested build updates</h2>
        <span className="meta">worth sharing</span>
      </div>
      <div className="update-grid">
        {visible.map((draft) => {
          const isReviewing = activeKey === `card-${draft.kind}`;
          const published = publishStatus[draft.signalId] === "published";
          return (
            <article
              key={draft.signalId}
              id={`card-${draft.kind}`}
              className={`update-card${isReviewing ? " reviewing" : ""}`}
            >
              <div className="tag-row">
                <span className="tag">{draft.source}</span>
                <span className="tag">confidence {draft.confidence}</span>
                <span className="tag">timeline</span>
              </div>
              <h3>{draft.headline}</h3>
              <p>{draft.short}</p>
              <div className="tag-row">
                {draft.tags.map((t) => (
                  <span className="tag" key={t}>
                    {t}
                  </span>
                ))}
              </div>
              <div className="card-actions">
                <a
                  className={isReviewing ? "tiny-btn primary" : "tiny-btn"}
                  href={`#card-${draft.kind}`}
                >
                  Review
                </a>
                <button
                  className="tiny-btn"
                  type="button"
                  disabled={published}
                  onClick={() => {
                    // Phase 3E: AI generation + POST are deferred to Phase 4C.
                    // For now we lock the button + show the user that the
                    // draft is queued. The real POST /api/build/timeline call
                    // lands when that endpoint ships.
                    setPublishStatus((prev) => ({
                      ...prev,
                      [draft.signalId]: "published",
                    }));
                  }}
                >
                  {published ? "Queued (Phase 4C)" : "Publish"}
                </button>
                <button
                  className="tiny-btn ghost"
                  type="button"
                  onClick={() => {
                    setDismissed((prev) => {
                      const next = new Set(prev);
                      next.add(draft.signalId);
                      return next;
                    });
                  }}
                >
                  Dismiss
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
