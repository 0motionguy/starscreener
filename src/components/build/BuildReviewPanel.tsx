"use client";

// BuildReviewPanel - draft editor for the selected suggested update.

import { useEffect, useState } from "react";

import type { BuildUpdateDraft } from "./build-signals";

interface BuildReviewPanelProps {
  initialDraft: BuildUpdateDraft | null;
  draftsByKey: Record<string, BuildUpdateDraft>;
  repoFullName: string;
}

const BLANK_DRAFT: BuildUpdateDraft = {
  signalId: "blank",
  kind: "readme",
  source: "-",
  confidence: 0,
  headline: "",
  short: "",
  whatChanged: "",
  whyItMatters: "",
  whatNext: "",
  tags: [],
};

function refinedCopy(value: string, suffix: string): string {
  const trimmed = value.trim();
  if (!trimmed) return suffix;
  return trimmed.endsWith(suffix) ? trimmed : `${trimmed} ${suffix}`;
}

export function BuildReviewPanel({
  initialDraft,
  draftsByKey,
  repoFullName,
}: BuildReviewPanelProps) {
  const [draft, setDraft] = useState<BuildUpdateDraft>(
    initialDraft ?? BLANK_DRAFT,
  );
  const [headline, setHeadline] = useState(draft.headline);
  const [short, setShort] = useState(draft.short);
  const [whatChanged, setWhatChanged] = useState(draft.whatChanged);
  const [whyItMatters, setWhyItMatters] = useState(draft.whyItMatters);
  const [whatNext, setWhatNext] = useState(draft.whatNext);
  const [status, setStatus] = useState<
    "idle" | "saving" | "saved" | "published"
  >("idle");

  useEffect(() => {
    function syncFromHash() {
      const hash = window.location.hash.replace("#", "");
      if (!hash) return;
      const next = draftsByKey[hash];
      if (next) loadDraft(next);
    }
    window.addEventListener("hashchange", syncFromHash);
    syncFromHash();
    return () => window.removeEventListener("hashchange", syncFromHash);
    // draftsByKey is stable for the current server render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function loadDraft(next: BuildUpdateDraft) {
    setDraft(next);
    setHeadline(next.headline);
    setShort(next.short);
    setWhatChanged(next.whatChanged);
    setWhyItMatters(next.whyItMatters);
    setWhatNext(next.whatNext);
    setStatus("idle");
  }

  function regenerate() {
    setHeadline((value) => refinedCopy(value || draft.headline, "Now easier to ship."));
    setShort((value) =>
      refinedCopy(
        value || draft.short,
        "The update is framed for builders scanning the public timeline.",
      ),
    );
    setWhatNext((value) =>
      refinedCopy(value || draft.whatNext, "Publish after one maintainer review."),
    );
    setStatus("idle");
  }

  function saveDraft() {
    setStatus("saving");
    try {
      window.localStorage.setItem(
        `trendingrepo-build-draft-${repoFullName}-${draft.signalId}`,
        JSON.stringify({
          headline,
          short,
          whatChanged,
          whyItMatters,
          whatNext,
          savedAt: new Date().toISOString(),
        }),
      );
      setStatus("saved");
    } catch {
      setStatus("idle");
    }
  }

  function publish() {
    try {
      window.localStorage.setItem(
        `trendingrepo-build-timeline-${repoFullName}-${draft.signalId}`,
        JSON.stringify({
          headline,
          short,
          whatChanged,
          whyItMatters,
          whatNext,
          publishedAt: new Date().toISOString(),
        }),
      );
    } catch {
      // The UI state still reflects the publish action.
    }
    setStatus("published");
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Build update review</h2>
        <span className="meta">user controls publish</span>
      </div>
      <div className="review-panel">
        <div className="draft-editor" id="draft-editor">
          <label className="field-label">
            Headline
            <input
              className="field"
              id="draft-headline"
              value={headline}
              onChange={(e) => setHeadline(e.target.value)}
            />
          </label>
          <label className="field-label">
            Short update
            <textarea
              className="field"
              id="draft-short"
              value={short}
              onChange={(e) => setShort(e.target.value)}
            />
          </label>
          <label className="field-label">
            What changed
            <textarea
              className="field"
              value={whatChanged}
              onChange={(e) => setWhatChanged(e.target.value)}
            />
          </label>
          <label className="field-label">
            Why it matters
            <textarea
              className="field"
              value={whyItMatters}
              onChange={(e) => setWhyItMatters(e.target.value)}
            />
          </label>
          <label className="field-label">
            What is next
            <textarea
              className="field"
              value={whatNext}
              onChange={(e) => setWhatNext(e.target.value)}
            />
          </label>
          <div className="review-actions">
            <button
              className="btn primary"
              type="button"
              disabled={status === "published"}
              onClick={publish}
            >
              {status === "published" ? "Published to Timeline" : "Publish to Timeline"}
            </button>
            <button className="btn" type="button" onClick={saveDraft}>
              {status === "saved" ? "Draft saved" : "Save Draft"}
            </button>
            <button className="btn ghost" type="button" onClick={regenerate}>
              Regenerate
            </button>
            <button
              className="btn ghost"
              type="button"
              onClick={() => loadDraft(initialDraft ?? BLANK_DRAFT)}
            >
              Reset
            </button>
          </div>
        </div>
        <aside className="source-context">
          <div className="panel-head">
            <h3>Source context</h3>
            <span className="meta">detected</span>
          </div>
          <div className="context-list">
            <div className="context-row">
              <span>Repo</span>
              <b>{repoFullName || "-"}</b>
            </div>
            <div className="context-row">
              <span>Related source</span>
              <b>{draft.source || "-"}</b>
            </div>
            <div className="context-row">
              <span>Signal</span>
              <b>{draft.kind}</b>
            </div>
            <div className="context-row">
              <span>Confidence</span>
              <b>{draft.confidence}</b>
            </div>
            <div className="context-row">
              <span>Tags</span>
              <b>{draft.tags.join(", ") || "-"}</b>
            </div>
            <div className="context-row">
              <span>Project stage</span>
              <b>Building</b>
            </div>
            <div className="context-row">
              <span>Destination</span>
              <b>Project timeline</b>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}
