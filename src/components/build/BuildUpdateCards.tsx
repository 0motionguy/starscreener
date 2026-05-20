"use client";

// BuildUpdateCards - 4-card grid of template-derived suggested updates.

import Link from "next/link";
import { useState } from "react";

import type { BuildUpdateDraft } from "./build-signals";

interface BuildUpdateCardsProps {
  drafts: BuildUpdateDraft[];
  activeKey?: string | null;
  repoFullName?: string;
}

export function BuildUpdateCards({
  drafts,
  activeKey,
  repoFullName,
}: BuildUpdateCardsProps) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [publishStatus, setPublishStatus] = useState<
    Record<string, "idle" | "published">
  >({});

  const visible = drafts.filter((d) => !dismissed.has(d.signalId)).slice(0, 4);

  if (visible.length === 0) {
    return (
      <section className="panel">
        <div className="panel-head">
          <h2>Suggested build updates</h2>
          <span className="meta">queue clean</span>
        </div>
        <div className="timeline-card" style={{ margin: 14 }}>
          <h3>All updates handled.</h3>
          <p>
            The local review queue is clear. Use the detected signals table to
            open another update.
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
                <Link
                  className={isReviewing ? "tiny-btn primary" : "tiny-btn"}
                  href={
                    repoFullName
                      ? `/build?repo=${encodeURIComponent(repoFullName)}&review=${draft.kind}#card-${draft.kind}`
                      : `?review=${draft.kind}#card-${draft.kind}`
                  }
                  data-review={draft.kind}
                  scroll={false}
                >
                  Review
                </Link>
                <button
                  className="tiny-btn"
                  type="button"
                  disabled={published}
                  onClick={() => {
                    try {
                      window.localStorage.setItem(
                        `trendingrepo-build-published-${draft.signalId}`,
                        JSON.stringify({
                          repoFullName,
                          headline: draft.headline,
                          publishedAt: new Date().toISOString(),
                        }),
                      );
                    } catch {
                      // The button state still confirms the local action.
                    }
                    setPublishStatus((prev) => ({
                      ...prev,
                      [draft.signalId]: "published",
                    }));
                  }}
                >
                  {published ? "Published" : "Publish"}
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
